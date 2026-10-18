// Model Gateway: the only module that talks to OpenRouter.
//
// Every call reads the key from Settings at call time, sends the attribution
// headers, and turns failures into GatewayError (see errors.ts). Planned
// operations (spec #1): readPage, generateStructured, generateWithWebSearch,
// checkKey. Add each one here: chat-based operations build their request
// body and go through `complete`, which picks the job's model and checks the
// answer.
import type { Job } from '../settings/models'
import type { PageOriginal } from '../store/store'
import { toDataUrl } from './dataUrl'
import { GatewayError, errorForResponse } from './errors'

export const OPENROUTER_API = 'https://openrouter.ai/api/v1'

export type KeyCheck = {
  valid: boolean
  /** The key's spend limit in USD, or null when it has none. */
  limit: number | null
  /** What is left of that limit, or null when the key has no limit. */
  limitRemaining: number | null
}

/** A Page to read: its scan and the transcription prompt (from the Prompt Builder). */
export type ReadPageRequest = {
  prompt: string
  original: PageOriginal
}

/** The assistant message of a chat completion that finished normally. */
export type Completion = {
  /** Never empty. */
  content: string
  /** message.annotations as sent (e.g. url_citation entries), or []. */
  annotations: unknown[]
}

type ChatMessage = { role: 'user' | 'system'; content: string | ContentPart[] }

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }

/** A chat completion request, without `model` (chosen from the job). */
type ChatRequest = {
  messages: ChatMessage[]
  reasoning?: { effort: 'none' | 'minimal' | 'low' | 'medium' | 'high' }
  [option: string]: unknown
}

type ChatResponse = {
  choices?: {
    finish_reason?: string | null
    error?: unknown
    message?: { content?: unknown; refusal?: unknown; annotations?: unknown }
  }[]
}

export type ModelGatewayOptions = {
  getKey: () => Promise<string | null>
  /** The model Settings currently give a job. */
  getModel: (job: Job) => Promise<string>
  /** Sent as HTTP-Referer. */
  appUrl: string
  /** Sent as X-OpenRouter-Title. */
  appTitle: string
}

export function createModelGateway(options: ModelGatewayOptions) {
  async function send(path: string, init: RequestInit = {}): Promise<unknown> {
    const key = await options.getKey()
    if (!key) throw new GatewayError('NoKey')

    let response: Response
    try {
      // Look `fetch` up on every call: MSW patches the global in tests.
      response = await fetch(`${OPENROUTER_API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': options.appUrl,
          'X-OpenRouter-Title': options.appTitle,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      })
    } catch (error) {
      throw new GatewayError('Offline', String(error))
    }

    const body: unknown = await response.json().catch(() => undefined)
    if (!response.ok) {
      throw new GatewayError(errorForResponse(response.status, body), `HTTP ${response.status}`)
    }
    if (body === undefined) throw new GatewayError('BadResponse', 'body is not JSON')
    return body
  }

  /**
   * POST /chat/completions with the job's model. A 200 only counts when the
   * model finished and said something: a mid-generation failure is
   * Unavailable; a cut-off, refused or empty answer is BadResponse.
   */
  async function complete(job: Job, request: ChatRequest): Promise<Completion> {
    const model = await options.getModel(job)
    const body = (await send('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model, ...request }),
    })) as ChatResponse
    const choice = body.choices?.[0]
    if (!choice) throw new GatewayError('BadResponse', 'no choices')
    if (choice.error || choice.finish_reason === 'error') {
      throw new GatewayError('Unavailable', 'the provider failed mid-generation')
    }
    if (choice.finish_reason === 'length') throw new GatewayError('BadResponse', 'cut off (length)')
    if (choice.finish_reason === 'content_filter' || choice.message?.refusal) {
      throw new GatewayError('BadResponse', 'refused')
    }
    const content = choice.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new GatewayError('BadResponse', 'empty content')
    }
    const annotations = choice.message?.annotations
    return { content, annotations: Array.isArray(annotations) ? annotations : [] }
  }

  return {
    /**
     * Reads one Page with the vision model: its scan → Recognized Text
     * (Markdown). A photo goes as an image; a PDF Page (a single-page PDF) as
     * a file read by the model's native PDF engine.
     */
    async readPage({ prompt, original }: ReadPageRequest): Promise<string> {
      const url = await toDataUrl(original.bytes, original.mime)
      const isPdf = original.mime === 'application/pdf'
      const scan: ContentPart = isPdf
        ? { type: 'file', file: { filename: 'page.pdf', file_data: url } }
        : { type: 'image_url', image_url: { url } }
      const { content } = await complete('readPages', {
        reasoning: { effort: 'low' },
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, scan] }],
        ...(isPdf && { plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }] }),
      })
      return content.trim()
    },

    /** Is the saved key accepted, and what is its spend limit? (GET /key) */
    async checkKey(): Promise<KeyCheck> {
      let body: unknown
      try {
        body = await send('/key')
      } catch (error) {
        if (error instanceof GatewayError && error.kind === 'InvalidKey') {
          return { valid: false, limit: null, limitRemaining: null }
        }
        throw error
      }
      const data = (body as { data?: { limit?: unknown; limit_remaining?: unknown } } | null)?.data
      if (!data) throw new GatewayError('BadResponse', 'no data in /key response')
      return {
        valid: true,
        limit: typeof data.limit === 'number' ? data.limit : null,
        limitRemaining: typeof data.limit_remaining === 'number' ? data.limit_remaining : null,
      }
    },
  }
}

export type ModelGateway = ReturnType<typeof createModelGateway>

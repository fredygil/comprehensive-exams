// Fake OpenRouter, at the HTTP level (MSW).
//
// Every test starts with `defaultHandlers` (a working key with no spend
// limit). Override per test with `server.use(openRouter.key.invalid())` etc.
// Any request MSW has no handler for fails the test (onUnhandledFrame:
// 'error' in setup.ts), so a new kind of call needs a handler here first.
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { bytesOfDataUrl } from './files'

export const OPENROUTER = 'https://openrouter.ai/api/v1'

type KeyLimit = { limit: number; limitRemaining: number }

function keyBody(limit: KeyLimit | null) {
  return {
    data: {
      label: 'sk-or-v1-abc...xyz',
      limit: limit?.limit ?? null,
      limit_remaining: limit?.limitRemaining ?? null,
      limit_reset: null,
      usage: 0,
      is_free_tier: false,
      is_management_key: false,
    },
  }
}

/** OpenRouter's error body: { error: { code, message, metadata? } }. */
function failure(status: number, message: string, metadata?: Record<string, unknown>) {
  return HttpResponse.json({ error: { code: status, message, ...(metadata && { metadata }) } }, { status })
}

/** A chat completion as OpenRouter returns it. */
export function chatCompletion(content: string, choice: { finish_reason?: string } = {}) {
  return {
    id: 'gen-test-1',
    object: 'chat.completion',
    created: 1792300000,
    model: 'test/model',
    choices: [
      {
        index: 0,
        finish_reason: choice.finish_reason ?? 'stop',
        message: { role: 'assistant', content, refusal: null },
      },
    ],
    usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 },
  }
}

type ChatBody = { messages?: { content?: unknown }[] }

/** Is this chat completion a Page being read (it carries the Page's image or file)? */
function isReadPage(body: ChatBody) {
  return (body.messages ?? []).some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part: { type?: string }) => part.type === 'image_url' || part.type === 'file'),
  )
}

/** The scan a page-reading request carries: its type and bytes. */
export type SentOriginal = { mime: string; bytes: Uint8Array }

type SentPart = { type?: string; image_url?: { url: string }; file?: { file_data: string } }

function sentOriginal(body: ChatBody): SentOriginal {
  const parts = (body.messages ?? []).flatMap((message) =>
    Array.isArray(message.content) ? (message.content as SentPart[]) : [],
  )
  const part = parts.find((p) => p.type === 'image_url' || p.type === 'file')
  const url = part?.image_url?.url ?? part?.file?.file_data ?? ''
  return { mime: url.slice('data:'.length, url.indexOf(';')), bytes: bytesOfDataUrl(url) }
}

/**
 * A handler for one kind of chat completion. Other chat completions fall
 * through to the next handler, so tests can script page reading, quizzes and
 * Explainers side by side.
 */
function chatHandler(
  matches: (body: ChatBody) => boolean,
  respond: (body: ChatBody) => Response | Promise<Response>,
) {
  return http.post(`${OPENROUTER}/chat/completions`, async ({ request }) => {
    const body = (await request.clone().json()) as ChatBody
    return matches(body) ? respond(body) : undefined
  })
}

/**
 * One scripted answer to a request: Markdown text (a 200), an HTTP status
 * (OpenRouter's error body), 'offline' (fetch rejects) or 'hang' (never
 * answered while the test runs, e.g. a Page still being read when the app
 * closes).
 */
export type Answer = string | number | 'offline' | 'hang'

// Requests left hanging, answered as network errors after each test (setup.ts)
// so nothing waits forever.
let hanging: (() => void)[] = []

/** Called by setup.ts after each test. */
export function releaseHangingRequests() {
  for (const release of hanging) release()
  hanging = []
}

function answer(answer: Answer): Response | Promise<Response> {
  if (answer === 'offline') return HttpResponse.error()
  if (answer === 'hang') {
    return new Promise((resolve) => hanging.push(() => resolve(HttpResponse.error())))
  }
  if (typeof answer === 'number') return failure(answer, `HTTP ${answer}`)
  return HttpResponse.json(chatCompletion(answer))
}

/** Scripted responses, grouped by endpoint or operation. Each returns an MSW handler. */
export const openRouter = {
  /** Page reading: chat completions that carry a Page's image or file. */
  readPage: {
    /** Every Page reads as this Markdown. */
    text: (markdown: string) =>
      chatHandler(isReadPage, () => HttpResponse.json(chatCompletion(markdown))),
    /** Each Page in turn reads as the next Markdown in the list (the last one repeats). */
    texts: (markdowns: string[]) => {
      let next = 0
      return chatHandler(isReadPage, () =>
        HttpResponse.json(chatCompletion(markdowns[Math.min(next++, markdowns.length - 1)])),
      )
    },
    /**
     * Each Page reads as whatever `read` makes of the scan it was sent
     * (decoded from its image or file part), e.g. to tell PDF Pages apart.
     */
    as: (read: (original: SentOriginal) => string | Promise<string>) =>
      chatHandler(isReadPage, async (body) => HttpResponse.json(chatCompletion(await read(sentOriginal(body))))),
    /**
     * Each reading request in turn gets the next answer in the list (the last
     * one repeats), e.g. `inTurn(['Página uno.', 400, 'hang'])`. Pages are
     * read one at a time, in order, so this scripts each Page's outcome.
     */
    inTurn: (answers: Answer[]) => {
      let next = 0
      return chatHandler(isReadPage, () => answer(answers[Math.min(next++, answers.length - 1)]))
    },
    status: (status: number, metadata?: Record<string, unknown>) =>
      chatHandler(isReadPage, () => failure(status, `HTTP ${status}`, metadata)),
    /** A 200 cut off by the token budget: finish_reason "length" and no text. */
    cutOff: () =>
      chatHandler(isReadPage, () => HttpResponse.json(chatCompletion('', { finish_reason: 'length' }))),
    /** The network is down (fetch rejects). */
    offline: () => chatHandler(isReadPage, () => HttpResponse.error()),
  },

  key: {
    /** A working key. Pass a limit to fake a key with a spend cap. */
    valid: (limit: KeyLimit | null = null) =>
      http.get(`${OPENROUTER}/key`, () => HttpResponse.json(keyBody(limit))),
    invalid: () =>
      http.get(`${OPENROUTER}/key`, () => failure(401, 'User not found.')),
    status: (status: number, metadata?: Record<string, unknown>) =>
      http.get(`${OPENROUTER}/key`, () => failure(status, `HTTP ${status}`, metadata)),
    /** The network is down (fetch rejects). */
    offline: () => http.get(`${OPENROUTER}/key`, () => HttpResponse.error()),
  },
}

export const defaultHandlers = [openRouter.key.valid()]

export const server = setupServer(...defaultHandlers)

/**
 * Every request sent to OpenRouter in the current test, in order. Use it only
 * for the deliberate checks the spec allows (headers, Language and Grade
 * Level in a prompt), never to assert on internals.
 */
export const openRouterRequests: Request[] = []

server.events.on('request:start', ({ request }) => {
  if (request.url.startsWith(OPENROUTER)) openRouterRequests.push(request.clone())
})

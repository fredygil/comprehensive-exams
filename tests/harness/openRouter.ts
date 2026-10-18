// Fake OpenRouter, at the HTTP level (MSW).
//
// Every test starts with `defaultHandlers` (a working key with no spend
// limit). Override per test with `server.use(openRouter.key.invalid())` etc.
// Any request MSW has no handler for fails the test (onUnhandledFrame:
// 'error' in setup.ts), so a new kind of call needs a handler here first.
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

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
export function chatCompletion(
  content: string,
  choice: { finish_reason?: string; annotations?: unknown[] } = {},
) {
  return {
    id: 'gen-test-1',
    object: 'chat.completion',
    created: 1792300000,
    model: 'test/model',
    choices: [
      {
        index: 0,
        finish_reason: choice.finish_reason ?? 'stop',
        message: {
          role: 'assistant',
          content,
          refusal: null,
          ...(choice.annotations && { annotations: choice.annotations }),
        },
      },
    ],
    usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 },
  }
}

type ChatBody = {
  messages?: { content?: unknown }[]
  response_format?: { type?: string; json_schema?: { name?: string } }
  tools?: { type?: string }[]
}

/** Is this chat completion a Page being read (it carries the Page's image or file)? */
function isReadPage(body: ChatBody) {
  return (body.messages ?? []).some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part: { type?: string }) => part.type === 'image_url' || part.type === 'file'),
  )
}

/** Is this chat completion asking for structured JSON (a json_schema response format)? */
function isStructured(body: ChatBody) {
  return body.response_format?.type === 'json_schema'
}

/** Is this chat completion an answer researched with the web search server tool? */
function isWebSearch(body: ChatBody) {
  return (body.tools ?? []).some((tool) => tool.type === 'openrouter:web_search')
}

/** A web source as OpenRouter cites it in message.annotations. */
export function urlCitation(url: string, title: string) {
  return { type: 'url_citation', url_citation: { url, title, content: '…', start_index: 0, end_index: 10 } }
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

  /** Structured JSON: chat completions with a json_schema response format. */
  structured: {
    /** Answers with this value, as the JSON string models put in `content`. */
    json: (value: unknown) =>
      chatHandler(isStructured, () => HttpResponse.json(chatCompletion(JSON.stringify(value)))),
    /** Answers with this exact content, e.g. text that is not valid JSON. */
    raw: (content: string) =>
      chatHandler(isStructured, () => HttpResponse.json(chatCompletion(content))),
    status: (status: number, metadata?: Record<string, unknown>) =>
      chatHandler(isStructured, () => failure(status, `HTTP ${status}`, metadata)),
    offline: () => chatHandler(isStructured, () => HttpResponse.error()),
  },

  /** Answers researched on the web: chat completions with the openrouter:web_search tool. */
  webSearch: {
    /** Answers with this Markdown and these message.annotations (e.g. `urlCitation(url, title)`). */
    answer: (markdown: string, annotations: unknown[] = []) =>
      chatHandler(isWebSearch, () => HttpResponse.json(chatCompletion(markdown, { annotations }))),
    /** Each request in turn gets the next answer in the list (the last one repeats). */
    answers: (answers: { markdown: string; annotations?: unknown[] }[]) => {
      let next = 0
      return chatHandler(isWebSearch, () => {
        const { markdown, annotations = [] } = answers[Math.min(next++, answers.length - 1)]
        return HttpResponse.json(chatCompletion(markdown, { annotations }))
      })
    },
    status: (status: number, metadata?: Record<string, unknown>) =>
      chatHandler(isWebSearch, () => failure(status, `HTTP ${status}`, metadata)),
    offline: () => chatHandler(isWebSearch, () => HttpResponse.error()),
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

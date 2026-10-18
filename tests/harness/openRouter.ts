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

function failure(status: number, message: string) {
  return HttpResponse.json({ error: { message, code: status } }, { status })
}

/** Scripted responses, grouped by endpoint. Each returns an MSW handler. */
export const openRouter = {
  key: {
    /** A working key. Pass a limit to fake a key with a spend cap. */
    valid: (limit: KeyLimit | null = null) =>
      http.get(`${OPENROUTER}/key`, () => HttpResponse.json(keyBody(limit))),
    invalid: () =>
      http.get(`${OPENROUTER}/key`, () => failure(401, 'User not found.')),
    status: (status: number) =>
      http.get(`${OPENROUTER}/key`, () => failure(status, `HTTP ${status}`)),
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

// Model Gateway: the only module that talks to OpenRouter.
//
// Every call reads the key from Settings at call time, sends the attribution
// headers, and turns failures into GatewayError (see errors.ts). Planned
// operations (spec #1): readPage, generateStructured, generateWithWebSearch,
// checkKey. Add each one here, next to `send`.
import { GatewayError, errorForResponse } from './errors'

export const OPENROUTER_API = 'https://openrouter.ai/api/v1'

export type KeyCheck = {
  valid: boolean
  /** The key's spend limit in USD, or null when it has none. */
  limit: number | null
  /** What is left of that limit, or null when the key has no limit. */
  limitRemaining: number | null
}

export type ModelGatewayOptions = {
  getKey: () => Promise<string | null>
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

  return {
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

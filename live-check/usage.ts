// Token usage of the live check's calls. The Model Gateway doesn't return
// usage (the app has no use for it), but it looks up the global `fetch` on
// every call, so the live check watches the responses there instead of
// changing the Gateway.

/** What one chat completion used, from its response's `usage`. */
export type CallUsage = {
  promptTokens: number
  completionTokens: number
  /** Reasoning tokens, part of the completion tokens. */
  reasoningTokens: number
  /** USD, when OpenRouter reported it. */
  cost: number | null
  /** The model and provider that answered. */
  model: string
  provider: string
}

type UsageBody = {
  model?: unknown
  provider?: unknown
  usage?: {
    prompt_tokens?: unknown
    completion_tokens?: unknown
    cost?: unknown
    completion_tokens_details?: { reasoning_tokens?: unknown } | null
  } | null
}

const numberOr = <T>(value: unknown, fallback: T) => (typeof value === 'number' ? value : fallback)
const textOr = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)

function usageOf(body: UsageBody | undefined): CallUsage | null {
  const usage = body?.usage
  if (!usage) return null
  return {
    promptTokens: numberOr(usage.prompt_tokens, 0),
    completionTokens: numberOr(usage.completion_tokens, 0),
    reasoningTokens: numberOr(usage.completion_tokens_details?.reasoning_tokens, 0),
    cost: numberOr(usage.cost, null),
    model: textOr(body.model, '?'),
    provider: textOr(body.provider, '?'),
  }
}

/**
 * Replaces the global `fetch` with one that remembers the usage of the last
 * chat completion that answered, until `restore()`. `take()` returns it and
 * forgets it, so a failed call reports none.
 */
export function watchUsage() {
  const realFetch = globalThis.fetch
  let last: CallUsage | null = null

  globalThis.fetch = async (input, init) => {
    const response = await realFetch(input, init)
    const url = input instanceof Request ? input.url : String(input)
    if (url.endsWith('/chat/completions') && response.ok) {
      last = usageOf(await response.clone().json().catch(() => undefined))
    }
    return response
  }

  return {
    take(): CallUsage | null {
      const usage = last
      last = null
      return usage
    },
    restore() {
      globalThis.fetch = realFetch
    },
  }
}

// Domain errors from the Model Gateway. Callers branch on `kind`; the UI shows
// `strings.errors[kind]`.
export type GatewayErrorKind =
  | 'NoKey' // no key saved in Settings; nothing was sent
  | 'InvalidKey' // 401
  | 'NoCredit' // 402, or 403 from a spent cap
  | 'Offline' // the request never reached OpenRouter
  | 'RateLimited' // 408 / 429, or 402 from the in-flight budget; retryable
  | 'Unavailable' // 5xx, retryable
  | 'BadResponse' // anything else, or a response we can't understand

const RETRYABLE: ReadonlySet<GatewayErrorKind> = new Set(['RateLimited', 'Unavailable', 'Offline'])

export class GatewayError extends Error {
  readonly kind: GatewayErrorKind

  constructor(kind: GatewayErrorKind, detail?: string) {
    super(detail ? `${kind}: ${detail}` : kind)
    this.name = 'GatewayError'
    this.kind = kind
  }

  /** Trying again later, unchanged, may succeed. */
  get retryable() {
    return RETRYABLE.has(this.kind)
  }
}

// Spend caps OpenRouter reports in error.metadata.limit_source. A spent cap can
// come back as 402 or 403 (OpenRouter "errors and debugging" docs).
const SPENT_LIMITS = new Set([
  'openrouter_credits',
  'openrouter_key_limit',
  'openrouter_workspace_budget',
  'openrouter_guardrail_budget',
])

/**
 * Maps a failed HTTP response to a domain error. `body` is the parsed error
 * body if there was one: { error: { code, message, metadata? } }.
 */
export function errorForResponse(status: number, body: unknown): GatewayErrorKind {
  const limitSource = (body as { error?: { metadata?: { limit_source?: unknown } } } | null)?.error
    ?.metadata?.limit_source
  if (status === 401) return 'InvalidKey'
  if (status === 402 && limitSource === 'openrouter_in_flight_budget') return 'RateLimited'
  if (status === 402) return 'NoCredit'
  if (status === 403 && typeof limitSource === 'string' && SPENT_LIMITS.has(limitSource)) {
    return 'NoCredit'
  }
  if (status === 408 || status === 429) return 'RateLimited'
  if (status >= 500) return 'Unavailable'
  return 'BadResponse'
}

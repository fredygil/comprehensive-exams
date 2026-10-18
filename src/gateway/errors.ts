// Domain errors from the Model Gateway. Callers branch on `kind`; the UI shows
// `strings.errors[kind]`.
export type GatewayErrorKind =
  | 'NoKey' // no key saved in Settings; nothing was sent
  | 'InvalidKey' // 401
  | 'NoCredit' // 402
  | 'Offline' // the request never reached OpenRouter
  | 'RateLimited' // 429, retryable
  | 'Unavailable' // 408 / 5xx, retryable
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

export function errorForStatus(status: number): GatewayErrorKind {
  if (status === 401) return 'InvalidKey'
  if (status === 402) return 'NoCredit'
  if (status === 429) return 'RateLimited'
  if (status === 408 || status >= 500) return 'Unavailable'
  return 'BadResponse'
}

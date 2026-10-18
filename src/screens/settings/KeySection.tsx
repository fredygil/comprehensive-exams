import { useState, type FormEvent } from 'react'
import { useServices } from '../../app/services'
import { Section } from '../../components/Section'
import { GatewayError } from '../../gateway/errors'
import type { KeyCheck } from '../../gateway/gateway'
import { strings } from '../../strings'

type Status =
  | { kind: 'idle' }
  | { kind: 'saved' }
  | { kind: 'checking' }
  | { kind: 'checked'; result: KeyCheck }
  | { kind: 'failed'; message: string }

export function KeySection({ savedKey }: { savedKey: string | null }) {
  const { store, gateway } = useServices()
  const [key, setKey] = useState(savedKey ?? '')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const text = strings.settings.key

  async function save(event: FormEvent) {
    event.preventDefault()
    await store.saveOpenRouterKey(key)
    setStatus({ kind: 'saved' })
  }

  // "Probar clave" checks what is in the field, so it saves it first.
  async function check() {
    await store.saveOpenRouterKey(key)
    setStatus({ kind: 'checking' })
    try {
      setStatus({ kind: 'checked', result: await gateway.checkKey() })
    } catch (error) {
      const message =
        error instanceof GatewayError ? strings.errors[error.kind] : strings.errors.BadResponse
      setStatus({ kind: 'failed', message })
    }
  }

  return (
    <Section title={text.title}>
      <form onSubmit={save} className="stack">
        <label>
          {text.label}
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setStatus({ kind: 'idle' })
            }}
          />
        </label>
        <p className="hint">{text.help}</p>
        <div className="row">
          <button type="submit">{text.save}</button>
          <button
            type="button"
            onClick={check}
            disabled={!key.trim() || status.kind === 'checking'}
          >
            {text.check}
          </button>
        </div>
        <div role="status">
          <KeyStatus status={status} hasKey={!!key.trim()} />
        </div>
      </form>
    </Section>
  )
}

function KeyStatus({ status, hasKey }: { status: Status; hasKey: boolean }) {
  const text = strings.settings.key
  switch (status.kind) {
    case 'idle':
      return null
    case 'saved':
      return <p>{hasKey ? text.saved : text.removed}</p>
    case 'checking':
      return <p>{text.checking}</p>
    case 'failed':
      return <p className="error">{status.message}</p>
    case 'checked': {
      const { valid, limit, limitRemaining } = status.result
      if (!valid) return <p className="error">{text.invalid}</p>
      return (
        <>
          <p className="ok">{text.valid}</p>
          {limit === null ? (
            <p>{text.noLimit}</p>
          ) : (
            <>
              <p>{text.limit(limit)}</p>
              {limitRemaining !== null && <p>{text.remaining(limitRemaining)}</p>}
            </>
          )}
        </>
      )
    }
  }
}

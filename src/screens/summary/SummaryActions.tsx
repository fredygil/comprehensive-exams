import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useServices } from '../../app/services'
import { NeedsKeyNotice, useHasKey } from '../../components/NeedsKey'
import { GatewayError } from '../../gateway/errors'
import type { Exam, SummaryState } from '../../store/store'
import { strings } from '../../strings'
import { generateSummary } from '../../studyAids/summary'

/**
 * Generating or regenerating an Exam's Summary, with what the Student needs
 * to know first: Outdated, Pages not included, no key, nothing read yet.
 * `state` is the Summary as it stands (null when there is none yet).
 */
export function SummaryActions(props: {
  exam: Exam
  state: SummaryState | null
  onGenerated?: () => void
}) {
  const { exam, state } = props
  const services = useServices()
  const scope = useLiveQuery(() => services.store.examText(exam.id), [services.store, exam.id])
  const hasKey = useHasKey()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const text = strings.summary
  const readPages = scope?.readPages ?? 0
  // Needs the key and at least one read Page (spec: availability rules).
  const ready = hasKey === true && readPages > 0
  // With a Summary, what it left out; without one, what a new one would.
  const notIncluded = state ? state.notIncluded : (scope?.notIncluded ?? 0)

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      if (await generateSummary(services, exam.id)) props.onGenerated?.()
    } catch (error) {
      if (!(error instanceof GatewayError)) throw error
      setError(strings.errors[error.kind])
    } finally {
      setGenerating(false)
    }
  }

  // Shown whole once loaded, so a button found enabled can be tapped.
  if (scope === undefined || hasKey === undefined) return null

  return (
    <div className="stack">
      {state?.outdated && (
        <p className="notice" role="status">
          {text.outdated}
        </p>
      )}
      {readPages > 0 && notIncluded > 0 && <p className="notice">{text.notIncluded(notIncluded)}</p>}
      {hasKey === false && <NeedsKeyNotice />}
      {readPages === 0 && <p className="hint">{text.needsReadPage}</p>}
      <div className="row">
        <button type="button" onClick={generate} disabled={!ready || generating}>
          {state ? text.regenerate : text.generate}
        </button>
      </div>
      {generating && <p role="status">{text.generating}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  )
}

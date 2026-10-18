import { useState } from 'react'
import { useServices } from '../../app/services'
import { Section } from '../../components/Section'
import { GatewayError } from '../../gateway/errors'
import type { Exam } from '../../store/store'
import { strings } from '../../strings'
import { suggestTopics } from '../../studyAids/explainers'

/** An Exam's Explainers, and making a new one from a suggested or typed topic. */
export function ExplainersSection({ exam }: { exam: Exam }) {
  const services = useServices()
  const [topics, setTopics] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const text = strings.explainers

  async function suggest() {
    setBusy(true)
    setError(null)
    try {
      setTopics(await suggestTopics(services, exam))
    } catch (error) {
      if (!(error instanceof GatewayError)) throw error
      setError(strings.errors[error.kind])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title={text.title}>
      <div className="stack">
        <p className="hint">{text.help}</p>
        <div className="row">
          <button type="button" onClick={suggest} disabled={busy}>
            {busy ? text.suggesting : text.suggest}
          </button>
        </div>
        {topics && (
          <div role="group" aria-label={text.suggested} className="row">
            {topics.map((topic) => (
              <button key={topic} type="button">
                {topic}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </Section>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useServices } from '../../app/services'
import { NeedsKeyNotice, useHasKey } from '../../components/NeedsKey'
import { Section } from '../../components/Section'
import { GatewayError } from '../../gateway/errors'
import type { Exam } from '../../store/store'
import { strings } from '../../strings'
import { generateExplainer, suggestTopics } from '../../studyAids/explainers'

/** What the section is waiting for from the model, if anything. */
type Pending = { kind: 'topics' } | { kind: 'explainer'; topic: string } | null

/** An Exam's Explainers, and making a new one from a suggested or typed topic. */
export function ExplainersSection({ exam }: { exam: Exam }) {
  const services = useServices()
  const navigate = useNavigate()
  const explainers = useLiveQuery(() => services.store.examExplainers(exam.id), [services.store, exam.id])
  const scope = useLiveQuery(() => services.store.examText(exam.id), [services.store, exam.id])
  const hasKey = useHasKey()
  const [topics, setTopics] = useState<string[] | null>(null)
  const [topic, setTopic] = useState('')
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<string | null>(null)
  const text = strings.explainers
  // Needs the key and at least one read Page (spec: availability rules).
  const ready = hasKey === true && (scope?.readPages ?? 0) > 0
  const busy = pending !== null

  /** Runs a model call, showing a failure as its Spanish message; nothing is lost on failure. */
  async function run(waitingFor: NonNullable<Pending>, call: () => Promise<void>) {
    setPending(waitingFor)
    setError(null)
    try {
      await call()
    } catch (error) {
      if (!(error instanceof GatewayError)) throw error
      setError(strings.errors[error.kind])
    } finally {
      setPending(null)
    }
  }

  const suggest = () =>
    run({ kind: 'topics' }, async () => setTopics(await suggestTopics(services, exam)))

  const explain = (topic: string) =>
    run({ kind: 'explainer', topic }, async () => {
      const id = await generateExplainer(services, exam, topic)
      if (id !== null) navigate(`/examenes/${exam.id}/explicaciones/${id}`)
    })

  function submit(event: FormEvent) {
    event.preventDefault()
    const typed = topic.trim()
    if (ready && typed) void explain(typed)
  }

  return (
    <Section title={text.title}>
      <div className="stack">
        {explainers?.length === 0 && <p>{text.empty}</p>}
        {explainers && explainers.length > 0 && (
          <ul className="material-list" aria-label={text.list}>
            {explainers.map((explainer) => (
              <li key={explainer.id}>
                <Link to={`/examenes/${exam.id}/explicaciones/${explainer.id}`}>{explainer.topic}</Link>
              </li>
            ))}
          </ul>
        )}
        {/* Shown once loaded, so a button found enabled can be tapped. */}
        {scope !== undefined && hasKey !== undefined && (
          <>
            <p className="hint">{text.help}</p>
            {hasKey === false && <NeedsKeyNotice />}
            {scope.readPages === 0 && <p className="hint">{text.needsReadPage}</p>}
            <div className="row">
              <button type="button" onClick={suggest} disabled={!ready || busy}>
                {pending?.kind === 'topics' ? text.suggesting : text.suggest}
              </button>
            </div>
            {topics && (
              <div role="group" aria-label={text.suggested} className="row">
                {topics.map((suggested) => (
                  <button key={suggested} type="button" onClick={() => explain(suggested)} disabled={!ready || busy}>
                    {suggested}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={submit} className="row">
              <label>
                {text.topic}
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder={text.topicPlaceholder}
                />
              </label>
              <button type="submit" disabled={!ready || busy || !topic.trim()}>
                {text.create}
              </button>
            </form>
            {pending?.kind === 'explainer' && <p role="status">{text.creating(pending.topic)}</p>}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </Section>
  )
}

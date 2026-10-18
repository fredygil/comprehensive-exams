import { useLiveQuery } from 'dexie-react-hooks'
import { Link, Navigate, useParams } from 'react-router'
import { useServices } from '../../app/services'
import { RichText } from '../../components/RichText'
import { Section } from '../../components/Section'
import { strings } from '../../strings'

/** One Explainer: its text and the web sources it was written from. Works offline. */
export function ExplainerScreen() {
  const { store } = useServices()
  const params = useParams()
  const examId = Number(params.examId)
  const explainerId = Number(params.explainerId)
  const loaded = useLiveQuery(async () => {
    const explainer = await store.getExplainer(explainerId)
    const exam = explainer && explainer.examId === examId ? await store.getExam(examId) : null
    return explainer && exam ? { explainer, exam } : null
  }, [store, examId, explainerId])

  // Render the screen whole once loaded, so its heading means it is ready.
  if (loaded === undefined) return null
  if (loaded === null) return <Navigate to={`/examenes/${examId}`} replace />

  const { explainer, exam } = loaded
  const text = strings.explainers
  return (
    <main className="screen">
      <header>
        <Link to={`/examenes/${exam.id}`}>{text.backToExam(exam.subject.name)}</Link>
        <h1>{explainer.topic}</h1>
      </header>
      <article className="card">
        <RichText>{explainer.markdown}</RichText>
      </article>
      <Section title={text.sources}>
        {explainer.sources.length === 0 ? (
          <p className="hint">{text.noSources}</p>
        ) : (
          <ol className="source-list">
            {explainer.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </main>
  )
}

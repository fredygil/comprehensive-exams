import { useLiveQuery } from 'dexie-react-hooks'
import { Link, Navigate, useParams } from 'react-router'
import { useServices } from '../../app/services'
import { RichText } from '../../components/RichText'
import { strings } from '../../strings'
import { SummaryActions } from './SummaryActions'

/** An Exam's Summary, to read (offline too), with Outdated and "Regenerar" above it. */
export function SummaryScreen() {
  const { store } = useServices()
  const examId = Number(useParams().examId)
  const loaded = useLiveQuery(
    async () => ({ exam: await store.getExam(examId), state: await store.examSummary(examId) }),
    [store, examId],
  )
  const text = strings.summary

  // Render the screen whole once loaded, so its heading means it is ready.
  if (loaded === undefined) return null
  const { exam, state } = loaded
  if (!exam) return <Navigate to="/" replace />
  if (!state) return <Navigate to={`/examenes/${exam.id}`} replace />

  return (
    <main className="screen">
      <header>
        <Link to={`/examenes/${exam.id}`}>{text.backToExam(exam.subject.name)}</Link>
        <h1>{text.heading(exam.subject.name)}</h1>
      </header>
      <SummaryActions exam={exam} state={state} />
      <article className="card">
        <RichText>{state.summary.markdown}</RichText>
      </article>
    </main>
  )
}

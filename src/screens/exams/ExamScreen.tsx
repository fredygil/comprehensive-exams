import { useLiveQuery } from 'dexie-react-hooks'
import { Navigate, useParams } from 'react-router'
import { useServices } from '../../app/services'
import { strings } from '../../strings'

/** The study space for one Exam. Later tickets add Material, Study Aids and quizzes here. */
export function ExamScreen() {
  const { store } = useServices()
  const examId = Number(useParams().examId)
  const exam = useLiveQuery(() => store.getExam(examId), [store, examId])

  // Render the screen whole once loaded, so its heading means it is ready.
  if (exam === undefined) return null
  if (exam === null) return <Navigate to="/" replace />

  return (
    <main className="screen">
      <header>
        <h1>{exam.subject.name}</h1>
        <p className="hint">{strings.periods.label(exam.period)}</p>
      </header>
    </main>
  )
}

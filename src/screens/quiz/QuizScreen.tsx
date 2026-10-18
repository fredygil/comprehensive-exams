import { useLiveQuery } from 'dexie-react-hooks'
import { Link, Navigate, useParams } from 'react-router'
import { useServices } from '../../app/services'
import { strings } from '../../strings'
import { QuizQuestions } from './QuizQuestions'
import { QuizResults } from './QuizResults'

/** A Practice Quiz: its Questions one per screen while In Progress; once Submitted, its Score and Feedback. */
export function QuizScreen() {
  const { store } = useServices()
  const params = useParams()
  const examId = Number(params.examId)
  const quizId = Number(params.quizId)
  const loaded = useLiveQuery(async () => {
    const found = await store.getQuiz(quizId)
    const exam = found && found.quiz.examId === examId ? await store.getExam(examId) : null
    return found && exam ? { ...found, exam } : null
  }, [store, examId, quizId])

  // Render the screen whole once loaded, so its heading means it is ready.
  if (loaded === undefined) return null
  if (loaded === null) return <Navigate to={`/examenes/${examId}`} replace />

  const { exam, quiz, questions } = loaded
  return (
    <main className="screen">
      <header>
        <Link to={`/examenes/${exam.id}`}>{strings.material.backToExam(exam.subject.name)}</Link>
        <h1>{strings.quiz.kinds[quiz.kind]}</h1>
      </header>
      {quiz.state === 'inProgress' ? (
        <QuizQuestions quiz={quiz} questions={questions} />
      ) : (
        <QuizResults quiz={quiz} questions={questions} />
      )}
    </main>
  )
}

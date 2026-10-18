import { useLiveQuery } from 'dexie-react-hooks'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useServices } from '../../app/services'
import { examConfirmation } from '../../components/confirmations'
import { DeleteWithConfirmation } from '../../components/DeleteWithConfirmation'
import { strings } from '../../strings'
import { ExplainersSection } from '../explainers/ExplainersSection'
import { MaterialSection } from '../material/MaterialSection'
import { MistakesQuizSection } from '../quiz/MistakesQuizSection'
import { QuizSection } from '../quiz/QuizSection'
import { ExamDateSection } from './ExamDateSection'

/** The study space for one Exam. Later tickets add Material, Study Aids and quizzes here. */
export function ExamScreen() {
  const { store } = useServices()
  const navigate = useNavigate()
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
      <ExamDateSection exam={exam} />
      <MaterialSection exam={exam} />
      <ExplainersSection exam={exam} />
      <QuizSection exam={exam} />
      <MistakesQuizSection exam={exam} />
      <div>
        <DeleteWithConfirmation
          action={strings.deletion.exam.action}
          load={async () => {
            const deletion = await store.examDeletion(exam.id)
            return deletion && examConfirmation(deletion)
          }}
          onDelete={async () => {
            await store.deleteExam(exam.id)
            navigate('/', { replace: true })
          }}
        />
      </div>
    </main>
  )
}

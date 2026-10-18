import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { useServices } from '../../app/services'
import type { Exam } from '../../store/store'
import { strings } from '../../strings'
import { DiscardQuiz } from './DiscardQuiz'

/** The Exam's In Progress quizzes, to pick up where she left off. Nothing while there are none. */
export function InProgressQuizzes({ exam }: { exam: Exam }) {
  const { store } = useServices()
  const quizzes = useLiveQuery(() => store.inProgressQuizzes(exam.id), [store, exam.id])
  const text = strings.quizzes

  if (!quizzes?.length) return null
  return (
    <ul className="material-list" aria-label={text.inProgress.list}>
      {quizzes.map((quiz) => (
        <li key={quiz.id}>
          <span>
            {text.inProgress.started(text.when(quiz.createdAt))}
            {' · '}
            {text.answered(quiz.items.filter((item) => item.chosenIndex !== null).length, quiz.items.length)}
          </span>
          <Link to={`/examenes/${exam.id}/quiz/${quiz.id}`}>{text.inProgress.resume}</Link>
          <DiscardQuiz quizId={quiz.id} />
        </li>
      ))}
    </ul>
  )
}

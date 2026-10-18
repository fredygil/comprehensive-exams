import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { useServices } from '../../app/services'
import { Section } from '../../components/Section'
import type { Exam } from '../../store/store'
import { strings } from '../../strings'

/**
 * "Historial": every Submitted quiz on the Exam, newest first, each opening
 * its review. Submitted quizzes are kept for good, so there is no delete.
 */
export function QuizHistorySection({ exam }: { exam: Exam }) {
  const { store } = useServices()
  const quizzes = useLiveQuery(() => store.submittedQuizzes(exam.id), [store, exam.id])
  const text = strings.quizzes.history

  return (
    <Section title={text.title}>
      {quizzes?.length === 0 && <p>{text.empty}</p>}
      {quizzes && quizzes.length > 0 && (
        <ul className="material-list" aria-label={text.list}>
          {quizzes.map((quiz) => (
            <li key={quiz.id}>
              <span>
                <Link to={`/examenes/${exam.id}/quiz/${quiz.id}`}>{strings.quizzes.when(quiz.submittedAt!)}</Link>
                {' · '}
                {text.questions(quiz.items.length)}
                {' · '}
                {strings.quiz.results.score(quiz.score ?? 0, quiz.items.length)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

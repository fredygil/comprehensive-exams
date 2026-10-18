import { Link } from 'react-router'
import type { Exam } from '../store/store'

/** A Period's Exams, in the order given, each linking to its Exam screen. */
export function ExamList({ exams }: { exams: Exam[] }) {
  return (
    <ul className="exam-list">
      {exams.map((exam) => (
        <li key={exam.id}>
          <Link to={`/examenes/${exam.id}`}>
            <span className="exam-subject">{exam.subject.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// What a delete confirmation says, built from what the Store says will be lost.
import type {
  ExamDeletion,
  ExamPartCount,
  Explainer,
  MaterialDeletion,
  PracticeQuiz,
  SubjectDeletion,
} from '../store/store'
import { strings } from '../strings'

export type Confirmation = {
  title: string
  /** One line per thing that will be lost, starting with the thing itself. */
  losses: string[]
  /** An extra line under the list, e.g. "No tiene exámenes." */
  note?: string
}

/** "3 materiales". strings.deletion.examParts has a line for every ExamPartKind (`satisfies` checks it). */
function partLine(part: ExamPartCount): string {
  return strings.deletion.examParts[part.kind](part.count)
}

function examItem({ exam }: ExamDeletion) {
  return strings.deletion.exam.item(exam.subject.name, strings.periods.label(exam.period))
}

/** The confirmation for deleting an Exam: the Exam, then each kind of data under it. */
export function examConfirmation(deletion: ExamDeletion): Confirmation {
  return {
    title: strings.deletion.exam.title,
    losses: [examItem(deletion), ...deletion.parts.map(partLine)],
  }
}

/** The confirmation for deleting a Material: the Material, then its Pages. */
export function materialConfirmation({ material, pages }: MaterialDeletion): Confirmation {
  const text = strings.deletion.material
  return { title: text.title, losses: [text.item(material.name), text.pages(pages)] }
}

/** The confirmation for deleting a Subject: the Subject, then each of its Exams and what they hold. */
export function subjectConfirmation({ subject, exams }: SubjectDeletion): Confirmation {
  const text = strings.deletion.subject
  return {
    title: text.title(subject.name),
    losses: [
      text.item(subject.name),
      ...exams.map((exam) => {
        const parts = exam.parts.map(partLine)
        return parts.length ? `${examItem(exam)}: ${parts.join(', ')}` : examItem(exam)
      }),
    ],
    note: exams.length === 0 ? text.noExams : undefined,
  }
}

/** The confirmation for deleting one Explainer. */
export function explainerConfirmation(explainer: Explainer): Confirmation {
  const text = strings.deletion.explainer
  return { title: text.title, losses: [text.item(explainer.topic)] }
}

/** The confirmation for discarding an In Progress quiz: the quiz, then how much of it she answered. */
export function quizDiscardConfirmation(quiz: PracticeQuiz): Confirmation {
  const text = strings.quizzes
  const answered = quiz.items.filter((item) => item.chosenIndex !== null).length
  return {
    title: text.discard.title,
    losses: [text.discard.item(text.when(quiz.createdAt)), text.answered(answered, quiz.items.length)],
  }
}

// A delete button that first asks, naming everything that will be lost.
//
//   <DeleteWithConfirmation
//     action={strings.deletion.exam.action}
//     load={async () => {
//       const deletion = await store.examDeletion(id)
//       return deletion && examConfirmation(deletion)
//     }}
//     onDelete={() => store.deleteExam(id)}
//   />
//
// What an Exam holds comes from the Store (`examParts` in src/store/store.ts),
// so a ticket that stores data under an Exam extends both confirmations there.
import { useId, useState } from 'react'
import type { ExamDeletion, ExamPartCount, SubjectDeletion } from '../store/store'
import { strings } from '../strings'

export type Confirmation = {
  title: string
  /** One line per thing that will be lost, starting with the thing itself. */
  losses: string[]
  /** An extra line under the list, e.g. "No tiene exámenes." */
  note?: string
}

export function DeleteWithConfirmation(props: {
  action: string
  /** What to show in the confirmation; null if there is nothing to delete any more. */
  load: () => Promise<Confirmation | null>
  onDelete: () => Promise<void>
}) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const titleId = useId()
  const bodyId = useId()
  const text = strings.deletion

  if (!confirmation) {
    return (
      <button type="button" className="danger-outline" onClick={async () => setConfirmation(await props.load())}>
        {props.action}
      </button>
    )
  }

  return (
    <div role="alertdialog" aria-labelledby={titleId} aria-describedby={bodyId} className="confirm">
      <h2 id={titleId}>{confirmation.title}</h2>
      <div id={bodyId}>
        <p>{text.willLose}</p>
        <ul>
          {confirmation.losses.map((loss) => (
            <li key={loss}>{loss}</li>
          ))}
        </ul>
        {confirmation.note && <p>{confirmation.note}</p>}
        <p>{text.cannotUndo}</p>
      </div>
      <div className="row">
        <button type="button" className="danger" onClick={props.onDelete}>
          {text.confirm}
        </button>
        <button type="button" autoFocus onClick={() => setConfirmation(null)}>
          {text.cancel}
        </button>
      </div>
    </div>
  )
}

/** "3 materiales". strings.deletion.examParts has a line for every ExamPartKind (`satisfies` checks it). */
function partLine(part: ExamPartCount): string {
  // Widened so this compiles while ExamPartKind is still `never` (no kinds yet).
  const lines: Record<string, (count: number) => string> = strings.deletion.examParts
  return lines[part.kind](part.count)
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

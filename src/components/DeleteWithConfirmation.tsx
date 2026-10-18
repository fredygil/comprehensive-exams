// A delete button that first asks, naming everything that will be lost.
//
//   <DeleteWithConfirmation
//     action={strings.deletion.exam.action}
//     load={async () => {
//       const deletion = await store.examDeletion(id)
//       return deletion && examConfirmation(deletion)   // from ./confirmations
//     }}
//     onDelete={() => store.deleteExam(id)}
//   />
//
// What an Exam holds comes from the Store (`examParts` in src/store/store.ts),
// so a ticket that stores data under an Exam extends both confirmations there.
import { useId, useState } from 'react'
import { strings } from '../strings'
import type { Confirmation } from './confirmations'

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

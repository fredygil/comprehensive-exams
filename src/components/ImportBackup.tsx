// Picking a backup file and restoring it, after a confirmation that it
// replaces everything on the tablet. Used in Settings and on the first-run
// screen (a new or reset tablet).
import { useId, useState, type ChangeEvent } from 'react'
import { useServices } from '../app/services'
import { InvalidBackupError, type BackupContents } from '../backup/backup'
import { strings } from '../strings'

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'confirming'; contents: BackupContents }
  | { kind: 'restoring' }
  | { kind: 'failed'; message: string }

function failureMessage(error: unknown) {
  return error instanceof InvalidBackupError ? strings.backup.invalid[error.reason] : strings.backup.failed
}

export function ImportBackup({ onRestored }: { onRestored: () => void }) {
  const { backup } = useServices()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const titleId = useId()
  const bodyId = useId()
  const text = strings.backup

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setStatus({ kind: 'checking' })
    try {
      setStatus({ kind: 'confirming', contents: await backup.read(file) })
    } catch (error) {
      setStatus({ kind: 'failed', message: failureMessage(error) })
    }
  }

  async function restore(contents: BackupContents) {
    setStatus({ kind: 'restoring' })
    try {
      await backup.importAll(contents)
      onRestored()
    } catch (error) {
      setStatus({ kind: 'failed', message: failureMessage(error) })
    }
  }

  if (status.kind === 'confirming') {
    return (
      <div role="alertdialog" aria-labelledby={titleId} aria-describedby={bodyId} className="confirm">
        <h2 id={titleId}>{text.confirm.title}</h2>
        <div id={bodyId}>
          <p>{text.confirm.body(status.contents.exportedAt)}</p>
          <p>{text.confirm.keepsKey}</p>
          <p>{text.confirm.cannotUndo}</p>
        </div>
        <div className="row">
          <button type="button" className="danger" onClick={() => restore(status.contents)}>
            {text.confirm.confirm}
          </button>
          <button type="button" autoFocus onClick={() => setStatus({ kind: 'idle' })}>
            {text.confirm.cancel}
          </button>
        </div>
      </div>
    )
  }

  const busy = status.kind === 'checking' || status.kind === 'restoring'
  return (
    <div className="stack">
      <label className="file-picker">
        <span className="button">{text.import}</span>
        {/* No `accept`: Android's picker greys out files of a type it doesn't know. */}
        <input type="file" disabled={busy} onChange={pick} />
      </label>
      {status.kind === 'checking' && <p role="status">{text.checking}</p>}
      {status.kind === 'restoring' && <p role="status">{text.restoring}</p>}
      {status.kind === 'failed' && <p role="alert">{status.message}</p>}
    </div>
  )
}

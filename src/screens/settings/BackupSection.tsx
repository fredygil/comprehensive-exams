import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useServices } from '../../app/services'
import { ImportBackup } from '../../components/ImportBackup'
import { Section } from '../../components/Section'
import { strings } from '../../strings'

type ExportStatus =
  | { kind: 'idle' }
  | { kind: 'exporting' }
  | { kind: 'exported'; fileName: string }
  | { kind: 'failed' }

export function BackupSection() {
  const { backup, saveFile } = useServices()
  const navigate = useNavigate()
  const [status, setStatus] = useState<ExportStatus>({ kind: 'idle' })
  const text = strings.backup

  async function exportAll() {
    setStatus({ kind: 'exporting' })
    try {
      const file = await backup.exportAll()
      saveFile(file)
      setStatus({ kind: 'exported', fileName: file.name })
    } catch (error) {
      console.error('Backup export failed:', error)
      setStatus({ kind: 'failed' })
    }
  }

  return (
    <Section title={text.title}>
      <p className="hint">{text.help}</p>
      <div className="row">
        <button type="button" onClick={exportAll} disabled={status.kind === 'exporting'}>
          {text.export}
        </button>
      </div>
      <div role="status">
        {status.kind === 'exporting' && text.exporting}
        {status.kind === 'exported' && text.exported(status.fileName)}
      </div>
      {status.kind === 'failed' && <p role="alert">{text.exportFailed}</p>}
      <p className="hint">{text.importHelp}</p>
      {/* Everything on the screen may have changed: start again from home. */}
      <ImportBackup onRestored={() => navigate('/', { state: { restored: true } })} />
    </Section>
  )
}

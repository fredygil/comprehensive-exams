import { useLiveQuery } from 'dexie-react-hooks'
import { useServices } from '../../app/services'
import type { Student } from '../../store/store'
import { strings } from '../../strings'
import { BackupSection } from './BackupSection'
import { KeySection } from './KeySection'
import { ModelsSection } from './ModelsSection'
import { StudentSection } from './StudentSection'

export function SettingsScreen({ student }: { student: Student }) {
  const { store } = useServices()
  const settings = useLiveQuery(() => store.getSettings(), [store])
  // Render the screen whole once loaded, so its heading means it is ready.
  if (!settings) return null

  return (
    <main className="screen">
      <h1>{strings.settings.title}</h1>
      <div className="settings-grid">
        <div className="stack">
          <StudentSection student={student} />
          <KeySection savedKey={settings.openRouterKey} />
        </div>
        <div className="stack">
          <ModelsSection savedModels={settings.models} />
          <BackupSection />
        </div>
      </div>
    </main>
  )
}

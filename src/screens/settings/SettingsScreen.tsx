import { useLiveQuery } from 'dexie-react-hooks'
import { useServices } from '../../app/services'
import type { Student } from '../../store/store'
import { strings } from '../../strings'
import { KeySection } from './KeySection'
import { ModelsSection } from './ModelsSection'
import { StudentSection } from './StudentSection'

export function SettingsScreen({ student }: { student: Student }) {
  const { store } = useServices()
  const settings = useLiveQuery(() => store.getSettings(), [store])

  return (
    <main className="screen">
      <h1>{strings.settings.title}</h1>
      <StudentSection student={student} />
      {settings && (
        <>
          <KeySection savedKey={settings.openRouterKey} />
          <ModelsSection savedModels={settings.models} />
        </>
      )}
    </main>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { useServices } from '../../app/services'
import { strings } from '../../strings'
import { NewSubjectSection } from './NewSubjectSection'
import { SubjectSection } from './SubjectSection'

export function SubjectsScreen() {
  const { store } = useServices()
  const subjects = useLiveQuery(() => store.listSubjects(), [store])
  // Render the screen whole once loaded, so its heading means it is ready.
  if (!subjects) return null

  return (
    <main className="screen">
      <h1>{strings.subjects.title}</h1>
      {subjects.length === 0 && <p className="hint">{strings.subjects.empty}</p>}
      {subjects.map((subject) => (
        <SubjectSection key={subject.id} subject={subject} />
      ))}
      <NewSubjectSection />
    </main>
  )
}

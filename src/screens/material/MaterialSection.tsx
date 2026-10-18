import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { useServices } from '../../app/services'
import { Section } from '../../components/Section'
import {
  ACCEPTED_TYPES,
  UnreadablePdfError,
  UnsupportedFileError,
  materialFromFile,
} from '../../pageSplitter/pageSplitter'
import type { Exam, MaterialDraft } from '../../store/store'
import { strings } from '../../strings'

/** An Exam's Material: the list, and "Agregar material" with the system file picker. */
export function MaterialSection({ exam }: { exam: Exam }) {
  const { store, readingQueue } = useServices()
  const materials = useLiveQuery(() => store.examMaterials(exam.id), [store, exam.id])
  const [rejected, setRejected] = useState<string[]>([])
  const text = strings.material

  async function add(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    // Let the same file be picked again later.
    event.target.value = ''
    const drafts: MaterialDraft[] = []
    const problems: string[] = []
    for (const file of files) {
      try {
        drafts.push(await materialFromFile(file))
      } catch (error) {
        if (error instanceof UnsupportedFileError) problems.push(text.unsupported(error.fileName))
        else if (error instanceof UnreadablePdfError) problems.push(text.unreadablePdf(error.fileName))
        else throw error
      }
    }
    setRejected(problems)
    if (drafts.length === 0) return
    await store.addMaterials(exam.id, drafts)
    readingQueue.start()
  }

  return (
    <Section title={text.title}>
      <div className="stack">
        {materials?.length === 0 && <p>{text.empty}</p>}
        {materials && materials.length > 0 && (
          <ul className="material-list">
            {materials.map((material) => (
              <li key={material.id}>
                <Link to={`/examenes/${exam.id}/material/${material.id}`}>{material.name}</Link>
              </li>
            ))}
          </ul>
        )}
        <label className="file-picker">
          <span className="button">{text.add}</span>
          <input type="file" multiple accept={ACCEPTED_TYPES.join(',')} onChange={add} />
        </label>
        <p className="hint">{text.addHint}</p>
        {rejected.length > 0 && (
          <div role="alert">
            {rejected.map((problem) => (
              <p key={problem} className="error">
                {problem}
              </p>
            ))}
          </div>
        )}
      </div>
    </Section>
  )
}

import { useState, type FormEvent } from 'react'
import { useServices } from '../../app/services'
import { subjectConfirmation } from '../../components/confirmations'
import { DeleteWithConfirmation } from '../../components/DeleteWithConfirmation'
import { LanguageSelect } from '../../components/LanguageSelect'
import { Section } from '../../components/Section'
import type { Subject } from '../../store/store'
import { strings } from '../../strings'

export function SubjectSection({ subject }: { subject: Subject }) {
  const { store } = useServices()
  const [name, setName] = useState(subject.name)
  const [language, setLanguage] = useState(subject.language)
  const text = strings.subjects
  const changed = name.trim() !== subject.name || language !== subject.language

  async function save(event: FormEvent) {
    event.preventDefault()
    await store.updateSubject(subject.id, { name, language })
  }

  return (
    <Section title={subject.name}>
      <form onSubmit={save} className="stack">
        <label>
          {text.name}
          <input value={name} required onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {text.language}
          <LanguageSelect value={language} onChange={setLanguage} />
        </label>
        <div className="row">
          <button type="submit" disabled={!name.trim() || !changed}>
            {text.save}
          </button>
        </div>
      </form>
      <DeleteWithConfirmation
        action={strings.deletion.subject.action}
        load={async () => {
          const deletion = await store.subjectDeletion(subject.id)
          return deletion && subjectConfirmation(deletion)
        }}
        onDelete={() => store.deleteSubject(subject.id)}
      />
    </Section>
  )
}

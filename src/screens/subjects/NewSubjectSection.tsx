import { useState, type FormEvent } from 'react'
import { useServices } from '../../app/services'
import { LanguageSelect } from '../../components/LanguageSelect'
import { Section } from '../../components/Section'
import type { Language } from '../../store/store'
import { strings } from '../../strings'

export function NewSubjectSection() {
  const { store } = useServices()
  const [name, setName] = useState('')
  const [language, setLanguage] = useState<Language | ''>('')
  const text = strings.subjects

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!language) return
    await store.createSubject({ name, language })
    setName('')
    setLanguage('')
  }

  return (
    <Section title={text.new.title}>
      <form onSubmit={create} className="stack">
        <label>
          {text.name}
          <input value={name} required onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {text.language}
          <LanguageSelect value={language} onChange={setLanguage} />
        </label>
        <div className="row">
          <button type="submit" disabled={!name.trim() || !language}>
            {text.new.create}
          </button>
        </div>
      </form>
    </Section>
  )
}

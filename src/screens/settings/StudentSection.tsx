import { useState, type FormEvent } from 'react'
import { useServices } from '../../app/services'
import { Section } from '../../components/Section'
import type { Student } from '../../store/store'
import { strings } from '../../strings'
import { GradeLevelSelect } from '../../components/GradeLevelSelect'

export function StudentSection({ student }: { student: Student }) {
  const { store } = useServices()
  const [name, setName] = useState(student.name)
  const [gradeLevel, setGradeLevel] = useState(student.gradeLevel)
  const [saved, setSaved] = useState(false)
  const text = strings.settings.student

  async function save(event: FormEvent) {
    event.preventDefault()
    await store.saveStudent({ name: name.trim(), gradeLevel })
    setSaved(true)
  }

  return (
    <Section title={text.title}>
      <form onSubmit={save} className="stack">
        <label>
          {text.name}
          <input
            value={name}
            required
            onChange={(e) => {
              setName(e.target.value)
              setSaved(false)
            }}
          />
        </label>
        <label>
          {text.grade}
          <GradeLevelSelect
            value={gradeLevel}
            onChange={(grade) => {
              setGradeLevel(grade)
              setSaved(false)
            }}
          />
        </label>
        <div className="row">
          <button type="submit" disabled={!name.trim()}>
            {text.save}
          </button>
          {saved && <span role="status">{text.saved}</span>}
        </div>
      </form>
    </Section>
  )
}

import { useState, type FormEvent } from 'react'
import { useServices } from '../app/services'
import { strings } from '../strings'

export function FirstRunScreen() {
  const { store } = useServices()
  const [name, setName] = useState('')
  const [gradeLevel, setGradeLevel] = useState(strings.gradeLevels[0])

  async function start(event: FormEvent) {
    event.preventDefault()
    await store.saveStudent({ name: name.trim(), gradeLevel })
  }

  return (
    <main className="screen narrow">
      <h1>{strings.firstRun.title}</h1>
      <form onSubmit={start} className="stack">
        <label>
          {strings.firstRun.nameLabel}
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label>
          {strings.firstRun.gradeLabel}
          <GradeLevelSelect value={gradeLevel} onChange={setGradeLevel} />
        </label>
        <button type="submit" disabled={!name.trim()}>
          {strings.firstRun.start}
        </button>
      </form>
    </main>
  )
}

export function GradeLevelSelect(props: { value: number; onChange: (grade: number) => void }) {
  return (
    <select value={props.value} onChange={(e) => props.onChange(Number(e.target.value))}>
      {strings.gradeLevels.map((grade) => (
        <option key={grade} value={grade}>
          {strings.gradeLevel(grade)}
        </option>
      ))}
    </select>
  )
}

import { useState, type FormEvent } from 'react'
import { useServices } from '../../app/services'
import { ExamDate } from '../../components/ExamDate'
import { Section } from '../../components/Section'
import type { Exam } from '../../store/store'
import { strings } from '../../strings'

export function ExamDateSection({ exam }: { exam: Exam }) {
  const { store } = useServices()
  const [date, setDate] = useState(exam.examDate ?? '')
  const text = strings.exams.date

  async function save(event: FormEvent) {
    event.preventDefault()
    await store.setExamDate(exam.id, date || null)
  }

  async function clear() {
    setDate('')
    await store.setExamDate(exam.id, null)
  }

  return (
    <Section title={text.title}>
      <p>
        <ExamDate date={exam.examDate} />
      </p>
      <form onSubmit={save} className="row">
        <label>
          {text.label}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="submit" disabled={date === (exam.examDate ?? '')}>
          {text.save}
        </button>
        {exam.examDate && (
          <button type="button" onClick={clear}>
            {text.clear}
          </button>
        )}
      </form>
    </Section>
  )
}

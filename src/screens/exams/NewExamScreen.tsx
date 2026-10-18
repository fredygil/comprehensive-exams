import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useServices } from '../../app/services'
import { schoolYearOf } from '../../exams/calendar'
import { DuplicateExamError, QUARTERS, type Period, type Quarter, type Subject } from '../../store/store'
import { strings } from '../../strings'

export function NewExamScreen() {
  const { store } = useServices()
  const data = useLiveQuery(
    async () => ({ subjects: await store.listSubjects(), periods: await store.listPeriods() }),
    [store],
  )
  // Render the screen whole once loaded, so its heading means it is ready.
  if (!data) return null

  return (
    <main className="screen narrow-form">
      <h1>{strings.exams.new.title}</h1>
      {data.subjects.length === 0 ? (
        <div className="notice" role="note">
          <p>{strings.exams.new.noSubjects}</p>
          <Link to="/materias">{strings.exams.new.createSubject}</Link>
        </div>
      ) : (
        <NewExamForm subjects={data.subjects} periods={data.periods} />
      )}
    </main>
  )
}

const NEW_PERIOD = 'new'

function NewExamForm({ subjects, periods }: { subjects: Subject[]; periods: Period[] }) {
  const { store } = useServices()
  const navigate = useNavigate()
  const text = strings.exams.new
  const [subjectId, setSubjectId] = useState('')
  // The newest Period is pre-selected; with none yet, a new one is the only choice.
  const [periodChoice, setPeriodChoice] = useState(String(periods[0]?.id ?? NEW_PERIOD))
  const [schoolYearStart, setSchoolYearStart] = useState(() => schoolYearOf(new Date()))
  const [quarter, setQuarter] = useState<Quarter>(1)
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null)
  const [schoolYears] = useState(() => {
    const current = schoolYearOf(new Date())
    return [current - 1, current, current + 1]
  })

  const creatingPeriod = periodChoice === NEW_PERIOD
  const chosenPeriod = periods.find((period) => String(period.id) === periodChoice)

  async function create(event: FormEvent) {
    event.preventDefault()
    const period = creatingPeriod ? { schoolYearStart, quarter } : chosenPeriod!
    try {
      const id = await store.createExam({ subjectId: Number(subjectId), period, examDate: null })
      navigate(`/examenes/${id}`)
    } catch (error) {
      if (!(error instanceof DuplicateExamError)) throw error
      const subject = subjects.find((s) => String(s.id) === subjectId)!
      setDuplicateOf(text.duplicate(subject.name, strings.periods.label(period)))
    }
  }

  return (
    <form onSubmit={create} onChange={() => setDuplicateOf(null)} className="stack">
      <label>
        {text.subject}
        <select value={subjectId} required onChange={(e) => setSubjectId(e.target.value)}>
          <option value="" disabled>
            {text.chooseSubject}
          </option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </label>
      {periods.length > 0 && (
        <label>
          {text.period}
          <select value={periodChoice} onChange={(e) => setPeriodChoice(e.target.value)}>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {strings.periods.label(period)}
              </option>
            ))}
            <option value={NEW_PERIOD}>{text.newPeriod}</option>
          </select>
        </label>
      )}
      {creatingPeriod && (
        <div className="row">
          <label>
            {text.schoolYear}
            <select value={schoolYearStart} onChange={(e) => setSchoolYearStart(Number(e.target.value))}>
              {schoolYears.map((year) => (
                <option key={year} value={year}>
                  {strings.periods.schoolYear(year)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {text.quarter}
            <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value) as Quarter)}>
              {QUARTERS.map((q) => (
                <option key={q} value={q}>
                  {strings.periods.quarter(q)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="row">
        <button type="submit" disabled={!subjectId}>
          {text.create}
        </button>
      </div>
      {duplicateOf && (
        <p role="alert" className="error">
          {duplicateOf}
        </p>
      )}
    </form>
  )
}

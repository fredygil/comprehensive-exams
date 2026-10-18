import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useServices } from '../app/services'
import { ExamList } from '../components/ExamList'
import { NeedsKeyNotice, useHasKey } from '../components/NeedsKey'
import { Section } from '../components/Section'
import type { Student } from '../store/store'
import { strings } from '../strings'

export function HomeScreen({ student }: { student: Student }) {
  const { store } = useServices()
  const hasKey = useHasKey()
  const current = useLiveQuery(() => store.currentPeriodExams(), [store])
  const earlier = useLiveQuery(() => store.earlierPeriods(), [store])
  const [hour] = useState(() => new Date().getHours())
  // Set by Settings after a backup has been imported.
  const restored = (useLocation().state as { restored?: boolean } | null)?.restored === true

  // Render the screen whole once loaded, so its heading means it is ready.
  if (hasKey === undefined || current === undefined || earlier === undefined) return null

  return (
    <main className="screen">
      <h1>{strings.home.greeting(student.name, hour)}</h1>
      {restored && <p role="status">{strings.backup.restored}</p>}
      {!hasKey && <NeedsKeyNotice />}
      {current ? (
        <Section title={strings.periods.label(current.period)}>
          {current.exams.length > 0 ? (
            <ExamList exams={current.exams} />
          ) : (
            <p className="hint">{strings.home.noExamsInPeriod}</p>
          )}
        </Section>
      ) : (
        <p className="hint">{strings.home.noExams}</p>
      )}
      <div className="row">
        <Link className="button" to="/examenes/nuevo">
          {strings.home.newExam}
        </Link>
      </div>
      {earlier.length > 0 && (
        <Section title={strings.home.earlierPeriods}>
          <ul className="period-list">
            {earlier.map((period) => (
              <li key={period.id}>
                <Link to={`/periodos/${period.id}`}>{strings.periods.label(period)}</Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </main>
  )
}

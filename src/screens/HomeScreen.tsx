import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router'
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
  const [hour] = useState(() => new Date().getHours())

  // Render the screen whole once loaded, so its heading means it is ready.
  if (hasKey === undefined || current === undefined) return null

  return (
    <main className="screen">
      <h1>{strings.home.greeting(student.name, hour)}</h1>
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
    </main>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import { useServices } from '../../app/services'
import { Section } from '../../components/Section'
import type { Exam } from '../../store/store'
import { strings } from '../../strings'
import { SummaryActions } from './SummaryActions'

export const summaryPath = (examId: number) => `/examenes/${examId}/resumen`

/** The Exam's Summary on the Exam screen: a link to read it, and (re)generating it. */
export function SummarySection({ exam }: { exam: Exam }) {
  const { store } = useServices()
  const navigate = useNavigate()
  const state = useLiveQuery(() => store.examSummary(exam.id), [store, exam.id])
  const text = strings.summary

  return (
    <Section title={text.title}>
      <div className="stack">
        <p className="hint">{text.help}</p>
        {state && (
          <p>
            <Link to={summaryPath(exam.id)}>{text.open}</Link>
          </p>
        )}
        {state !== undefined && (
          <SummaryActions exam={exam} state={state} onGenerated={() => navigate(summaryPath(exam.id))} />
        )}
      </div>
    </Section>
  )
}

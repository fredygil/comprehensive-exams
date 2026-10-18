import { useLiveQuery } from 'dexie-react-hooks'
import { Navigate, useParams } from 'react-router'
import { useServices } from '../app/services'
import { ExamList } from '../components/ExamList'
import { strings } from '../strings'

/** One Period (usually an earlier one) and its Exams. */
export function PeriodScreen() {
  const { store } = useServices()
  const periodId = Number(useParams().periodId)
  const data = useLiveQuery(
    async () => {
      const period = await store.getPeriod(periodId)
      return period ? { period, exams: await store.periodExams(periodId) } : null
    },
    [store, periodId],
  )

  // Render the screen whole once loaded, so its heading means it is ready.
  if (data === undefined) return null
  if (data === null) return <Navigate to="/" replace />

  return (
    <main className="screen">
      <h1>{strings.periods.label(data.period)}</h1>
      {data.exams.length > 0 ? (
        <ExamList exams={data.exams} />
      ) : (
        <p className="hint">{strings.home.noExamsInPeriod}</p>
      )}
    </main>
  )
}

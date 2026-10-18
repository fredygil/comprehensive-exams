import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useServices } from '../../app/services'
import { NeedsKeyNotice, useHasKey } from '../../components/NeedsKey'
import { Section } from '../../components/Section'
import { GatewayError, type GatewayErrorKind } from '../../gateway/errors'
import type { Exam } from '../../store/store'
import { strings } from '../../strings'
import { InProgressQuizzes } from './InProgressQuizzes'

const COUNTS = Array.from({ length: 20 }, (_, i) => i + 1)
const DEFAULT_COUNT = 10

/** "Practicar" on the Exam screen: how many Questions, then a new Practice Quiz. */
export function QuizSection({ exam }: { exam: Exam }) {
  const { store, quizMaker } = useServices()
  const navigate = useNavigate()
  const hasKey = useHasKey()
  const hasReadPages = useLiveQuery(() => store.examHasReadPages(exam.id), [store, exam.id])
  const [count, setCount] = useState(DEFAULT_COUNT)
  const [creating, setCreating] = useState(false)
  const [failure, setFailure] = useState<GatewayErrorKind | null>(null)
  const text = strings.quiz

  async function start(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    setFailure(null)
    try {
      const quizId = await quizMaker.createPracticeQuiz(exam.id, { count })
      navigate(`/examenes/${exam.id}/quiz/${quizId}`)
    } catch (error) {
      if (!(error instanceof GatewayError)) throw error
      setFailure(error.kind)
      setCreating(false)
    }
  }

  return (
    <Section title={text.section}>
      {hasReadPages !== undefined && hasKey !== undefined && (
        <div className="stack">
          <InProgressQuizzes exam={exam} />
          <form onSubmit={start} className="row">
            <label>
              {text.count}
              <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
                {COUNTS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={!hasReadPages || !hasKey || creating}>
              {text.start}
            </button>
          </form>
          {creating && (
            <p role="status" className="hint">
              {text.creating}
            </p>
          )}
          {failure && (
            <p role="alert" className="error">
              {strings.errors[failure]}
            </p>
          )}
          {!hasReadPages && <p className="hint">{text.needsReadPages}</p>}
          {hasKey === false && <NeedsKeyNotice />}
        </div>
      )}
    </Section>
  )
}

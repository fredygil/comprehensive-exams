import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useServices } from '../../app/services'
import { NeedsKeyNotice, useHasKey } from '../../components/NeedsKey'
import { Section } from '../../components/Section'
import { GatewayError, type GatewayErrorKind } from '../../gateway/errors'
import { examTextOf, type Exam } from '../../store/store'
import { strings } from '../../strings'
import { InProgressQuizzes } from './InProgressQuizzes'

const COUNTS = Array.from({ length: 20 }, (_, i) => i + 1)
const DEFAULT_COUNT = 10

/**
 * "Practicar" on the Exam screen: how many Questions and, when the Exam has
 * several Materials, which ones (all by default), then a new Practice Quiz.
 * It warns how many Pages in scope are left out because they aren't read.
 */
export function QuizSection({ exam }: { exam: Exam }) {
  const { store, quizMaker } = useServices()
  const navigate = useNavigate()
  const hasKey = useHasKey()
  const examText = useLiveQuery(() => store.examText(exam.id), [store, exam.id])
  const materials = examText?.materials
  const [count, setCount] = useState(DEFAULT_COUNT)
  // Left-out Materials rather than chosen ones, so Material added meanwhile is included.
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set())
  const [creating, setCreating] = useState(false)
  const [failure, setFailure] = useState<GatewayErrorKind | null>(null)
  const text = strings.quiz

  const hasReadPages = examText && examText.readPages > 0
  const chosen = examTextOf(materials?.filter(({ material }) => !excluded.has(material.id)) ?? [])
  const noneChosen = chosen.materials.length === 0 && excluded.size > 0
  const chosenReadPages = chosen.readPages
  const notIncluded = chosen.notIncluded

  function toggle(materialId: number) {
    const next = new Set(excluded)
    if (!next.delete(materialId)) next.add(materialId)
    setExcluded(next)
  }

  async function start(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    setFailure(null)
    try {
      const materialIds = excluded.size ? chosen.materials.map(({ material }) => material.id) : undefined
      const quizId = await quizMaker.createPracticeQuiz(exam.id, { count, materialIds })
      if (quizId === null) setCreating(false)
      else navigate(`/examenes/${exam.id}/quiz/${quizId}`)
    } catch (error) {
      if (!(error instanceof GatewayError)) throw error
      setFailure(error.kind)
      setCreating(false)
    }
  }

  return (
    <Section title={text.section}>
      {materials !== undefined && hasKey !== undefined && (
        <div className="stack">
          <InProgressQuizzes exam={exam} />
          {materials.length > 1 && (
            <fieldset className="material-picker">
              <legend>{text.materials}</legend>
              {materials.map(({ material }) => (
                <label key={material.id}>
                  <input
                    type="checkbox"
                    checked={!excluded.has(material.id)}
                    onChange={() => toggle(material.id)}
                  />
                  {material.name}
                </label>
              ))}
            </fieldset>
          )}
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
            <button type="submit" disabled={chosenReadPages === 0 || !hasKey || creating}>
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
          {hasReadPages && notIncluded > 0 && <p className="notice">{text.notIncluded(notIncluded)}</p>}
          {!hasReadPages && <p className="hint">{text.needsReadPages}</p>}
          {noneChosen && <p className="hint">{text.needsMaterial}</p>}
          {hasReadPages && !noneChosen && chosenReadPages === 0 && (
            <p className="hint">{text.needsReadChosen}</p>
          )}
          {hasKey === false && <NeedsKeyNotice />}
        </div>
      )}
    </Section>
  )
}

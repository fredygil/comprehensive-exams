import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useServices } from '../../app/services'
import { Section } from '../../components/Section'
import { MAX_QUESTIONS } from '../../quizMaker/quizMaker'
import type { Exam } from '../../store/store'
import { strings } from '../../strings'

const DEFAULT_COUNT = 10

/**
 * "Quiz de errores" on the Exam screen, only while the Exam has Mistakes:
 * how many of them (up to 20), then a Mistakes Quiz. It needs no key and
 * no network, since its Questions already exist.
 */
export function MistakesQuizSection({ exam }: { exam: Exam }) {
  const { store, quizMaker } = useServices()
  const navigate = useNavigate()
  const mistakes = useLiveQuery(() => store.mistakesFor(exam.id), [store, exam.id])
  const [chosen, setChosen] = useState<number | null>(null)
  const text = strings.quiz.mistakes

  if (!mistakes?.length) return null
  const max = Math.min(MAX_QUESTIONS, mistakes.length)
  const count = Math.min(chosen ?? DEFAULT_COUNT, max)

  async function start(event: FormEvent) {
    event.preventDefault()
    const quizId = await quizMaker.createMistakesQuiz(exam.id, count)
    navigate(`/examenes/${exam.id}/quiz/${quizId}`)
  }

  return (
    <Section title={text.section}>
      <div className="stack">
        <p>{text.count(mistakes.length)}</p>
        <form onSubmit={start} className="row">
          <label>
            {text.howMany}
            <select value={count} onChange={(event) => setChosen(Number(event.target.value))}>
              {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">{text.start}</button>
        </form>
      </div>
    </Section>
  )
}

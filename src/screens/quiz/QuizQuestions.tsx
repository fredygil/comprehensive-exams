import { useId, useState } from 'react'
import { useServices } from '../../app/services'
import { RichText } from '../../components/RichText'
import type { PracticeQuiz, Question } from '../../store/store'
import { strings } from '../../strings'

/**
 * An In Progress quiz: one Question per screen, like a paper test. She can
 * go back and change any answer until she submits; every answer is saved
 * as soon as she taps it.
 */
export function QuizQuestions({ quiz, questions }: { quiz: PracticeQuiz; questions: Question[] }) {
  const { quizSession } = useServices()
  // Where she left off; every move is saved so the quiz resumes there.
  const [position, setPosition] = useState(quiz.currentPosition ?? 0)
  const headingId = useId()
  const promptId = useId()
  const text = strings.quiz
  const question = questions[position]
  const chosenIndex = quiz.items[position].chosenIndex
  const last = questions.length - 1

  const answered = quiz.items.filter((item) => item.chosenIndex !== null).length
  // How many are unanswered while she is asked whether to submit anyway.
  const [unanswered, setUnanswered] = useState<number | null>(null)

  function goTo(to: number) {
    setPosition(to)
    void quizSession.goTo(quiz.id, to)
  }

  /** Submits at once if every Question is answered; otherwise asks first. */
  async function submit() {
    // From the Store, not `quiz`: an answer tapped just before may not show here yet.
    const left = await quizSession.unanswered(quiz.id)
    if (left > 0) setUnanswered(left)
    else await quizSession.submit(quiz.id)
  }

  return (
    <section aria-labelledby={headingId} className="card stack">
      <h2 id={headingId}>{text.questionOf(position + 1, questions.length)}</h2>
      <div id={promptId}>
        <RichText>{question.prompt}</RichText>
      </div>
      <div role="radiogroup" aria-labelledby={promptId} className="options">
        {question.options.map((option, i) => (
          <label key={`${question.id}-${i}`} className="option">
            <input
              type="radio"
              name={`question-${question.id}`}
              checked={chosenIndex === i}
              onChange={() => void quizSession.answer(quiz.id, position, i)}
            />
            <RichText>{option}</RichText>
          </label>
        ))}
      </div>
      <p className="hint">{strings.quizzes.answered(answered, questions.length)}</p>
      <div className="row">
        <button type="button" disabled={position === 0} onClick={() => goTo(position - 1)}>
          {text.previous}
        </button>
        <button type="button" disabled={position === last} onClick={() => goTo(position + 1)}>
          {text.next}
        </button>
        <button type="submit" onClick={() => void submit()}>
          {text.submit}
        </button>
      </div>
      {unanswered !== null && (
        <UnansweredWarning
          unanswered={unanswered}
          onSubmit={() => void quizSession.submit(quiz.id)}
          onCancel={() => setUnanswered(null)}
        />
      )}
    </section>
  )
}

/** Asked before submitting with unanswered Questions, which count as wrong. */
function UnansweredWarning(props: { unanswered: number; onSubmit: () => void; onCancel: () => void }) {
  const titleId = useId()
  const bodyId = useId()
  const text = strings.quizzes.unanswered
  return (
    <div role="alertdialog" aria-labelledby={titleId} aria-describedby={bodyId} className="confirm">
      <h2 id={titleId}>{text.title}</h2>
      <p id={bodyId}>{text.message(props.unanswered)}</p>
      <div className="row">
        <button type="button" onClick={props.onSubmit}>
          {text.submit}
        </button>
        <button type="button" autoFocus onClick={props.onCancel}>
          {text.keepAnswering}
        </button>
      </div>
    </div>
  )
}

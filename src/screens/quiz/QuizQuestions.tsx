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

  function goTo(to: number) {
    setPosition(to)
    void quizSession.goTo(quiz.id, to)
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
      <div className="row">
        <button type="button" disabled={position === 0} onClick={() => goTo(position - 1)}>
          {text.previous}
        </button>
        <button type="button" disabled={position === last} onClick={() => goTo(position + 1)}>
          {text.next}
        </button>
        <button type="submit" onClick={() => void quizSession.submit(quiz.id)}>
          {text.submit}
        </button>
      </div>
    </section>
  )
}

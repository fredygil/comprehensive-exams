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
  const [position, setPosition] = useState(0)
  const promptId = useId()
  const text = strings.quiz
  const question = questions[position]
  const chosenIndex = quiz.items[position].chosenIndex
  const last = questions.length - 1

  return (
    <section aria-labelledby={promptId} className="card stack">
      <h2>{text.questionOf(position + 1, questions.length)}</h2>
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
        <button type="button" disabled={position === 0} onClick={() => setPosition(position - 1)}>
          {text.previous}
        </button>
        <button type="button" disabled={position === last} onClick={() => setPosition(position + 1)}>
          {text.next}
        </button>
        <button type="submit" onClick={() => void quizSession.submit(quiz.id)}>
          {text.submit}
        </button>
      </div>
    </section>
  )
}

import { useId, useState } from 'react'
import { RichText } from '../../components/RichText'
import type { PracticeQuiz, Question } from '../../store/store'
import { strings } from '../../strings'

/** An In Progress quiz: one Question per screen, with its four options. */
export function QuizQuestions({ quiz, questions }: { quiz: PracticeQuiz; questions: Question[] }) {
  const [position] = useState(0)
  const promptId = useId()
  const text = strings.quiz
  const question = questions[position]

  return (
    <section aria-labelledby={promptId} className="card stack">
      <h2>{text.questionOf(position + 1, questions.length)}</h2>
      <div id={promptId}>
        <RichText>{question.prompt}</RichText>
      </div>
      <div role="radiogroup" aria-labelledby={promptId} className="options">
        {question.options.map((option, i) => (
          <label key={i} className="option">
            <input type="radio" name={`question-${question.id}`} value={i} />
            <RichText>{option}</RichText>
          </label>
        ))}
      </div>
    </section>
  )
}

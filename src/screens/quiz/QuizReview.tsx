import { RichText } from '../../components/RichText'
import { Section } from '../../components/Section'
import type { PracticeQuiz, Question } from '../../store/store'
import { strings } from '../../strings'

/** "Todas las preguntas" of a Submitted quiz: each Question, her answer and the correct option. */
export function QuizReview({ quiz, questions }: { quiz: PracticeQuiz; questions: Question[] }) {
  const text = strings.quiz.results
  const review = strings.quizzes.review

  return (
    <Section title={review.title}>
      <ol className="feedback-list">
        {questions.map((question, i) => {
          const chosenIndex = quiz.items[i].chosenIndex
          const right = chosenIndex === question.correctIndex
          return (
            <li key={question.id} className="feedback">
              <h3>
                {text.question(i + 1)} · {right ? review.right : review.wrong}
              </h3>
              <RichText>{question.prompt}</RichText>
              <div className={`answer ${right ? 'right' : 'wrong'}`}>
                <span className="label">{text.chosen}</span>{' '}
                {chosenIndex === null ? text.unanswered : <RichText>{question.options[chosenIndex]}</RichText>}
              </div>
              <div className="answer right">
                <span className="label">{text.correct}</span>{' '}
                <RichText>{question.options[question.correctIndex]}</RichText>
              </div>
            </li>
          )
        })}
      </ol>
    </Section>
  )
}

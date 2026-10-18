import { Section } from '../../components/Section'
import { RichText } from '../../components/RichText'
import { feedbackOf } from '../../quizSession/quizSession'
import type { PracticeQuiz, Question } from '../../store/store'
import { strings } from '../../strings'

/** A Submitted quiz: the Score, then Feedback for every Question answered wrong. */
export function QuizResults({ quiz, questions }: { quiz: PracticeQuiz; questions: Question[] }) {
  const text = strings.quiz.results
  const feedback = feedbackOf({ quiz, questions })

  return (
    <>
      <Section title={text.title}>
        <p className="score">{text.score(quiz.score ?? 0, questions.length)}</p>
        {feedback.length === 0 && <p>{text.allRight}</p>}
      </Section>
      {feedback.length > 0 && (
        <Section title={text.wrong}>
          <ol className="feedback-list">
            {feedback.map(({ number, question, chosen, correct }) => (
              <li key={question.id} className="feedback">
                <h3>{text.question(number)}</h3>
                <RichText>{question.prompt}</RichText>
                <div className="answer wrong">
                  <span className="label">{text.chosen}</span>{' '}
                  {chosen === null ? text.unanswered : <RichText>{chosen}</RichText>}
                </div>
                <div className="answer right">
                  <span className="label">{text.correct}</span> <RichText>{correct}</RichText>
                </div>
                <RichText>{question.explanation}</RichText>
                <p className="hint">
                  {text.material} {question.sourceMaterialName}
                </p>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </>
  )
}

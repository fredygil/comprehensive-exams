// Quiz Session: a Practice Quiz from In Progress to Submitted.
//
// Answers are saved in the Store as soon as they change, so a quiz survives
// the app closing. Submitting scores the quiz from the answers and the
// Questions already stored: no network is needed. Feedback is worked out
// from the same records whenever a Submitted quiz is shown.
import type { Question, QuizWithQuestions, Store } from '../store/store'

/** What a Student sees for one Question she got wrong. */
export type Feedback = {
  /** 1-based position in the quiz. */
  number: number
  question: Question
  /** Her option, or null if she left it unanswered. */
  chosen: string | null
  correct: string
}

/** Questions answered correctly; unanswered ones count as wrong. */
export function scoreOf({ quiz, questions }: QuizWithQuestions): number {
  return quiz.items.filter((item, i) => item.chosenIndex === questions[i].correctIndex).length
}

/** Feedback for every Question answered wrong (or left unanswered), in quiz order. */
export function feedbackOf({ quiz, questions }: QuizWithQuestions): Feedback[] {
  return quiz.items.flatMap((item, i) => {
    const question = questions[i]
    if (item.chosenIndex === question.correctIndex) return []
    return [
      {
        number: i + 1,
        question,
        chosen: item.chosenIndex === null ? null : question.options[item.chosenIndex],
        correct: question.options[question.correctIndex],
      },
    ]
  })
}

export function createQuizSession({ store }: { store: Store }) {
  return {
    /** Saves (or changes) the answer to the Question at `position` while the quiz is In Progress. */
    async answer(quizId: number, position: number, chosenIndex: number) {
      await store.answerQuizQuestion(quizId, position, chosenIndex)
    },

    /** Remembers the Question she is on, so the quiz resumes there. */
    async goTo(quizId: number, position: number) {
      await store.moveInQuiz(quizId, position)
    },

    /** Throws away an In Progress quiz, so she can start fresh. */
    async discard(quizId: number) {
      await store.discardQuiz(quizId)
    },

    /** Scores the quiz and makes it Submitted. Works offline. */
    async submit(quizId: number) {
      await store.submitQuiz(quizId, scoreOf)
    },
  }
}

export type QuizSession = ReturnType<typeof createQuizSession>

// Store: Practice Quizzes and Mistakes Quizzes, their Questions and answers
// (for the Quiz Maker and the Quiz Session).
import { canStoreUnder, type ExamPart, type StoreContext } from './db'
import type {
  MistakeChange,
  MistakesQuizItem,
  PracticeQuiz,
  Question,
  QuestionDraft,
  QuizItem,
  QuizWithQuestions,
  StoreEpoch,
} from './types'

export function quizzesStore(context: StoreContext) {
  const { db } = context

  /** The quiz and its Questions, or null if there is none with that id (e.g. its Exam was deleted). */
  async function getQuiz(quizId: number): Promise<QuizWithQuestions | null> {
    const quiz = await db.quizzes.get(quizId)
    if (!quiz) return null
    const questions = await db.questions.bulkGet(quiz.items.map((item) => item.questionId))
    return { quiz, questions: questions.map((question, i) => asShown(question!, quiz.items[i])) }
  }

  /** An Exam's quizzes and their Questions. */
  const examPart: ExamPart = {
    kind: 'quizzes',
    tables: [db.quizzes, db.questions],
    count: (examId) => db.quizzes.where('examId').equals(examId).count(),
    delete: async (examIds) => {
      await db.quizzes.where('examId').anyOf(examIds).delete()
      await db.questions.where('examId').anyOf(examIds).delete()
    },
  }

  return {
    examPart,
    store: {
      /** The prompts of every Question asked so far on the Exam, oldest first (new quizzes avoid them). */
      async examQuestionPrompts(examId: number): Promise<string[]> {
        const questions = await db.questions.where('examId').equals(examId).sortBy('id')
        return questions.map((question) => question.prompt)
      },

      /**
       * Stores new Questions and an In Progress quiz of them, in that order.
       * Returns the quiz id, or null if it was dropped (the Exam is gone, or
       * everything was replaced, since `startedIn`).
       */
      async addPracticeQuiz(
        examId: number,
        questions: QuestionDraft[],
        options: { mayRepeat: boolean; startedIn: StoreEpoch },
      ): Promise<number | null> {
        return db.transaction('rw', [db.exams, db.questions, db.quizzes], async () => {
          if (!(await canStoreUnder(context, examId, options.startedIn))) return null
          const items: QuizItem[] = []
          for (const question of questions) {
            const questionId = await db.questions.add({ ...question, examId, isMistake: false })
            items.push({ questionId, chosenIndex: null })
          }
          return db.quizzes.add({
            examId,
            kind: 'practice',
            state: 'inProgress',
            items,
            score: null,
            mayRepeat: options.mayRepeat,
            createdAt: Date.now(),
            submittedAt: null,
          })
        })
      },

      /**
       * Stores an In Progress Mistakes Quiz of these existing Questions of the
       * Exam, in this order, each showing its options in its own order.
       * Returns the quiz id.
       */
      async addMistakesQuiz(examId: number, items: MistakesQuizItem[]): Promise<number> {
        return db.quizzes.add({
          examId,
          kind: 'mistakes',
          state: 'inProgress',
          items: items.map(({ questionId, optionOrder }) => ({ questionId, chosenIndex: null, optionOrder })),
          score: null,
          mayRepeat: false,
          createdAt: Date.now(),
          submittedAt: null,
        })
      },

      getQuiz,

      /** The Exam's In Progress quizzes, newest first. */
      async inProgressQuizzes(examId: number): Promise<PracticeQuiz[]> {
        const quizzes = await db.quizzes.where('examId').equals(examId).toArray()
        return quizzes
          .filter((quiz) => quiz.state === 'inProgress')
          .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
      },

      /** The Exam's Submitted quizzes, the most recently submitted first. */
      async submittedQuizzes(examId: number): Promise<PracticeQuiz[]> {
        const quizzes = await db.quizzes.where('examId').equals(examId).toArray()
        return quizzes
          .filter((quiz) => quiz.state === 'submitted')
          .sort((a, b) => b.submittedAt! - a.submittedAt! || b.id - a.id)
      },

      /**
       * Deletes an In Progress quiz, with its Questions that no other quiz
       * lists (a Mistakes Quiz reuses Questions of Submitted quizzes, which stay).
       * A Submitted quiz is never deleted on its own.
       */
      async discardQuiz(quizId: number) {
        await db.transaction('rw', [db.quizzes, db.questions], async () => {
          const quiz = await db.quizzes.get(quizId)
          if (!quiz || quiz.state !== 'inProgress') return
          const others = await db.quizzes.where('examId').equals(quiz.examId).toArray()
          const kept = new Set(
            others.filter((other) => other.id !== quizId).flatMap((other) => other.items.map((item) => item.questionId)),
          )
          await db.quizzes.delete(quizId)
          await db.questions.bulkDelete(quiz.items.map((item) => item.questionId).filter((id) => !kept.has(id)))
        })
      },

      /** Remembers which Question of an In Progress quiz she is on. */
      async moveInQuiz(quizId: number, position: number) {
        await db.transaction('rw', db.quizzes, async () => {
          const quiz = await db.quizzes.get(quizId)
          if (!quiz || quiz.state !== 'inProgress' || !quiz.items[position]) return
          await db.quizzes.update(quizId, { currentPosition: position })
        })
      },

      /** Records (or changes) the answer to the quiz's Question at `position`, while it is In Progress. */
      async answerQuizQuestion(quizId: number, position: number, chosenIndex: number) {
        await db.transaction('rw', db.quizzes, async () => {
          const quiz = await db.quizzes.get(quizId)
          if (!quiz || quiz.state !== 'inProgress' || !quiz.items[position]) return
          const items = quiz.items.map((item, i) => (i === position ? { ...item, chosenIndex } : item))
          await db.quizzes.update(quizId, { items })
        })
      },

      /**
       * Makes an In Progress quiz Submitted with the Score `score` gives its
       * final answers (read in the same transaction, so an answer saved just
       * before counts), and gives its Questions the Mistake status `mistakes`
       * decides from the same answers.
       */
      async submitQuiz(
        quizId: number,
        score: (quiz: QuizWithQuestions) => number,
        mistakes: (quiz: QuizWithQuestions) => MistakeChange[] = () => [],
      ) {
        await db.transaction('rw', [db.quizzes, db.questions], async () => {
          const found = await getQuiz(quizId)
          if (!found || found.quiz.state !== 'inProgress') return
          await db.quizzes.update(quizId, {
            state: 'submitted',
            score: score(found),
            submittedAt: Date.now(),
          })
          for (const { questionId, isMistake } of mistakes(found)) {
            await db.questions.update(questionId, { isMistake })
          }
        })
      },

      /** The Exam's current Mistakes, oldest Question first. */
      async mistakesFor(examId: number): Promise<Question[]> {
        return db.questions
          .where('examId')
          .equals(examId)
          .filter((question) => question.isMistake)
          .sortBy('id')
      },
    },
  }
}

/** A Question as this quiz item shows it: its options in the item's order. */
function asShown(question: Question, item: QuizItem): Question {
  const order = item.optionOrder
  if (!order) return question
  return {
    ...question,
    options: order.map((index) => question.options[index]),
    correctIndex: order.indexOf(question.correctIndex),
  }
}

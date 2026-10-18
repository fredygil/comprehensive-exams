// Quiz Maker: makes Practice Quizzes for an Exam.
//
// createPracticeQuiz sends the Exam's Recognized Text to the quiz model and
// asks for Questions with their Feedback explanation, so taking and scoring
// the quiz later needs no network. The app, not the model, decides where the
// correct option goes. Each Question keeps its Material's name as it was.
import { GatewayError } from '../gateway/errors'
import type { ModelGateway, StructuredSchema } from '../gateway/gateway'
import { practiceQuizPrompt } from '../prompts/practiceQuiz'
import type { Material, QuestionDraft, Store } from '../store/store'

export const MAX_QUESTIONS = 20
export const OPTION_COUNT = 4

/** A Question as the model writes it. */
type GeneratedQuestion = {
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string
  sourceMaterialId: string
}

const QUIZ_SCHEMA: StructuredSchema<GeneratedQuestion[]> = {
  name: 'practice_quiz',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['prompt', 'options', 'correctIndex', 'explanation', 'sourceMaterialId'],
          properties: {
            prompt: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            correctIndex: { type: 'integer' },
            explanation: { type: 'string' },
            sourceMaterialId: { type: 'string' },
          },
        },
      },
    },
  },
  parse: (json) => {
    const questions = (json as { questions?: unknown } | null)?.questions
    if (!Array.isArray(questions)) throw new Error('no questions array')
    return questions.filter(isGeneratedQuestion)
  },
}

/** Well-formed: a prompt, four non-empty options, a correctIndex among them, an explanation. */
function isGeneratedQuestion(value: unknown): value is GeneratedQuestion {
  const q = value as Partial<GeneratedQuestion> | null
  return (
    typeof q?.prompt === 'string' &&
    q.prompt.trim() !== '' &&
    Array.isArray(q.options) &&
    q.options.length === OPTION_COUNT &&
    q.options.every((option) => typeof option === 'string' && option.trim() !== '') &&
    Number.isInteger(q.correctIndex) &&
    q.correctIndex! >= 0 &&
    q.correctIndex! < OPTION_COUNT &&
    typeof q.explanation === 'string' &&
    typeof q.sourceMaterialId === 'string'
  )
}

export type QuizMakerOptions = {
  store: Store
  gateway: Pick<ModelGateway, 'generateStructured'>
}

export function createQuizMaker({ store, gateway }: QuizMakerOptions) {
  return {
    /**
     * Generates `count` (1–20) Questions from all of the Exam's read Pages
     * and stores them as a new In Progress Practice Quiz. Returns its id.
     * Gateway failures are thrown as GatewayError; a reply with no usable
     * Question is BadResponse. The model may write fewer than asked; extra
     * ones are dropped.
     */
    async createPracticeQuiz(examId: number, { count }: { count: number }): Promise<number> {
      const exam = await store.getExam(examId)
      const student = await store.getStudent()
      if (!exam || !student) throw new Error('createPracticeQuiz: no such Exam, or no Student')
      const sources = await store.examRecognizedText(examId)
      const materials = new Map<string, Material>(
        sources.map(({ material }) => [String(material.id), material]),
      )

      const prompt = practiceQuizPrompt(
        { language: exam.subject.language, gradeLevel: student.gradeLevel },
        {
          count,
          materials: sources.map(({ material, pages }) => ({ id: String(material.id), pages })),
        },
      )
      const generated = await gateway.generateStructured('practiceQuiz', prompt, QUIZ_SCHEMA)

      const usable = generated
        .filter((question) => materials.has(question.sourceMaterialId))
        .slice(0, Math.min(count, MAX_QUESTIONS))
      if (usable.length === 0) throw new GatewayError('BadResponse', 'no usable Question')

      const positions = correctPositions(usable.length)
      const questions: QuestionDraft[] = usable.map((question, i) => {
        const material = materials.get(question.sourceMaterialId)!
        return {
          prompt: question.prompt.trim(),
          ...placeCorrectOption(question, positions[i]),
          explanation: question.explanation.trim(),
          sourceMaterialId: material.id,
          sourceMaterialName: material.name,
        }
      })
      return store.addPracticeQuiz(examId, questions, { mayRepeat: false })
    },
  }
}

export type QuizMaker = ReturnType<typeof createQuizMaker>

/**
 * Where the correct option goes in each of `count` Questions: every block of
 * four Questions uses each position once, in a random order. So the correct
 * position is never the same throughout a quiz of two or more, and is spread
 * evenly, like on a well-made paper test.
 */
function correctPositions(count: number): number[] {
  const positions: number[] = []
  while (positions.length < count) {
    positions.push(...shuffled([...Array(OPTION_COUNT).keys()]))
  }
  return positions.slice(0, count)
}

/** The options with the correct one at `position` and the wrong ones around it in random order. */
function placeCorrectOption(
  question: GeneratedQuestion,
  position: number,
): { options: string[]; correctIndex: number } {
  const correct = question.options[question.correctIndex]
  const wrong = shuffled(question.options.filter((_, i) => i !== question.correctIndex))
  const options = [...wrong.slice(0, position), correct, ...wrong.slice(position)].map((option) =>
    option.trim(),
  )
  return { options, correctIndex: position }
}

/** Fisher–Yates. */
function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

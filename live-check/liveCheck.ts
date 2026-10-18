// The live check: runs the real Model Gateway and prompts against OpenRouter
// on sample notebook Pages and prints what came back, so a person can judge
// the models. Run it with `npm run live-check` (live-check/run.live.ts).
import { APP_TITLE, APP_URL } from '../src/app/config'
import { createModelGateway } from '../src/gateway/gateway'
import { languageName } from '../src/prompts/context'
import { practiceQuizPrompt } from '../src/prompts/practiceQuiz'
import { readPagePrompt } from '../src/prompts/readPage'
import { QUIZ_SCHEMA, type GeneratedQuestion } from '../src/quizMaker/quizMaker'
import { DEFAULT_MODELS, type Job } from '../src/settings/models'
import type { GradeLevel, Language, PageOriginal } from '../src/store/store'
import { watchUsage, type CallUsage } from './usage'

/** A sample notebook Page and the Language of the Subject it belongs to. */
export type Sample = { name: string; language: Language; original: PageOriginal }

/** Questions asked for in each Practice Quiz. */
const QUESTION_COUNT = 5

/** The id the sample's Material gets in the quiz prompt (a fresh tablet's first Material). */
const MATERIAL_ID = '1'

export type LiveCheckOptions = {
  key: string
  samples: Sample[]
  /** Models to use instead of the defaults. */
  models?: Partial<Record<Job, string>>
  gradeLevel?: GradeLevel
  /** Prints one line (or block) of the report. */
  print: (text: string) => void
}

/**
 * Reads each sample Page, then makes a Practice Quiz from its Recognized
 * Text in the sample's Language, printing the results and each call's usage.
 */
export async function runLiveCheck(options: LiveCheckOptions): Promise<{ ok: boolean }> {
  const { samples, print, gradeLevel = 6 } = options
  const gateway = createModelGateway({
    getKey: async () => options.key,
    getModel: async (job) => options.models?.[job] ?? DEFAULT_MODELS[job],
    appUrl: APP_URL,
    appTitle: APP_TITLE,
  })
  const usage = watchUsage()
  const calls: CallUsage[] = []

  /** Runs one Gateway call and prints what it used. */
  async function call<T>(run: () => Promise<T>): Promise<T> {
    const started = performance.now()
    const result = await run()
    const seconds = (performance.now() - started) / 1000
    const used = usage.take()
    if (used) calls.push(used)
    print(used ? `${formatUsage(used)} · ${seconds.toFixed(1)} s` : `Usage: not reported · ${seconds.toFixed(1)} s`)
    return result
  }

  try {
    for (const sample of samples) {
      const context = { language: sample.language, gradeLevel }

      print(`== Read Page: ${sample.name} ==`)
      const text = await call(() =>
        gateway.readPage({ prompt: readPagePrompt(context), original: sample.original }),
      )
      print(text)

      print(`== Practice Quiz in ${languageName(sample.language)} (${QUESTION_COUNT} Questions) from ${sample.name} ==`)
      const prompt = practiceQuizPrompt(context, {
        count: QUESTION_COUNT,
        materials: [{ id: MATERIAL_ID, pages: [text] }],
      })
      const questions = await call(() => gateway.generateStructured(prompt, QUIZ_SCHEMA, 'practiceQuiz'))
      if (questions.length < QUESTION_COUNT) {
        print(`Only ${questions.length} of ${QUESTION_COUNT} Questions came back usable.`)
      }
      questions.forEach((question, i) => print(formatQuestion(question, i + 1)))
    }
  } finally {
    usage.restore()
  }

  print(formatTotal(calls))
  return { ok: true }
}

const LETTERS = 'abcd'

/** A Question with its options, the correct one marked, its explanation and source. */
function formatQuestion(question: GeneratedQuestion, number: number): string {
  return [
    `${number}. ${question.prompt}`,
    ...question.options.map((option, i) =>
      i === question.correctIndex ? ` * ${LETTERS[i]}) ${option}   <- correct` : `   ${LETTERS[i]}) ${option}`,
    ),
    `   Why: ${question.explanation}`,
    `   Source: Material ${question.sourceMaterialId}`,
  ].join('\n')
}

const count = (n: number) => n.toLocaleString('en-US')
const usd = (cost: number) => `$${cost.toFixed(6)}`

function formatUsage(used: CallUsage): string {
  const reasoning = used.reasoningTokens ? ` (${count(used.reasoningTokens)} reasoning)` : ''
  return [
    `Usage: ${count(used.promptTokens)} prompt + ${count(used.completionTokens)} completion tokens${reasoning}`,
    used.cost === null ? 'cost not reported' : usd(used.cost),
    `${used.model} via ${used.provider}`,
  ].join(' · ')
}

function formatTotal(calls: CallUsage[]): string {
  const sum = (pick: (used: CallUsage) => number) => calls.reduce((total, used) => total + pick(used), 0)
  return [
    `Total: ${calls.length} calls`,
    `${count(sum((used) => used.promptTokens))} prompt + ${count(sum((used) => used.completionTokens))} completion tokens`,
    usd(sum((used) => used.cost ?? 0)),
  ].join(' · ')
}

import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { OPENROUTER, openRouter, openRouterRequests, server, type ScriptedQuestion } from './harness/openRouter'
import { renderApp } from './harness/renderApp'

const q1 = { schoolYearStart: 2026, quarter: 1 as const }

type App = Awaited<ReturnType<typeof renderApp>>

/** A tablet with a key, Ana, and a Matemáticas Exam with one read Material. */
function tablet() {
  return renderApp({
    student: { name: 'Ana', gradeLevel: 5 },
    openRouterKey: 'sk-or-v1-good',
    subjects: [{ name: 'Matemáticas', language: 'es' }],
    exams: [{ subject: 'Matemáticas', period: q1, materials: [{ name: 'Unidad 1', pages: ['Las fracciones.'] }] }],
  })
}

/** Question n as the model writes it; the correct option is "Correcta n". */
function question(n: number): ScriptedQuestion {
  return {
    prompt: `Pregunta número ${n}`,
    options: [`Correcta ${n}`, `Incorrecta ${n}a`, `Incorrecta ${n}b`, `Incorrecta ${n}c`],
    correctIndex: 0,
    explanation: `Explicación ${n}`,
    sourceMaterialId: '1',
  }
}

async function openExam(app: App) {
  await app.user.click(await screen.findByRole('link', { name: /Matemáticas/ }))
  await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
}

/**
 * Takes a Practice Quiz of Questions `first`..`first + answers.length - 1`
 * from the Exam screen, answering each right (true) or wrong (false), then
 * goes back to the Exam screen.
 */
async function practice(app: App, answers: boolean[], first = 1) {
  const numbers = answers.map((_, i) => first + i)
  server.use(openRouter.practiceQuiz.questions(numbers.map(question)))
  const section = within(await screen.findByRole('region', { name: 'Practicar' }))
  await app.user.selectOptions(await section.findByLabelText('Número de preguntas'), String(answers.length))
  await app.user.click(section.getByRole('button', { name: 'Practicar' }))
  await takeQuiz(app, numbers, answers)
}

/** Answers the In Progress quiz on screen, submits it and goes back to the Exam screen. */
async function takeQuiz(app: App, numbers: number[], answers: boolean[]) {
  for (const [i, right] of answers.entries()) {
    await screen.findByRole('heading', { name: `Pregunta ${i + 1} de ${answers.length}` })
    const n = numbers[i]
    await app.user.click(screen.getByRole('radio', { name: right ? `Correcta ${n}` : `Incorrecta ${n}a` }))
    if (i < answers.length - 1) await app.user.click(screen.getByRole('button', { name: 'Siguiente' }))
  }
  await app.user.click(screen.getByRole('button', { name: 'Entregar' }))
  await screen.findByRole('heading', { name: 'Resultado' })
  await app.user.click(screen.getByRole('link', { name: 'Volver a Matemáticas' }))
  await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
}

describe('Mistakes', () => {
  it('are the Questions answered wrong in a submitted quiz, counted on the Exam screen', async () => {
    const app = await tablet()
    await openExam(app)

    await practice(app, [true, false, false])

    const mistakes = await screen.findByRole('region', { name: 'Quiz de errores' })
    expect(mistakes).toHaveTextContent('Tienes 2 preguntas por repasar.')

    await app.reopen()
    await openExam(app)
    expect(await screen.findByRole('region', { name: 'Quiz de errores' })).toHaveTextContent(
      'Tienes 2 preguntas por repasar.',
    )
  })
})

describe('the Mistakes Quiz option', () => {
  it('is not offered while the Exam has no Mistakes', async () => {
    const app = await tablet()
    await openExam(app)
    expect(await screen.findByRole('region', { name: 'Practicar' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Quiz de errores' })).not.toBeInTheDocument()

    await practice(app, [true, true])

    expect(await screen.findByRole('region', { name: 'Practicar' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Quiz de errores' })).not.toBeInTheDocument()
  })

  it('lets her choose how many Mistakes, up to however many she has', async () => {
    const app = await tablet()
    await openExam(app)
    await practice(app, [false, true, false, false])

    const mistakes = within(await screen.findByRole('region', { name: 'Quiz de errores' }))
    const count = mistakes.getByLabelText('Número de preguntas')
    expect(within(count).getAllByRole('option').map((option) => option.textContent)).toEqual(['1', '2', '3'])
    expect(count).toHaveValue('3')
  })

  it('offers at most 20', async () => {
    const app = await tablet()
    await openExam(app)
    await practice(app, Array<boolean>(20).fill(false), 1)
    await practice(app, Array<boolean>(5).fill(false), 21)

    const mistakes = within(await screen.findByRole('region', { name: 'Quiz de errores' }))
    expect(mistakes.getByText('Tienes 25 preguntas por repasar.')).toBeInTheDocument()
    const count = mistakes.getByLabelText('Número de preguntas')
    expect(within(count).getAllByRole('option')).toHaveLength(20)
    expect(count).toHaveValue('10')
  })
})

/** From the Exam screen: start a Mistakes Quiz of `count`; waits for its first Question. */
async function startMistakesQuiz(app: App, count: number) {
  const mistakes = within(await screen.findByRole('region', { name: 'Quiz de errores' }))
  await app.user.selectOptions(mistakes.getByLabelText('Número de preguntas'), String(count))
  await app.user.click(mistakes.getByRole('button', { name: 'Repasar errores' }))
  await screen.findByRole('heading', { name: `Pregunta 1 de ${count}` })
}

/** Taps "Entregar" with Questions left unanswered and confirms the warning. */
async function submitUnanswered(app: App) {
  await app.user.click(screen.getByRole('button', { name: 'Entregar' }))
  const warning = within(await screen.findByRole('alertdialog', { name: '¿Entregar el quiz?' }))
  await app.user.click(warning.getByRole('button', { name: 'Sí, entregar' }))
}

/** The number of the Question on screen ("Pregunta número 3" → 3). */
function shownQuestion() {
  return Number(/Pregunta número (\d+)/.exec(screen.getByRole('region', { name: /^Pregunta \d+ de/ }).textContent!)![1])
}

describe('taking a Mistakes Quiz', () => {
  it('reuses her Mistakes, with no network, and is labelled as a Mistakes Quiz', async () => {
    const app = await tablet()
    await openExam(app)
    await practice(app, [true, false, true, false, false])

    // Once its Questions exist, a Mistakes Quiz needs nothing from the network.
    server.use(http.all(`${OPENROUTER}/*`, () => HttpResponse.error()))
    const sent = openRouterRequests.length
    await startMistakesQuiz(app, 3)

    expect(screen.getByRole('heading', { name: 'Quiz de errores', level: 1 })).toBeInTheDocument()
    const asked: number[] = []
    for (let i = 1; i <= 3; i++) {
      await screen.findByRole('heading', { name: `Pregunta ${i} de 3` })
      asked.push(shownQuestion())
      if (i < 3) await app.user.click(screen.getByRole('button', { name: 'Siguiente' }))
    }
    expect([...asked].sort()).toEqual([2, 4, 5])
    await app.user.click(screen.getByRole('radio', { name: `Correcta ${asked[2]}` }))
    await submitUnanswered(app)

    expect(await screen.findByRole('heading', { name: 'Resultado' })).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Quiz de errores', level: 1 })).toBeInTheDocument()
    expect(openRouterRequests.length).toBe(sent)
  })

  it('clears a Mistake she answers right and keeps one she gets wrong again', async () => {
    const app = await tablet()
    await openExam(app)
    await practice(app, [false, true, false])

    await startMistakesQuiz(app, 2)
    const first = shownQuestion()
    const second = first === 1 ? 3 : 1
    await takeQuiz(app, [first, second], [true, false])

    const mistakes = within(await screen.findByRole('region', { name: 'Quiz de errores' }))
    expect(await mistakes.findByText('Tienes 1 pregunta por repasar.')).toBeInTheDocument()
    await startMistakesQuiz(app, 1)
    expect(shownQuestion()).toBe(second)
    await takeQuiz(app, [second], [true])

    expect(await screen.findByRole('region', { name: 'Practicar' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Quiz de errores' })).not.toBeInTheDocument()
  })

  it('keeps a Mistake left unanswered', async () => {
    const app = await tablet()
    await openExam(app)
    await practice(app, [false])

    await startMistakesQuiz(app, 1)
    await submitUnanswered(app)
    expect(await screen.findByText('0 / 1')).toBeInTheDocument()
    await app.user.click(screen.getByRole('link', { name: 'Volver a Matemáticas' }))

    const mistakes = within(await screen.findByRole('region', { name: 'Quiz de errores' }))
    expect(mistakes.getByText('Tienes 1 pregunta por repasar.')).toBeInTheDocument()
  })

  it('takes as many Mistakes as she chose', async () => {
    const app = await tablet()
    await openExam(app)
    await practice(app, [false, false, false, false])

    await startMistakesQuiz(app, 2)

    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled()
    await app.user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('heading', { name: 'Pregunta 2 de 2' })
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })
})

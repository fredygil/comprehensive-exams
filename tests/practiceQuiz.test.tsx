import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OPENROUTER, openRouter, openRouterRequests, server, type ScriptedQuestion } from './harness/openRouter'
import { renderApp, type RenderAppOptions } from './harness/renderApp'

const ana = { name: 'Ana', gradeLevel: 5 }
const subjects = [
  { name: 'Matemáticas', language: 'es' as const },
  { name: 'Science', language: 'en' as const },
]
const q1 = { schoolYearStart: 2026, quarter: 1 as const }

type App = Awaited<ReturnType<typeof renderApp>>

/** A tablet with a key, Ana, and a Matemáticas Exam holding the given read Material. */
function withMaterial(materials: { name: string; pages: string[] }[]): RenderAppOptions {
  return {
    student: ana,
    openRouterKey: 'sk-or-v1-good',
    subjects,
    exams: [{ subject: 'Matemáticas', period: q1, materials }],
  }
}

async function openExam(app: App, subject = 'Matemáticas') {
  await app.user.click(await screen.findByRole('link', { name: new RegExp(subject) }))
  await screen.findByRole('heading', { name: subject, level: 1 })
}

/**
 * Question n as the model writes it: the correct option is always written
 * first ("Correcta n"), so only the app's shuffling moves it.
 */
function question(n: number, sourceMaterialId = '1'): ScriptedQuestion {
  return {
    prompt: `Pregunta número ${n}`,
    options: [`Correcta ${n}`, `Incorrecta ${n}a`, `Incorrecta ${n}b`, `Incorrecta ${n}c`],
    correctIndex: 0,
    explanation: `Explicación ${n}`,
    sourceMaterialId,
  }
}

const questions = (count: number) => Array.from({ length: count }, (_, i) => question(i + 1))

/** From the Exam screen: choose the count and tap "Practicar"; waits for the first Question. */
async function startQuiz(app: App, count: number) {
  const practice = await practiceSection()
  await app.user.selectOptions(await practice.findByLabelText('Número de preguntas'), String(count))
  await app.user.click(practice.getByRole('button', { name: 'Practicar' }))
  await screen.findByRole('heading', { name: `Pregunta 1 de ${count}` })
}

/** The option texts on the current Question's screen, in the order shown. */
function shownOptions() {
  return screen.getAllByRole('radio').map((radio) => radio.closest('label')!.textContent)
}

async function practiceSection() {
  return within(await screen.findByRole('region', { name: 'Practicar' }))
}

describe('starting a Practice Quiz', () => {
  it('asks how many Questions, from 1 to 20, 10 by default', async () => {
    const app = await renderApp(withMaterial([{ name: 'Unidad 1', pages: ['Las fracciones.'] }]))
    await openExam(app)

    const practice = await practiceSection()
    const count = await practice.findByLabelText('Número de preguntas')
    expect(count).toHaveValue('10')
    expect(within(count).getAllByRole('option').map((option) => option.textContent)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 1)),
    )
    expect(practice.getByRole('button', { name: 'Practicar' })).toBeEnabled()
  })

  it('cannot start, and says why, while the Exam has no read Pages', async () => {
    const app = await renderApp({
      student: ana,
      openRouterKey: 'sk-or-v1-good',
      subjects,
      exams: [{ subject: 'Matemáticas', period: q1 }],
    })
    await openExam(app)

    const practice = await practiceSection()
    expect(await practice.findByRole('button', { name: 'Practicar' })).toBeDisabled()
    expect(
      practice.getByText('Para practicar, primero agrega material y espera a que se lea al menos una página.'),
    ).toBeInTheDocument()
  })
})

describe('generating a Practice Quiz', () => {
  it('sends only the Exam\'s Recognized Text, the Subject\'s Language and the Grade Level', async () => {
    server.use(openRouter.practiceQuiz.questions(questions(5)))
    const app = await renderApp({
      student: { name: 'Ana', gradeLevel: 7 },
      openRouterKey: 'sk-or-v1-good',
      subjects,
      exams: [
        {
          subject: 'Science',
          period: q1,
          materials: [
            { name: 'Unit 1', pages: ['Photosynthesis needs light.', 'Leaves are green.'] },
            { name: 'Unit 2', pages: ['Roots take in water.'] },
          ],
        },
        { subject: 'Matemáticas', period: q1, materials: [{ name: 'Unidad 1', pages: ['Las fracciones.'] }] },
      ],
    })
    await openExam(app, 'Science')

    await startQuiz(app, 5)

    const [request] = openRouterRequests.filter((r) => r.url === `${OPENROUTER}/chat/completions`)
    const body = await request.json()
    expect(body.model).toBe('anthropic/claude-haiku-5.5')
    expect(body.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true } })
    expect(body.provider).toEqual({ require_parameters: true })
    const prompt = body.messages.map((message: { content: string }) => message.content).join('\n')
    expect(prompt).toContain('Photosynthesis needs light.')
    expect(prompt).toContain('Leaves are green.')
    expect(prompt).toContain('Roots take in water.')
    expect(prompt).not.toContain('Las fracciones.')
    expect(prompt).toMatch(/grade 7/)
    expect(prompt).toMatch(/English/)
    expect(prompt).not.toMatch(/Spanish/)
    expect(prompt).toMatch(/5 multiple-choice questions/)
  })
})

describe('taking a Practice Quiz', () => {
  it('generates the Questions and shows the first one with its four options', async () => {
    server.use(openRouter.practiceQuiz.questions(questions(3)))
    const app = await renderApp(withMaterial([{ name: 'Unidad 1', pages: ['Las fracciones.'] }]))
    await openExam(app)

    await startQuiz(app, 3)

    expect(screen.getByText('Pregunta número 1')).toBeInTheDocument()
    expect(shownOptions().sort()).toEqual(['Correcta 1', 'Incorrecta 1a', 'Incorrecta 1b', 'Incorrecta 1c'])
  })

  it('shows one Question per screen, back and forth, keeping and changing answers', async () => {
    server.use(openRouter.practiceQuiz.questions(questions(3)))
    const app = await renderApp(withMaterial([{ name: 'Unidad 1', pages: ['Las fracciones.'] }]))
    await openExam(app)
    await startQuiz(app, 3)

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    await app.user.click(screen.getByRole('radio', { name: 'Incorrecta 1a' }))
    await app.user.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(await screen.findByRole('heading', { name: 'Pregunta 2 de 3' })).toBeInTheDocument()
    expect(screen.getByText('Pregunta número 2')).toBeInTheDocument()
    expect(screen.queryByText('Pregunta número 1')).not.toBeInTheDocument()
    expect(screen.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked)).toEqual([])
    await app.user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByRole('heading', { name: 'Pregunta 3 de 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()

    await app.user.click(screen.getByRole('button', { name: 'Anterior' }))
    await app.user.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(await screen.findByRole('heading', { name: 'Pregunta 1 de 3' })).toBeInTheDocument()
    expect(await screen.findByRole('radio', { name: 'Incorrecta 1a' })).toBeChecked()

    await app.user.click(screen.getByRole('radio', { name: 'Correcta 1' }))
    expect(await screen.findByRole('radio', { name: 'Correcta 1' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Incorrecta 1a' })).not.toBeChecked()
  })

  it('puts the correct option in different positions, not where the model wrote it', async () => {
    server.use(openRouter.practiceQuiz.questions(questions(8)))
    const app = await renderApp(withMaterial([{ name: 'Unidad 1', pages: ['Las fracciones.'] }]))
    await openExam(app)
    await startQuiz(app, 8)

    const correctPositions: number[] = []
    for (let n = 1; n <= 8; n++) {
      await screen.findByRole('heading', { name: `Pregunta ${n} de 8` })
      const options = shownOptions()
      expect(options.slice().sort()).toEqual([`Correcta ${n}`, `Incorrecta ${n}a`, `Incorrecta ${n}b`, `Incorrecta ${n}c`])
      correctPositions.push(options.indexOf(`Correcta ${n}`))
      if (n < 8) await app.user.click(screen.getByRole('button', { name: 'Siguiente' }))
    }

    expect(new Set(correctPositions).size).toBeGreaterThan(1)
  })
})

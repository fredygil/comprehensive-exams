import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OPENROUTER, openRouter, openRouterRequests, server, type ScriptedQuestion } from './harness/openRouter'
import { renderApp, type RenderAppOptions, type SeededMaterial } from './harness/renderApp'

const ana = { name: 'Ana', gradeLevel: 5 }
const subjects = [{ name: 'Matemáticas', language: 'es' as const }]
const q1 = { schoolYearStart: 2026, quarter: 1 as const }

type App = Awaited<ReturnType<typeof renderApp>>

/** A tablet with a key, Ana, and a Matemáticas Exam holding the given Material. */
function withMaterial(materials: SeededMaterial[]): RenderAppOptions {
  return {
    student: ana,
    openRouterKey: 'sk-or-v1-good',
    subjects,
    exams: [{ subject: 'Matemáticas', period: q1, materials }],
  }
}

const twoUnits = withMaterial([
  { name: 'Unidad 1', pages: ['Las fracciones.'] },
  { name: 'Unidad 2', pages: ['Los decimales.'] },
])

async function openExam(app: App) {
  await app.user.click(await screen.findByRole('link', { name: /Matemáticas/ }))
  await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
}

async function practiceSection() {
  return within(await screen.findByRole('region', { name: 'Practicar' }))
}

function question(prompt: string, sourceMaterialId = '1'): ScriptedQuestion {
  return {
    prompt,
    options: [`Correcta: ${prompt}`, 'Incorrecta a', 'Incorrecta b', 'Incorrecta c'],
    correctIndex: 0,
    explanation: 'Porque sí.',
    sourceMaterialId,
  }
}

/** Taps "Practicar" with the chosen count and waits for the first Question. */
async function startQuiz(app: App, count: number) {
  const practice = await practiceSection()
  await app.user.selectOptions(await practice.findByLabelText('Número de preguntas'), String(count))
  await app.user.click(practice.getByRole('button', { name: 'Practicar' }))
  await screen.findByRole('heading', { name: `Pregunta 1 de ${count}` })
}

/** The prompt text of every quiz-generation request sent so far, in order. */
async function quizPrompts(): Promise<string[]> {
  const prompts: string[] = []
  for (const request of openRouterRequests.filter((r) => r.url === `${OPENROUTER}/chat/completions`)) {
    const body = await request.clone().json()
    if (body.response_format?.json_schema?.name !== 'practice_quiz') continue
    prompts.push(body.messages.map((message: { content: string }) => message.content).join('\n'))
  }
  return prompts
}

describe('choosing the Materials a Practice Quiz covers', () => {
  it('covers all of the Exam\'s Materials by default', async () => {
    server.use(openRouter.practiceQuiz.questions([question('¿Qué es una fracción?')]))
    const app = await renderApp(twoUnits)
    await openExam(app)

    const practice = await practiceSection()
    const picker = within(await practice.findByRole('group', { name: 'Material del quiz' }))
    expect(picker.getByRole('checkbox', { name: 'Unidad 1' })).toBeChecked()
    expect(picker.getByRole('checkbox', { name: 'Unidad 2' })).toBeChecked()
    await startQuiz(app, 1)

    const [prompt] = await quizPrompts()
    expect(prompt).toContain('Las fracciones.')
    expect(prompt).toContain('Los decimales.')
  })

  it('sends only the chosen Materials\' Recognized Text', async () => {
    server.use(openRouter.practiceQuiz.questions([question('¿Qué es un decimal?', '2')]))
    const app = await renderApp(twoUnits)
    await openExam(app)

    const practice = await practiceSection()
    await app.user.click(await practice.findByRole('checkbox', { name: 'Unidad 1' }))
    await startQuiz(app, 1)

    const [prompt] = await quizPrompts()
    expect(prompt).not.toContain('Las fracciones.')
    expect(prompt).toContain('Los decimales.')
  })

  it('cannot start with no Material chosen', async () => {
    const app = await renderApp(twoUnits)
    await openExam(app)

    const practice = await practiceSection()
    await app.user.click(await practice.findByRole('checkbox', { name: 'Unidad 1' }))
    await app.user.click(practice.getByRole('checkbox', { name: 'Unidad 2' }))

    expect(practice.getByRole('button', { name: 'Practicar' })).toBeDisabled()
    expect(practice.getByText('Elige al menos un material.')).toBeInTheDocument()
  })
})

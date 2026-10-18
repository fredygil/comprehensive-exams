import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setClock } from './harness/clock'
import { openRouter, server, type ScriptedQuestion } from './harness/openRouter'
import { renderApp, type RenderAppOptions } from './harness/renderApp'

const q1 = { schoolYearStart: 2026, quarter: 1 as const }

type App = Awaited<ReturnType<typeof renderApp>>

/** A tablet with a key, Ana, and a Matemáticas Exam holding the given read Material. */
function withMaterial(materials = [{ name: 'Unidad 1', pages: ['Las fracciones.'] }]): RenderAppOptions {
  return {
    student: { name: 'Ana', gradeLevel: 5 },
    openRouterKey: 'sk-or-v1-good',
    subjects: [{ name: 'Matemáticas', language: 'es' }],
    exams: [{ subject: 'Matemáticas', period: q1, materials }],
  }
}

/** Question n as the model writes it, correct option first ("Correcta n"). */
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

async function openExam(app: App) {
  await app.user.click(await screen.findByRole('link', { name: /Matemáticas/ }))
  await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
}

async function practiceSection() {
  return within(await screen.findByRole('region', { name: 'Practicar' }))
}

/** From the Exam screen: choose the count and tap "Practicar"; waits for the first Question. */
async function startQuiz(app: App, count: number) {
  const practice = await practiceSection()
  await app.user.selectOptions(await practice.findByLabelText('Número de preguntas'), String(count))
  await app.user.click(practice.getByRole('button', { name: 'Practicar' }))
  await screen.findByRole('heading', { name: `Pregunta 1 de ${count}` })
}

/** Taps an option and waits until the saved answer shows. */
async function choose(app: App, option: string) {
  await app.user.click(screen.getByRole('radio', { name: option }))
  await waitFor(() => expect(screen.getByRole('radio', { name: option })).toBeChecked())
}

async function next(app: App) {
  await app.user.click(screen.getByRole('button', { name: 'Siguiente' }))
}

describe('leaving a quiz halfway', () => {
  it('resumes it after closing the app, on the same Question with the same answers', async () => {
    setClock('2026-10-18T09:05')
    server.use(openRouter.practiceQuiz.questions(questions(3)))
    const app = await renderApp(withMaterial())
    await openExam(app)
    await startQuiz(app, 3)
    await choose(app, 'Incorrecta 1a')
    await next(app)
    await choose(app, 'Correcta 2')

    await app.reopen()
    await openExam(app)

    const inProgress = within(await (await practiceSection()).findByRole('list', { name: 'Quizzes en curso' }))
    const [item] = inProgress.getAllByRole('listitem')
    expect(item).toHaveTextContent('18 de octubre de 2026, 9:05')
    expect(item).toHaveTextContent('2 de 3 respondidas')
    await app.user.click(within(item).getByRole('link', { name: 'Continuar' }))

    expect(await screen.findByRole('heading', { name: 'Pregunta 2 de 3' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Correcta 2' })).toBeChecked()
    await app.user.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(await screen.findByRole('heading', { name: 'Pregunta 1 de 3' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Incorrecta 1a' })).toBeChecked()
  })
})

describe('discarding an In Progress quiz', () => {
  it('asks first, and keeps it on "Cancelar"', async () => {
    setClock('2026-10-18T09:05')
    server.use(openRouter.practiceQuiz.questions(questions(3)))
    const app = await renderApp(withMaterial())
    await openExam(app)
    await startQuiz(app, 3)
    await choose(app, 'Correcta 1')
    await app.user.click(screen.getByRole('link', { name: 'Volver a Matemáticas' }))

    const practice = await practiceSection()
    await app.user.click(await practice.findByRole('button', { name: 'Descartar quiz' }))
    const confirm = within(await screen.findByRole('alertdialog', { name: '¿Descartar este quiz?' }))
    expect(confirm.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'El quiz empezado el 18 de octubre de 2026, 9:05',
      '1 de 3 respondidas',
    ])
    await app.user.click(confirm.getByRole('button', { name: 'Cancelar' }))

    expect(await practice.findByRole('list', { name: 'Quizzes en curso' })).toBeInTheDocument()
  })

  it('removes it from the Exam on "Sí, descartar"', async () => {
    server.use(openRouter.practiceQuiz.questions(questions(3)))
    const app = await renderApp(withMaterial())
    await openExam(app)
    await startQuiz(app, 3)
    const quizUrl = window.location.hash
    await app.user.click(screen.getByRole('link', { name: 'Volver a Matemáticas' }))

    const practice = await practiceSection()
    await app.user.click(await practice.findByRole('button', { name: 'Descartar quiz' }))
    await app.user.click(
      within(await screen.findByRole('alertdialog', { name: '¿Descartar este quiz?' })).getByRole('button', {
        name: 'Sí, descartar',
      }),
    )

    await waitFor(() => expect(practice.queryByRole('list', { name: 'Quizzes en curso' })).not.toBeInTheDocument())
    window.location.hash = quizUrl
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/examenes\/\d+$/))
    expect(screen.queryByRole('heading', { name: 'Quiz de práctica' })).not.toBeInTheDocument()
  })

  it('can also be discarded from the quiz itself, back to the Exam', async () => {
    server.use(openRouter.practiceQuiz.questions(questions(3)))
    const app = await renderApp(withMaterial())
    await openExam(app)
    await startQuiz(app, 3)

    await app.user.click(screen.getByRole('button', { name: 'Descartar quiz' }))
    await app.user.click(
      within(await screen.findByRole('alertdialog', { name: '¿Descartar este quiz?' })).getByRole('button', {
        name: 'Sí, descartar',
      }),
    )

    expect(await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })).toBeInTheDocument()
    const practice = await practiceSection()
    await practice.findByRole('button', { name: 'Practicar' })
    expect(practice.queryByRole('list', { name: 'Quizzes en curso' })).not.toBeInTheDocument()
  })
})

describe('submitting with unanswered Questions', () => {
  const warning = (n: string) => `${n} por responder. Las preguntas sin responder cuentan como incorrectas.`

  it('shows how many are answered, warns with how many are not, and counts them as wrong', async () => {
    server.use(openRouter.practiceQuiz.questions(questions(3)))
    const app = await renderApp(withMaterial())
    await openExam(app)
    await startQuiz(app, 3)
    expect(screen.getByText('0 de 3 respondidas')).toBeInTheDocument()
    await choose(app, 'Correcta 1')
    expect(await screen.findByText('1 de 3 respondidas')).toBeInTheDocument()

    await app.user.click(screen.getByRole('button', { name: 'Entregar' }))
    const first = within(await screen.findByRole('alertdialog', { name: '¿Entregar el quiz?' }))
    expect(first.getByText(warning('Te faltan 2 preguntas'))).toBeInTheDocument()
    await app.user.click(first.getByRole('button', { name: 'Seguir respondiendo' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await next(app)
    await choose(app, 'Incorrecta 2b')

    await app.user.click(screen.getByRole('button', { name: 'Entregar' }))
    const again = within(await screen.findByRole('alertdialog', { name: '¿Entregar el quiz?' }))
    expect(again.getByText(warning('Te falta 1 pregunta'))).toBeInTheDocument()
    await app.user.click(again.getByRole('button', { name: 'Sí, entregar' }))

    expect(await screen.findByText('1 / 3')).toBeInTheDocument()
    const feedback = within(screen.getByRole('region', { name: 'Respuestas incorrectas' })).getAllByRole('listitem')
    expect(feedback.map((item) => item.querySelector('h3')!.textContent)).toEqual(['Pregunta 2', 'Pregunta 3'])
    expect(feedback[1]).toHaveTextContent('Tu respuesta: Sin responder')
  })

  it('submits at once when every Question is answered, even one tapped just before', async () => {
    server.use(openRouter.practiceQuiz.questions(questions(2)))
    const app = await renderApp(withMaterial())
    await openExam(app)
    await startQuiz(app, 2)
    await choose(app, 'Correcta 1')
    await next(app)
    await screen.findByRole('heading', { name: 'Pregunta 2 de 2' })

    await app.user.click(screen.getByRole('radio', { name: 'Incorrecta 2a' }))
    await app.user.click(screen.getByRole('button', { name: 'Entregar' }))

    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

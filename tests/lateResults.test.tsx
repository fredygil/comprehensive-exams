// A Summary, Explainer or Practice Quiz still being written when its Exam is
// deleted, or when a backup replaces everything, is dropped when it comes back.
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setClock } from './harness/clock'
import { openRouter, openRouterRequests, server } from './harness/openRouter'
import { renderApp } from './harness/renderApp'

const q1 = { schoolYearStart: 2026, quarter: 1 as const }

type App = Awaited<ReturnType<typeof renderApp>>

function tablet() {
  return renderApp({
    student: { name: 'Ana', gradeLevel: 5 },
    openRouterKey: 'sk-or-v1-good',
    subjects: [{ name: 'Matemáticas', language: 'es' }],
    exams: [
      {
        subject: 'Matemáticas',
        period: q1,
        materials: [{ name: 'Unidad 1', pages: ['Las fracciones tienen numerador.'] }],
        summary: '## Fracciones\n\nEl resumen de la copia.',
        explainers: [{ topic: 'Fracciones equivalentes', markdown: 'La explicación de la copia.', sources: [] }],
      },
    ],
  })
}

async function openExam(app: App) {
  await app.user.click(await screen.findByRole('link', { name: /Matemáticas/ }))
  await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
}

function region(name: string) {
  return within(screen.getByRole('region', { name }))
}

/** Holds the model's answers, then starts a new Summary, an Explainer and a Practice Quiz from the Exam screen. */
async function startAllThree(app: App) {
  const summary = openRouter.summary.held()
  const explainer = openRouter.webSearch.held()
  const quiz = openRouter.practiceQuiz.held()
  server.use(summary.handler, explainer.handler, quiz.handler)

  await app.user.click(await region('Resumen').findByRole('button', { name: 'Regenerar' }))
  await app.user.type(region('Explicaciones').getByLabelText('Tema'), 'Fracciones impropias')
  await app.user.click(region('Explicaciones').getByRole('button', { name: 'Crear explicación' }))
  await app.user.click(await region('Practicar').findByRole('button', { name: 'Practicar' }))
  await waitFor(() => expect(openRouterRequests).toHaveLength(3))

  return {
    /** The model answers all three. */
    answer() {
      summary.answer({ topics: [{ title: 'Tarde', content: 'El resumen que llegó tarde.' }] })
      explainer.answer({ markdown: 'La explicación que llegó tarde.' })
      quiz.answer({
        questions: [
          {
            prompt: 'La pregunta que llegó tarde',
            options: ['A', 'B', 'C', 'D'],
            correctIndex: 0,
            explanation: 'Porque sí.',
            sourceMaterialId: '1',
          },
        ],
      })
    },
  }
}

/** Gives answers already sent time to come back and be handled. */
const lateAnswersHandled = () => new Promise((resolve) => setTimeout(resolve, 50))

describe('a Study Aid or quiz still being written', () => {
  it('is dropped when a backup is restored meanwhile, so it never lands on the restored Exam', async () => {
    setClock('2026-10-18T09:00')
    const app = await tablet()
    await app.user.click(await screen.findByRole('link', { name: 'Ajustes' }))
    await app.user.click(await screen.findByRole('button', { name: 'Exportar copia' }))
    await screen.findByText(/Copia lista/)
    const [backup] = app.savedFiles
    await app.user.click(screen.getByRole('link', { name: 'Inicio' }))
    await openExam(app)

    const late = await startAllThree(app)
    await app.user.click(screen.getByRole('link', { name: 'Ajustes' }))
    await app.user.upload(await screen.findByLabelText('Importar copia'), backup)
    const confirmation = await screen.findByRole('alertdialog', { name: '¿Restaurar esta copia?' })
    await app.user.click(within(confirmation).getByRole('button', { name: 'Sí, restaurar' }))
    await screen.findByText('Copia restaurada.')
    late.answer()
    await lateAnswersHandled()

    await openExam(app)
    expect(await screen.findByRole('list', { name: 'Tus explicaciones' })).toHaveTextContent(
      /^Fracciones equivalentes$/,
    )
    expect(screen.queryByRole('list', { name: 'Quizzes en curso' })).not.toBeInTheDocument()
    await app.user.click(await region('Resumen').findByRole('link', { name: 'Leer el resumen' }))
    expect(await screen.findByText('El resumen de la copia.')).toBeInTheDocument()
    expect(screen.queryByText('El resumen que llegó tarde.')).not.toBeInTheDocument()
  })

  it('is dropped when its Exam is deleted meanwhile, leaving nothing of the Exam behind', async () => {
    const app = await tablet()
    await openExam(app)
    const examId = Number(/examenes\/(\d+)/.exec(window.location.hash)![1])

    const late = await startAllThree(app)
    await app.user.click(screen.getByRole('button', { name: 'Eliminar examen' }))
    await app.user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, eliminar' }))
    await screen.findByRole('heading', { name: /Ana/, level: 1 })
    late.answer()
    await lateAnswersHandled()

    // Nothing on screen shows rows of a deleted Exam: look at everything the tablet holds.
    const everything = Object.values(await app.store.exportAll()).flat()
    expect(everything.filter((row) => 'examId' in row && row.examId === examId)).toEqual([])
  })
})

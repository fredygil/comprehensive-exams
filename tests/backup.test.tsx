import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setClock } from './harness/clock'
import { pdf, pdfPageNumber } from './harness/files'
import { OPENROUTER, openRouter, openRouterRequests, server, type ScriptedQuestion } from './harness/openRouter'
import { renderApp, type RenderAppOptions } from './harness/renderApp'

const q1 = { schoolYearStart: 2026, quarter: 1 as const }

type App = Awaited<ReturnType<typeof renderApp>>

async function openSettings(app: App) {
  await app.user.click(await screen.findByRole('link', { name: 'Ajustes' }))
  await screen.findByRole('heading', { name: 'Ajustes', level: 1 })
}

function backupSection() {
  return within(screen.getByRole('region', { name: 'Copia de seguridad' }))
}

/** In Settings: taps "Exportar copia" and returns the file the app saved. */
async function exportBackup(app: App) {
  await openSettings(app)
  await app.user.click(backupSection().getByRole('button', { name: 'Exportar copia' }))
  await backupSection().findByText(/Copia lista/)
  expect(app.savedFiles).toHaveLength(1)
  return app.savedFiles[0]
}

/** Picks the backup file in "Importar copia" and confirms that it replaces everything. */
async function importBackup(app: App, file: File) {
  await app.user.upload(screen.getByLabelText('Importar copia'), file)
  const confirmation = await screen.findByRole('alertdialog', { name: '¿Restaurar esta copia?' })
  await app.user.click(within(confirmation).getByRole('button', { name: 'Sí, restaurar' }))
}

async function openExam(app: App, subject = 'Matemáticas') {
  await app.user.click(await screen.findByRole('link', { name: new RegExp(subject) }))
  await screen.findByRole('heading', { name: subject, level: 1 })
}

async function openMaterial(app: App, name: string) {
  const material = within(await screen.findByRole('region', { name: 'Material' }))
  await app.user.click(await material.findByRole('link', { name }))
  await screen.findByRole('heading', { name, level: 1 })
}

/** Question n as the model writes it, correct option first ("Correcta n"). */
function question(n: number): ScriptedQuestion {
  return {
    prompt: `Pregunta número ${n}`,
    options: [`Correcta ${n}`, `Incorrecta ${n}a`, `Incorrecta ${n}b`, `Incorrecta ${n}c`],
    correctIndex: 0,
    explanation: `Explicación ${n}`,
    sourceMaterialId: '1',
  }
}

/** From the Exam screen: start a Practice Quiz of these Questions; waits for the first one. */
async function startQuiz(app: App, numbers: number[]) {
  server.use(openRouter.practiceQuiz.questions(numbers.map(question)))
  const practice = within(await screen.findByRole('region', { name: 'Practicar' }))
  await app.user.selectOptions(await practice.findByLabelText('Número de preguntas'), String(numbers.length))
  await app.user.click(practice.getByRole('button', { name: 'Practicar' }))
  await screen.findByRole('heading', { name: `Pregunta 1 de ${numbers.length}` })
}

/** Taps an option and waits until the saved answer shows. */
async function choose(app: App, option: string) {
  await app.user.click(screen.getByRole('radio', { name: option }))
  await waitFor(() => expect(screen.getByRole('radio', { name: option })).toBeChecked())
}

async function backToExam(app: App) {
  await app.user.click(screen.getByRole('link', { name: 'Volver a Matemáticas' }))
  await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
}

async function goHome(app: App) {
  await app.user.click(screen.getByRole('link', { name: 'Inicio' }))
}

function recognizedText() {
  return within(screen.getByRole('region', { name: 'Texto reconocido' }))
}

const anasTablet: RenderAppOptions = {
  student: { name: 'Ana', gradeLevel: 5 },
  openRouterKey: 'sk-or-v1-anas-key',
  subjects: [
    { name: 'Matemáticas', language: 'es' },
    { name: 'Science', language: 'en' },
  ],
  exams: [
    {
      subject: 'Matemáticas',
      period: q1,
      examDate: '2026-10-21',
      materials: [{ name: 'Unidad 1', pages: ['Las fracciones tienen numerador.'] }],
      summary: '## Fracciones\n\nUna fracción tiene numerador y denominador.',
      explainers: [
        {
          topic: 'Fracciones equivalentes',
          markdown: 'Dos fracciones son equivalentes si representan la misma parte.',
          sources: [{ url: 'https://example.org/fracciones', title: 'Fracciones' }],
        },
      ],
    },
    { subject: 'Science', period: { schoolYearStart: 2025, quarter: 4 } },
  ],
}

/**
 * Ana's tablet with a bit of everything, made through the screens where the
 * seeds can't: a PDF still waiting to be read (offline), a changed model, a
 * Submitted quiz with a Mistake and a quiz left In Progress on Question 2.
 */
async function useAnasTablet() {
  setClock('2026-10-18T09:00')
  server.use(openRouter.readPage.offline())
  const app = await renderApp(anasTablet)

  await app.user.click(await screen.findByRole('link', { name: '2025–2026 · Q4' }))
  await openExam(app, 'Science')
  await app.user.upload(screen.getByLabelText('Agregar material'), await pdf('unidad 3.pdf', 2))
  await screen.findByRole('link', { name: 'unidad 3' })

  await openSettings(app)
  const models = within(screen.getByRole('region', { name: 'Modelos' }))
  await app.user.clear(models.getByLabelText('Resumen'))
  await app.user.type(models.getByLabelText('Resumen'), 'anthropic/claude-sonnet-5')
  await app.user.click(models.getByRole('button', { name: 'Guardar modelos' }))
  await models.findByText('Modelos guardados.')

  await goHome(app)
  await openExam(app)
  await startQuiz(app, [1, 2])
  await choose(app, 'Incorrecta 1a')
  await app.user.click(screen.getByRole('button', { name: 'Siguiente' }))
  await choose(app, 'Correcta 2')
  setClock('2026-10-18T09:10')
  await app.user.click(screen.getByRole('button', { name: 'Entregar' }))
  await screen.findByRole('heading', { name: 'Resultado' })
  await backToExam(app)

  setClock('2026-10-18T09:20')
  await startQuiz(app, [3, 4, 5])
  await choose(app, 'Correcta 3')
  await app.user.click(screen.getByRole('button', { name: 'Siguiente' }))
  await screen.findByRole('heading', { name: 'Pregunta 2 de 3' })
  await backToExam(app)
  return app
}

describe('backup round trip', () => {
  it('brings back everything on a new tablet, exactly as it was, with that tablet’s key', async () => {
    const old = await useAnasTablet()
    const file = await exportBackup(old)
    await old.close()

    server.use(openRouter.readPage.as(async ({ bytes }) => `Texto de la página ${await pdfPageNumber(bytes)}.`))
    const fresh = await renderApp({
      student: { name: 'Sofía', gradeLevel: 7 },
      openRouterKey: 'sk-or-v1-new-tablet',
      subjects: [{ name: 'Historia', language: 'es' }],
      exams: [{ subject: 'Historia', period: { schoolYearStart: 2026, quarter: 2 } }],
    })
    await openSettings(fresh)
    await importBackup(fresh, file)

    // Home: her name and Periods, and nothing of what this tablet had.
    expect(await screen.findByRole('heading', { name: 'Buenos días, Ana', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Copia restaurada.')
    expect(screen.getByRole('region', { name: '2026–2027 · Q1' })).toHaveTextContent(/Matemáticas.*en 3 días/)
    expect(screen.queryByText(/Historia/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '2025–2026 · Q4' })).toBeInTheDocument()

    // The Exam: Material with its scan, Summary, Explainer, history, Mistakes, the quiz In Progress.
    await openExam(fresh)
    await openMaterial(fresh, 'Unidad 1')
    expect(await recognizedText().findByText('Las fracciones tienen numerador.')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Página 1: original' })).toHaveAttribute('data-mime', 'image/jpeg')
    await backToExam(fresh)

    const summary = within(await screen.findByRole('region', { name: 'Resumen' }))
    expect(await summary.findByRole('link', { name: 'Leer el resumen' })).toBeInTheDocument()
    expect(summary.queryByText(/Desactualizado/)).not.toBeInTheDocument()
    const explainers = within(await screen.findByRole('list', { name: 'Tus explicaciones' }))
    expect(explainers.getByRole('link', { name: /Fracciones equivalentes/ })).toBeInTheDocument()
    const history = within(await screen.findByRole('list', { name: 'Quizzes entregados' }))
    expect(history.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Quiz de práctica · 18 de octubre de 2026, 9:10 · 2 preguntas · 1 / 2',
    ])
    expect(await screen.findByRole('region', { name: 'Quiz de errores' })).toHaveTextContent(
      'Tienes 1 pregunta por repasar.',
    )
    const inProgress = within(await screen.findByRole('list', { name: 'Quizzes en curso' }))
    const [quiz] = inProgress.getAllByRole('listitem')
    expect(quiz).toHaveTextContent('Quiz de práctica · Empezado el 18 de octubre de 2026, 9:20')
    expect(quiz).toHaveTextContent('1 de 3 respondidas')
    await fresh.user.click(within(quiz).getByRole('link', { name: 'Continuar' }))
    expect(await screen.findByRole('heading', { name: 'Pregunta 2 de 3' })).toBeInTheDocument()
    await fresh.user.click(screen.getByRole('button', { name: 'Anterior' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Correcta 3' })).toBeChecked())

    // The PDF's scans came along: its Pages are read now, from those scans, with this tablet's key.
    await goHome(fresh)
    await fresh.user.click(await screen.findByRole('link', { name: '2025–2026 · Q4' }))
    await openExam(fresh, 'Science')
    await openMaterial(fresh, 'unidad 3')
    expect(await recognizedText().findByText('Texto de la página 1.')).toBeInTheDocument()
    await fresh.user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(await recognizedText().findByText('Texto de la página 2.')).toBeInTheDocument()
    const reads = openRouterRequests.filter((request) => request.url === `${OPENROUTER}/chat/completions`)
    expect(reads.at(-1)!.headers.get('Authorization')).toBe('Bearer sk-or-v1-new-tablet')

    // Settings: her name and models; this tablet's key.
    await openSettings(fresh)
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana')
    expect(screen.getByLabelText('Clave')).toHaveValue('sk-or-v1-new-tablet')
    expect(within(screen.getByRole('region', { name: 'Modelos' })).getByLabelText('Resumen')).toHaveValue(
      'anthropic/claude-sonnet-5',
    )
  })

  it('never puts the OpenRouter key in the file', async () => {
    const app = await renderApp(anasTablet)
    const file = await exportBackup(app)

    expect(new TextDecoder().decode(await file.arrayBuffer())).not.toContain('sk-or-v1-anas-key')
  })
})

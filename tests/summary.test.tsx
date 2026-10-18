import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { photo } from './harness/files'
import { OPENROUTER, openRouter, openRouterRequests, server } from './harness/openRouter'
import { renderApp } from './harness/renderApp'

const ana = { name: 'Ana', gradeLevel: 5 }
const subjects = [
  { name: 'Matemáticas', language: 'es' as const },
  { name: 'Science', language: 'en' as const },
]
const q1 = { schoolYearStart: 2026, quarter: 1 as const }
const fractions = {
  name: 'Unidad 1',
  pages: [
    '# Fracciones\n\nUna fracción tiene numerador y denominador.',
    'Fracciones equivalentes: $\\frac{1}{2} = \\frac{2}{4}$',
  ],
}
const mathExam = { subject: 'Matemáticas', period: q1, materials: [fractions] }

/** What the summary model answers: one entry per topic, its body in Markdown. */
const fractionsSummary = {
  topics: [
    {
      title: 'Fracciones',
      content: '- **Fracción**: tiene *numerador* y *denominador*.',
    },
    {
      title: 'Fracciones equivalentes',
      content: '- Representan la misma cantidad:\n\n$$\n\\frac{1}{2} = \\frac{2}{4}\n$$',
    },
  ],
}

/** The LaTeX of every formula rendered in an element (KaTeX keeps it in a MathML annotation). */
function formulas(element: HTMLElement) {
  return [...element.querySelectorAll('annotation[encoding="application/x-tex"]')].map(
    (annotation) => annotation.textContent,
  )
}

/** The chat completion requests sent so far, as JSON bodies. */
async function chatBodies() {
  const requests = openRouterRequests.filter((r) => r.url === `${OPENROUTER}/chat/completions`)
  return Promise.all(requests.map((r) => r.clone().json()))
}

function promptOf(body: { messages: { content: string }[] }) {
  return body.messages.map((m) => m.content).join('\n')
}

type App = Awaited<ReturnType<typeof renderApp>>

async function openExam(app: App, subject = 'Matemáticas') {
  await app.user.click(await screen.findByRole('link', { name: new RegExp(subject) }))
  await screen.findByRole('heading', { name: subject, level: 1 })
}

async function summarySection() {
  return within(await screen.findByRole('region', { name: 'Resumen' }))
}

describe('generating a Summary', () => {
  it('builds a study guide by topic from the Exam’s Recognized Text and shows it with its formulas', async () => {
    server.use(openRouter.structured.json(fractionsSummary))
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)

    await app.user.click(await (await summarySection()).findByRole('button', { name: 'Generar resumen' }))

    expect(await screen.findByRole('heading', { name: 'Resumen de Matemáticas', level: 1 })).toBeInTheDocument()
    const summary = screen.getByRole('article')
    expect(within(summary).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Fracciones',
      'Fracciones equivalentes',
    ])
    expect(within(summary).getByText('numerador')).toBeInTheDocument()
    expect(formulas(summary)).toEqual(['\\frac{1}{2} = \\frac{2}{4}'])

    const [body] = await chatBodies()
    expect(body.model).toBe('anthropic/claude-haiku-5.5')
    expect(body.response_format.type).toBe('json_schema')
    expect(body.response_format.json_schema.strict).toBe(true)
    const prompt = promptOf(body)
    expect(prompt).toContain('Una fracción tiene numerador y denominador.')
    expect(prompt).toContain('Fracciones equivalentes: $\\frac{1}{2} = \\frac{2}{4}$')
    expect(prompt).toMatch(/Spanish/)
    expect(prompt).toMatch(/grade 5/)
  })
})

const oldSummary = '## Fracciones\n\nResumen viejo de las fracciones.'

async function openSummary(app: App) {
  await app.user.click(await (await summarySection()).findByRole('link', { name: 'Leer el resumen' }))
  await screen.findByRole('heading', { name: /^Resumen de/, level: 1 })
}

describe('regenerating a Summary', () => {
  it('replaces the one the Exam had: there is only ever one', async () => {
    server.use(openRouter.structured.json(fractionsSummary))
    const app = await renderApp({
      student: ana,
      openRouterKey: 'sk-or-v1-good',
      subjects,
      exams: [{ ...mathExam, summary: oldSummary }],
    })
    await openExam(app)
    const section = await summarySection()
    expect(await section.findByRole('button', { name: 'Regenerar' })).toBeInTheDocument()
    expect(section.queryByRole('button', { name: 'Generar resumen' })).not.toBeInTheDocument()
    await openSummary(app)
    expect(screen.getByText('Resumen viejo de las fracciones.')).toBeInTheDocument()

    await app.user.click(await screen.findByRole('button', { name: 'Regenerar' }))

    expect(await screen.findByRole('heading', { name: 'Fracciones equivalentes', level: 2 })).toBeInTheDocument()
    expect(screen.queryByText('Resumen viejo de las fracciones.')).not.toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)

    await app.reopen()
    await openExam(app)
    await openSummary(app)
    expect(await screen.findByRole('heading', { name: 'Fracciones equivalentes', level: 2 })).toBeInTheDocument()
    expect(screen.queryByText('Resumen viejo de las fracciones.')).not.toBeInTheDocument()
  })

  it('keeps the earlier Summary when generating fails, and says why', async () => {
    server.use(openRouter.structured.status(402))
    const app = await renderApp({
      student: ana,
      openRouterKey: 'sk-or-v1-good',
      subjects,
      exams: [{ ...mathExam, summary: oldSummary }],
    })
    await openExam(app)
    await openSummary(app)

    await app.user.click(await screen.findByRole('button', { name: 'Regenerar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Se acabó el saldo de la clave de OpenRouter. Pídele a un adulto que lo recargue.',
    )
    expect(screen.getByText('Resumen viejo de las fracciones.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regenerar' })).toBeEnabled()
  })
})

const OUTDATED = /^Desactualizado/

async function openMaterial(app: App, name: string) {
  const material = within(await screen.findByRole('region', { name: 'Material' }))
  await app.user.click(await material.findByRole('link', { name }))
  await screen.findByRole('heading', { name, level: 1 })
}

async function backToExam(app: App) {
  await app.user.click(screen.getByRole('link', { name: 'Volver a Matemáticas' }))
  await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
}

/** Waits until the Exam screen's Summary section shows whether it is Outdated. */
async function summaryShown() {
  return (await summarySection()).findByRole('button', { name: 'Regenerar' })
}

/** Saves a Subject's form and waits until it is saved (nothing left to save). */
async function saveSubject(app: App, subject: ReturnType<typeof within>) {
  await app.user.click(subject.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(subject.getByRole('button', { name: 'Guardar' })).toBeDisabled())
}

describe('an Outdated Summary', () => {
  const twoUnits = {
    subject: 'Matemáticas',
    period: q1,
    materials: [fractions, { name: 'Unidad 2', pages: ['Decimales: $0.5 = \\frac{1}{2}$'] }],
    summary: oldSummary,
  }

  it('is not Outdated while the Material and the Language are as it was built with', async () => {
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [twoUnits] })
    await openExam(app)
    await summaryShown()
    expect((await summarySection()).queryByText(OUTDATED)).not.toBeInTheDocument()

    // Renaming a Material doesn't change what the Summary says.
    await openMaterial(app, 'Unidad 1')
    const thisMaterial = within(screen.getByRole('region', { name: 'Este material' }))
    await app.user.clear(thisMaterial.getByLabelText('Nombre'))
    await app.user.type(thisMaterial.getByLabelText('Nombre'), 'Unidad 1 – Fracciones')
    await app.user.click(thisMaterial.getByRole('button', { name: 'Cambiar nombre' }))
    await screen.findByRole('heading', { name: 'Unidad 1 – Fracciones', level: 1 })
    await backToExam(app)
    await summaryShown()
    expect((await summarySection()).queryByText(OUTDATED)).not.toBeInTheDocument()
  })

  it('becomes Outdated when Material is added, and one tap brings it up to date', async () => {
    server.use(openRouter.readPage.text('Porcentajes.'), openRouter.structured.json(fractionsSummary))
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [twoUnits] })
    await openExam(app)
    await summaryShown()

    await app.user.upload(screen.getByLabelText('Agregar material'), photo('unidad 3.jpg'))

    const section = await summarySection()
    expect(await section.findByText(OUTDATED)).toBeInTheDocument()
    await app.user.click(section.getByRole('button', { name: 'Regenerar' }))

    expect(await screen.findByRole('heading', { name: 'Resumen de Matemáticas', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Fracciones equivalentes', level: 2 })).toBeInTheDocument()
    expect(screen.queryByText(OUTDATED)).not.toBeInTheDocument()
  })

  it('becomes Outdated when a Material is deleted', async () => {
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [twoUnits] })
    await openExam(app)
    await openMaterial(app, 'Unidad 2')

    const thisMaterial = within(screen.getByRole('region', { name: 'Este material' }))
    await app.user.click(thisMaterial.getByRole('button', { name: 'Eliminar material' }))
    await app.user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, eliminar' }))
    await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })

    expect(await (await summarySection()).findByText(OUTDATED)).toBeInTheDocument()
    await openSummary(app)
    expect(await screen.findByText(OUTDATED)).toBeInTheDocument()
    expect(screen.getByText('Resumen viejo de las fracciones.')).toBeInTheDocument()
  })

  it('becomes Outdated when a Page’s Recognized Text is corrected', async () => {
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [twoUnits] })
    await openExam(app)
    await openMaterial(app, 'Unidad 2')

    const text = within(screen.getByRole('region', { name: 'Texto reconocido' }))
    await app.user.click(await text.findByRole('button', { name: 'Corregir texto' }))
    const editor = text.getByRole('textbox', { name: 'Texto reconocido de la página 1' })
    await app.user.clear(editor)
    await app.user.type(editor, 'Decimales y fracciones.')
    await app.user.click(text.getByRole('button', { name: 'Guardar texto' }))
    await text.findByRole('button', { name: 'Corregir texto' })
    await backToExam(app)

    expect(await (await summarySection()).findByText(OUTDATED)).toBeInTheDocument()
  })

  it('becomes Outdated when the Subject’s Language changes, also after reopening the app', async () => {
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [twoUnits] })
    await app.user.click(await screen.findByRole('link', { name: 'Materias' }))
    const subject = within(await screen.findByRole('region', { name: 'Matemáticas' }))
    await app.user.selectOptions(subject.getByLabelText('Idioma'), 'English')
    await saveSubject(app, subject)
    await app.reopen()

    await openExam(app)
    expect(await (await summarySection()).findByText(OUTDATED)).toBeInTheDocument()
  })

  it('is no longer Outdated when the Language is changed back', async () => {
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [twoUnits] })
    await app.user.click(await screen.findByRole('link', { name: 'Materias' }))
    const subject = within(await screen.findByRole('region', { name: 'Matemáticas' }))
    await app.user.selectOptions(subject.getByLabelText('Idioma'), 'English')
    await saveSubject(app, subject)
    await app.user.selectOptions(subject.getByLabelText('Idioma'), 'Español')
    await saveSubject(app, subject)
    await app.reopen()

    await openExam(app)
    await summaryShown()
    expect((await summarySection()).queryByText(OUTDATED)).not.toBeInTheDocument()
  })
})

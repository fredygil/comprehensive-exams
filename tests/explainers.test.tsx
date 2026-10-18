import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OPENROUTER, openRouter, openRouterRequests, server, urlCitation } from './harness/openRouter'
import { renderApp } from './harness/renderApp'

const ana = { name: 'Ana', gradeLevel: 5 }
const subjects = [
  { name: 'Matemáticas', language: 'es' as const },
  { name: 'Science', language: 'en' as const },
]
const q1 = { schoolYearStart: 2026, quarter: 1 as const }
const fractions = {
  name: 'Unidad 1',
  pages: ['# Fracciones\n\nUna fracción tiene numerador y denominador.', 'Fracciones equivalentes: $\\frac{1}{2} = \\frac{2}{4}$'],
}
const mathExam = { subject: 'Matemáticas', period: q1, materials: [fractions] }

/** The LaTeX of every formula rendered in an element (KaTeX keeps it in a MathML annotation). */
function formulas(element: HTMLElement) {
  return [...element.querySelectorAll('annotation[encoding="application/x-tex"]')].map(
    (annotation) => annotation.textContent,
  )
}

const equivalentFractions = [
  '## Fracciones equivalentes',
  '',
  'Dos fracciones son equivalentes si representan la misma cantidad:',
  '',
  '$$',
  '\\frac{1}{2} = \\frac{2}{4}',
  '$$',
].join('\n')

const wikipedia = urlCitation('https://es.wikipedia.org/wiki/Fracci%C3%B3n', 'Fracción - Wikipedia')
const khan = urlCitation('https://es.khanacademy.org/math/fracciones', 'Fracciones equivalentes | Khan Academy')

type App = Awaited<ReturnType<typeof renderApp>>

async function openExam(app: App, subject = 'Matemáticas') {
  await app.user.click(await screen.findByRole('link', { name: new RegExp(subject) }))
  await screen.findByRole('heading', { name: subject, level: 1 })
}

async function explainers() {
  return within(await screen.findByRole('region', { name: 'Explicaciones' }))
}

/** The chat completion requests sent so far, as JSON bodies. */
async function chatBodies() {
  const requests = openRouterRequests.filter((r) => r.url === `${OPENROUTER}/chat/completions`)
  return Promise.all(requests.map((r) => r.clone().json()))
}

describe('topic suggestions', () => {
  it('suggests topics from the Exam’s Recognized Text as choices', async () => {
    server.use(openRouter.structured.json({ topics: ['Fracciones equivalentes', 'Suma de fracciones'] }))
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)

    const section = await explainers()
    await app.user.click(section.getByRole('button', { name: 'Sugerir temas' }))

    const choices = within(await section.findByRole('group', { name: 'Temas sugeridos' }))
    expect(choices.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Fracciones equivalentes',
      'Suma de fracciones',
    ])

    const [body] = await chatBodies()
    expect(body.model).toBe('anthropic/claude-haiku-5.5')
    expect(body.response_format.type).toBe('json_schema')
    expect(body.response_format.json_schema.strict).toBe(true)
    expect(body.provider).toEqual({ require_parameters: true })
    const prompt = body.messages.map((m: { content: string }) => m.content).join('\n')
    expect(prompt).toContain('Una fracción tiene numerador y denominador.')
    expect(prompt).toContain('Fracciones equivalentes: $\\frac{1}{2} = \\frac{2}{4}$')
    expect(prompt).toMatch(/Spanish/)
    expect(prompt).toMatch(/grade 5/)
  })
})

describe('generating an Explainer', () => {
  it('researches a suggested topic on the web and shows it with its sources', async () => {
    server.use(
      openRouter.structured.json({ topics: ['Fracciones equivalentes', 'Suma de fracciones'] }),
      openRouter.webSearch.answer(equivalentFractions, [
        wikipedia,
        khan,
        urlCitation('https://es.wikipedia.org/wiki/Fracci%C3%B3n', 'Fracción - Wikipedia'),
        { type: 'file', file: { hash: 'abc', name: 'page.pdf', content: [] } },
      ]),
    )
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)

    const section = await explainers()
    await app.user.click(section.getByRole('button', { name: 'Sugerir temas' }))
    const choices = within(await section.findByRole('group', { name: 'Temas sugeridos' }))
    await app.user.click(choices.getByRole('button', { name: 'Fracciones equivalentes' }))

    expect(await screen.findByRole('heading', { name: 'Fracciones equivalentes', level: 1 })).toBeInTheDocument()
    const explainer = screen.getByRole('article')
    expect(within(explainer).getByText(/representan la misma cantidad/)).toBeInTheDocument()
    expect(formulas(explainer)).toEqual(['\\frac{1}{2} = \\frac{2}{4}'])

    const sources = within(screen.getByRole('region', { name: 'Fuentes' }))
    const links = sources.getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Fracción - Wikipedia', 'https://es.wikipedia.org/wiki/Fracci%C3%B3n'],
      ['Fracciones equivalentes | Khan Academy', 'https://es.khanacademy.org/math/fracciones'],
    ])
  })

  it('asks for a web-researched answer in the Subject’s Language at the Grade Level', async () => {
    server.use(openRouter.webSearch.answer('Photosynthesis turns light into chemical energy.', [khan]))
    const app = await renderApp({
      student: { name: 'Ana', gradeLevel: 7 },
      openRouterKey: 'sk-or-v1-good',
      subjects,
      exams: [{ subject: 'Science', period: q1, materials: [{ name: 'Plants', pages: ['Leaves are green.'] }] }],
    })
    await openExam(app, 'Science')

    const section = await explainers()
    await app.user.type(section.getByLabelText('Tema'), 'Photosynthesis')
    await app.user.click(section.getByRole('button', { name: 'Crear explicación' }))
    await screen.findByRole('heading', { name: 'Photosynthesis', level: 1 })

    const [body] = await chatBodies()
    expect(body.model).toBe('anthropic/claude-haiku-5.5')
    expect(body.tools).toEqual([expect.objectContaining({ type: 'openrouter:web_search' })])
    expect(body.plugins).toBeUndefined()
    const prompt = body.messages.map((m: { content: string }) => m.content).join('\n')
    expect(prompt).toContain('Photosynthesis')
    expect(prompt).toMatch(/English/)
    expect(prompt).toMatch(/grade 7/)
    expect(prompt).toMatch(/prefer sources/i)
  })
})

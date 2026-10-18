import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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

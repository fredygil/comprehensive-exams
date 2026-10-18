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
  pages: ['# Fracciones\n\nUna fracción tiene numerador y denominador.', 'Fracciones equivalentes: $\\frac{1}{2} = \\frac{2}{4}$'],
}
const mathExam = { subject: 'Matemáticas', period: q1, materials: [fractions] }

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

import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { dataUrlOf, photo } from './harness/files'
import { OPENROUTER, openRouter, openRouterRequests, server } from './harness/openRouter'
import { renderApp } from './harness/renderApp'

const ana = { name: 'Ana', gradeLevel: 5 }
const subjects = [
  { name: 'Matemáticas', language: 'es' as const },
  { name: 'Science', language: 'en' as const },
]
const q1 = { schoolYearStart: 2026, quarter: 1 as const }
const mathExam = { subject: 'Matemáticas', period: q1 }

/** The LaTeX of every formula rendered in an element (KaTeX keeps it in a MathML annotation). */
function formulas(element: HTMLElement) {
  return [...element.querySelectorAll('annotation[encoding="application/x-tex"]')].map(
    (annotation) => annotation.textContent,
  )
}

type App = Awaited<ReturnType<typeof renderApp>>

async function openExam(app: App, subject = 'Matemáticas') {
  await app.user.click(await screen.findByRole('link', { name: new RegExp(subject) }))
  await screen.findByRole('heading', { name: subject, level: 1 })
}

async function openMaterial(app: App, name: string) {
  const material = within(await screen.findByRole('region', { name: 'Material' }))
  await app.user.click(await material.findByRole('link', { name }))
  await screen.findByRole('heading', { name, level: 1 })
}

describe('adding photo Material', () => {
  it('turns a photo into a Material named after its file, and reads it', async () => {
    server.use(openRouter.readPage.text('Las fracciones tienen numerador y denominador.'))
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)

    await app.user.upload(screen.getByLabelText('Agregar material'), photo('fracciones.jpg'))
    await openMaterial(app, 'fracciones')

    expect(screen.getByRole('img', { name: 'Página 1: original' })).toBeInTheDocument()
    const text = screen.getByRole('region', { name: 'Texto reconocido' })
    expect(
      await within(text).findByText('Las fracciones tienen numerador y denominador.'),
    ).toBeInTheDocument()
  })

  it('takes several photos at once, each its own Material', async () => {
    server.use(openRouter.readPage.texts(['Texto de la página uno.', 'Texto de la página dos.']))
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)

    await app.user.upload(screen.getByLabelText('Agregar material'), [
      photo('unidad 1.jpg'),
      photo('unidad 2.png'),
    ])

    const material = within(screen.getByRole('region', { name: 'Material' }))
    expect(
      (await material.findAllByRole('link')).map((link) => link.textContent),
    ).toEqual(['unidad 1', 'unidad 2'])

    await openMaterial(app, 'unidad 2')
    expect(await screen.findByText('Texto de la página dos.')).toBeInTheDocument()
    await app.user.click(screen.getByRole('link', { name: 'Volver a Matemáticas' }))
    await openMaterial(app, 'unidad 1')
    expect(await screen.findByText('Texto de la página uno.')).toBeInTheDocument()
  })

  it('sends each Page to the reading model as an image with a transcription prompt', async () => {
    server.use(openRouter.readPage.text('Photosynthesis needs light.'))
    const app = await renderApp({
      student: ana,
      openRouterKey: 'sk-or-v1-good',
      subjects,
      exams: [{ subject: 'Science', period: q1 }],
    })
    await openExam(app, 'Science')

    await app.user.upload(screen.getByLabelText('Agregar material'), photo('leaf.png', 'PNG page bytes'))
    await openMaterial(app, 'leaf')
    await screen.findByText('Photosynthesis needs light.')

    const [request] = openRouterRequests.filter((r) => r.url === `${OPENROUTER}/chat/completions`)
    expect(request.headers.get('Authorization')).toBe('Bearer sk-or-v1-good')
    expect(request.headers.get('HTTP-Referer')).toBe('https://fredygil.github.io/comprehensive-exams/')
    const body = await request.json()
    expect(body.model).toBe('google/gemini-3.1-flash-lite')
    const [message] = body.messages
    const image = message.content.find((part: { type: string }) => part.type === 'image_url')
    expect(image.image_url.url).toBe(dataUrlOf('image/png', 'PNG page bytes'))
    const prompt = message.content.find((part: { type: string }) => part.type === 'text').text
    expect(prompt).toMatch(/grade 5/)
    expect(prompt).toMatch(/English/)
    expect(prompt).toMatch(/transcribe/i)
    expect(prompt).toMatch(/do not translate/i)
    expect(prompt).toMatch(/LaTeX/)
  })

  it('shows the Recognized Text as Markdown with real formulas', async () => {
    server.use(
      openRouter.readPage.text(
        [
          '## Área del rectángulo',
          '',
          'El área es $A = b \\cdot h$, por ejemplo:',
          '',
          '$$',
          '\\frac{3}{4} + \\frac{1}{4} = 1',
          '$$',
          '',
          'Y también \\(x^2\\).',
        ].join('\n'),
      ),
    )
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)

    await app.user.upload(screen.getByLabelText('Agregar material'), photo('areas.jpg'))
    await openMaterial(app, 'areas')

    const text = screen.getByRole('region', { name: 'Texto reconocido' })
    expect(await within(text).findByRole('heading', { name: 'Área del rectángulo' })).toBeInTheDocument()
    expect(formulas(text)).toEqual(['A = b \\cdot h', '\\frac{3}{4} + \\frac{1}{4} = 1', 'x^2'])
    expect(text.querySelector('.katex-display')).not.toBeNull()
    expect(text).not.toHaveTextContent('$')
  })
})

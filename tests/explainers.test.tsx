import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { photo } from './harness/files'
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

const twoExplainers = [
  { topic: 'Fracciones equivalentes', markdown: equivalentFractions, sources: [] },
  { topic: 'Suma de fracciones', markdown: 'Se suman los numeradores.', sources: [] },
]

type App = Awaited<ReturnType<typeof renderApp>>

async function openExam(app: App, subject = 'Matemáticas') {
  await app.user.click(await screen.findByRole('link', { name: new RegExp(subject) }))
  await screen.findByRole('heading', { name: subject, level: 1 })
}

/** The Exam screen's "Explicaciones" section, once its actions have loaded. */
async function explainers() {
  const section = within(await screen.findByRole('region', { name: 'Explicaciones' }))
  await section.findByLabelText('Tema')
  return section
}

/** The topics of the Explainers listed on the Exam screen, once loaded. */
async function listedExplainers() {
  const list = within(await (await explainers()).findByRole('list', { name: 'Tus explicaciones' }))
  return list.getAllByRole('listitem').map((item) => item.textContent)
}

/** The chat completion requests sent so far, as JSON bodies. */
async function chatBodies() {
  const requests = openRouterRequests.filter((r) => r.url === `${OPENROUTER}/chat/completions`)
  return Promise.all(requests.map((r) => r.clone().json()))
}

describe('topic suggestions', () => {
  it('suggests topics from the Exam’s Recognized Text as choices', async () => {
    server.use(openRouter.topics.json({ topics: ['Fracciones equivalentes', 'Suma de fracciones'] }))
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
      openRouter.topics.json({ topics: ['Fracciones equivalentes', 'Suma de fracciones'] }),
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

describe('when generating fails', () => {
  it('shows why in Spanish and keeps the topic to try again', async () => {
    server.use(openRouter.webSearch.status(402, { limit_source: 'openrouter_credits' }))
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)

    const section = await explainers()
    await app.user.type(section.getByLabelText('Tema'), 'Fracciones equivalentes')
    await app.user.click(section.getByRole('button', { name: 'Crear explicación' }))

    expect(await section.findByRole('alert')).toHaveTextContent(
      'Se acabó el saldo de la clave de OpenRouter. Pídele a un adulto que lo recargue.',
    )
    expect(section.getByLabelText('Tema')).toHaveValue('Fracciones equivalentes')

    server.use(openRouter.webSearch.answer(equivalentFractions, [wikipedia]))
    await app.user.click(section.getByRole('button', { name: 'Crear explicación' }))
    expect(await screen.findByRole('heading', { name: 'Fracciones equivalentes', level: 1 })).toBeInTheDocument()
  })

  it.each([
    ['is not JSON', openRouter.topics.raw('Fracciones, sumas')],
    ['has no topics', openRouter.topics.json({ topics: [] })],
  ])('says the answer was unusable when the topic list %s', async (_, response) => {
    server.use(response)
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)

    const section = await explainers()
    await app.user.click(section.getByRole('button', { name: 'Sugerir temas' }))

    expect(await section.findByRole('alert')).toHaveTextContent(
      'La respuesta del modelo no se pudo usar. Inténtalo de nuevo.',
    )
    expect(section.queryByRole('group', { name: 'Temas sugeridos' })).not.toBeInTheDocument()
  })

  it('says the tablet is offline', async () => {
    server.use(openRouter.topics.offline())
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)

    const section = await explainers()
    await app.user.click(section.getByRole('button', { name: 'Sugerir temas' }))

    expect(await section.findByRole('alert')).toHaveTextContent(
      'No hay conexión a internet. Conéctate e inténtalo de nuevo.',
    )
  })
})

describe('when Explainers cannot be made yet', () => {
  it('asks for the key first', async () => {
    const app = await renderApp({ student: ana, subjects, exams: [mathExam] })
    await openExam(app)

    const section = await explainers()
    expect(await section.findByRole('note')).toHaveTextContent('Configura la clave de OpenRouter')
    expect(section.getByRole('button', { name: 'Sugerir temas' })).toBeDisabled()
    await app.user.type(section.getByLabelText('Tema'), 'Fracciones')
    expect(section.getByRole('button', { name: 'Crear explicación' })).toBeDisabled()
  })

  it('waits for at least one read Page', async () => {
    const app = await renderApp({
      student: ana,
      openRouterKey: 'sk-or-v1-good',
      subjects,
      exams: [{ subject: 'Matemáticas', period: q1 }],
    })
    await openExam(app)

    const section = await explainers()
    expect(await section.findByText('Agrega material y espera a que se lea al menos una página.')).toBeInTheDocument()
    expect(section.getByRole('button', { name: 'Sugerir temas' })).toBeDisabled()
    await app.user.type(section.getByLabelText('Tema'), 'Fracciones')
    expect(section.getByRole('button', { name: 'Crear explicación' })).toBeDisabled()
  })

  it('doesn’t warn about Pages not read yet, since an Explainer is researched on the web', async () => {
    server.use(openRouter.readPage.status(400))
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)
    await app.user.upload(screen.getByLabelText('Agregar material'), photo('unidad 2.jpg'))

    // The Summary, made from her Material, does warn once the new Page has failed.
    const summary = within(screen.getByRole('region', { name: 'Resumen' }))
    expect(await summary.findByText('1 página aún no se incluye.')).toBeInTheDocument()
    const section = await explainers()
    expect(section.queryByText('1 página aún no se incluye.')).not.toBeInTheDocument()
    expect(section.getByRole('button', { name: 'Sugerir temas' })).toBeEnabled()
  })
})

describe('keeping Explainers', () => {
  it('keeps any number of Explainers on the Exam, readable offline after a restart', async () => {
    server.use(
      openRouter.webSearch.answers([
        { markdown: equivalentFractions, annotations: [wikipedia] },
        { markdown: 'Para sumar fracciones con igual denominador se suman los numeradores.', annotations: [khan] },
      ]),
    )
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)

    for (const topic of ['Fracciones equivalentes', 'Suma de fracciones']) {
      const section = await explainers()
      await app.user.type(section.getByLabelText('Tema'), topic)
      await app.user.click(section.getByRole('button', { name: 'Crear explicación' }))
      await screen.findByRole('heading', { name: topic, level: 1 })
      await app.user.click(screen.getByRole('link', { name: 'Volver a Matemáticas' }))
    }

    expect(await listedExplainers()).toEqual(['Suma de fracciones', 'Fracciones equivalentes'])

    await app.reopen()
    server.use(openRouter.webSearch.offline(), openRouter.topics.offline())
    await openExam(app)
    await app.user.click(await (await explainers()).findByRole('link', { name: 'Fracciones equivalentes' }))

    await screen.findByRole('heading', { name: 'Fracciones equivalentes', level: 1 })
    expect(formulas(screen.getByRole('article'))).toEqual(['\\frac{1}{2} = \\frac{2}{4}'])
    expect(within(screen.getByRole('region', { name: 'Fuentes' })).getByRole('link')).toHaveTextContent(
      'Fracción - Wikipedia',
    )
    expect(await chatBodies()).toHaveLength(2)
  })

  it('deletes an Explainer after confirmation', async () => {
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [{ ...mathExam, explainers: twoExplainers }],
    })
    await openExam(app)
    await app.user.click(await (await explainers()).findByRole('link', { name: 'Fracciones equivalentes' }))
    await screen.findByRole('heading', { name: 'Fracciones equivalentes', level: 1 })

    await app.user.click(screen.getByRole('button', { name: 'Eliminar explicación' }))
    const confirm = within(await screen.findByRole('alertdialog', { name: '¿Eliminar esta explicación?' }))
    expect(confirm.getByRole('listitem')).toHaveTextContent('La explicación «Fracciones equivalentes»')
    await app.user.click(confirm.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('heading', { name: 'Fracciones equivalentes', level: 1 })).toBeInTheDocument()

    await app.user.click(screen.getByRole('button', { name: 'Eliminar explicación' }))
    await app.user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, eliminar' }),
    )

    await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
    expect(await listedExplainers()).toEqual(['Suma de fracciones'])

    await app.reopen()
    await openExam(app)
    expect(await listedExplainers()).toEqual(['Suma de fracciones'])
  })
})

describe('deleting an Exam with Explainers', () => {
  it('names them in the confirmation and deletes them with the Exam', async () => {
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [{ ...mathExam, explainers: twoExplainers }],
    })
    await openExam(app)

    await app.user.click(screen.getByRole('button', { name: 'Eliminar examen' }))
    const confirm = within(await screen.findByRole('alertdialog', { name: '¿Eliminar este examen?' }))
    expect(confirm.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'El examen de Matemáticas de 2026–2027 · Q1',
      '1 material',
      '2 explicaciones',
    ])
    await app.user.click(confirm.getByRole('button', { name: 'Sí, eliminar' }))
    await screen.findByRole('heading', { name: /Ana/, level: 1 })

    // A new Exam for the same Subject and Period starts with no Explainers.
    await app.user.click(screen.getByRole('link', { name: 'Nuevo examen' }))
    await app.user.selectOptions(await screen.findByLabelText('Materia'), 'Matemáticas')
    await app.user.click(screen.getByRole('button', { name: 'Crear examen' }))
    await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
    expect(await (await explainers()).findByText('Aún no tienes explicaciones.')).toBeInTheDocument()
  })

  it('names them when deleting the Subject', async () => {
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [{ subject: 'Matemáticas', period: q1, explainers: twoExplainers.slice(0, 1) }],
    })
    await app.user.click(await screen.findByRole('link', { name: 'Materias' }))
    const subject = within(await screen.findByRole('region', { name: 'Matemáticas' }))
    await app.user.click(subject.getByRole('button', { name: 'Eliminar materia' }))

    const confirm = within(await screen.findByRole('alertdialog'))
    expect(confirm.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'La materia Matemáticas',
      'El examen de Matemáticas de 2026–2027 · Q1: 1 explicación',
    ])
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { OPENROUTER, openRouter, openRouterRequests, server, type ScriptedQuestion } from './harness/openRouter'
import { renderApp, type RenderAppOptions } from './harness/renderApp'

const ana = { name: 'Ana', gradeLevel: 5 }
const subjects = [
  { name: 'Matemáticas', language: 'es' as const },
  { name: 'Science', language: 'en' as const },
]
const q1 = { schoolYearStart: 2026, quarter: 1 as const }

type App = Awaited<ReturnType<typeof renderApp>>

/** A tablet with a key, Ana, and a Matemáticas Exam holding the given read Material. */
function withMaterial(materials: { name: string; pages: string[] }[]): RenderAppOptions {
  return {
    student: ana,
    openRouterKey: 'sk-or-v1-good',
    subjects,
    exams: [{ subject: 'Matemáticas', period: q1, materials }],
  }
}

async function openExam(app: App, subject = 'Matemáticas') {
  await app.user.click(await screen.findByRole('link', { name: new RegExp(subject) }))
  await screen.findByRole('heading', { name: subject, level: 1 })
}

/**
 * Question n as the model writes it: the correct option is always written
 * first ("Correcta n"), so only the app's shuffling moves it.
 */
function question(n: number, sourceMaterialId = '1'): ScriptedQuestion {
  return {
    prompt: `Pregunta número ${n}`,
    options: [`Correcta ${n}`, `Incorrecta ${n}a`, `Incorrecta ${n}b`, `Incorrecta ${n}c`],
    correctIndex: 0,
    explanation: `Explicación ${n}`,
    sourceMaterialId,
  }
}

/** The LaTeX of every formula rendered in an element (KaTeX keeps it in a MathML annotation). */
function formulas(element: HTMLElement) {
  return [...element.querySelectorAll('annotation[encoding="application/x-tex"]')].map(
    (annotation) => annotation.textContent,
  )
}

const questions = (count: number) => Array.from({ length: count }, (_, i) => question(i + 1))

/** From the Exam screen: choose the count and tap "Practicar"; waits for the first Question. */
async function startQuiz(app: App, count: number) {
  const practice = await practiceSection()
  await app.user.selectOptions(await practice.findByLabelText('Número de preguntas'), String(count))
  await app.user.click(practice.getByRole('button', { name: 'Practicar' }))
  await screen.findByRole('heading', { name: `Pregunta 1 de ${count}` })
}

/** The option texts on the current Question's screen, in the order shown. */
function shownOptions() {
  return screen.getAllByRole('radio').map((radio) => radio.closest('label')!.textContent)
}

async function practiceSection() {
  return within(await screen.findByRole('region', { name: 'Practicar' }))
}

describe('starting a Practice Quiz', () => {
  it('asks how many Questions, from 1 to 20, 10 by default', async () => {
    const app = await renderApp(withMaterial([{ name: 'Unidad 1', pages: ['Las fracciones.'] }]))
    await openExam(app)

    const practice = await practiceSection()
    const count = await practice.findByLabelText('Número de preguntas')
    expect(count).toHaveValue('10')
    expect(within(count).getAllByRole('option').map((option) => option.textContent)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 1)),
    )
    expect(practice.getByRole('button', { name: 'Practicar' })).toBeEnabled()
  })

  it('cannot start, and says why, while the Exam has no read Pages', async () => {
    const app = await renderApp({
      student: ana,
      openRouterKey: 'sk-or-v1-good',
      subjects,
      exams: [{ subject: 'Matemáticas', period: q1 }],
    })
    await openExam(app)

    const practice = await practiceSection()
    expect(await practice.findByRole('button', { name: 'Practicar' })).toBeDisabled()
    expect(
      practice.getByText('Para practicar, primero agrega material y espera a que se lea al menos una página.'),
    ).toBeInTheDocument()
  })
})

describe('when a Practice Quiz cannot be generated', () => {
  const offline = 'No hay conexión a internet. Conéctate e inténtalo de nuevo.'
  const noCredit = 'Se acabó el saldo de la clave de OpenRouter. Pídele a un adulto que lo recargue.'
  const badResponse = 'La respuesta del modelo no se pudo usar. Inténtalo de nuevo.'

  it.each([
    ['the tablet is offline', openRouter.practiceQuiz.offline(), offline],
    ['credit has run out (402)', openRouter.practiceQuiz.status(402, { limit_source: 'openrouter_credits' }), noCredit],
    ['the answer is not JSON', openRouter.practiceQuiz.content('Aquí tienes tu quiz: ...'), badResponse],
    [
      'no Question has four options',
      openRouter.practiceQuiz.questions([{ ...question(1), options: ['a', 'b', 'c'] }]),
      badResponse,
    ],
  ])('says so in Spanish when %s, and can try again', async (_, failure, message) => {
    server.use(failure)
    const app = await renderApp(withMaterial([{ name: 'Unidad 1', pages: ['Las fracciones.'] }]))
    await openExam(app)

    const practice = await practiceSection()
    await app.user.click(await practice.findByRole('button', { name: 'Practicar' }))

    expect(await practice.findByRole('alert')).toHaveTextContent(message)
    server.use(openRouter.practiceQuiz.questions(questions(10)))
    await app.user.click(practice.getByRole('button', { name: 'Practicar' }))
    expect(await screen.findByRole('heading', { name: 'Pregunta 1 de 10' })).toBeInTheDocument()
  })

  it('needs a key', async () => {
    const app = await renderApp({ ...withMaterial([{ name: 'Unidad 1', pages: ['Las fracciones.'] }]), openRouterKey: undefined })
    await openExam(app)

    const practice = await practiceSection()
    expect(await practice.findByRole('button', { name: 'Practicar' })).toBeDisabled()
    expect(practice.getByRole('link', { name: 'Configurar la clave' })).toBeInTheDocument()
  })
})

describe('generating a Practice Quiz', () => {
  it('keeps only well-formed Questions from the Exam\'s own Materials, up to the count asked', async () => {
    server.use(
      openRouter.practiceQuiz.questions([
        question(1),
        { ...question(2), options: ['a', 'b', 'c'] },
        { ...question(3), correctIndex: 4 },
        { ...question(4), sourceMaterialId: '99' },
        question(5),
        question(6),
      ]),
    )
    const app = await renderApp(withMaterial([{ name: 'Unidad 1', pages: ['Las fracciones.'] }]))
    await openExam(app)

    await startQuiz(app, 2)

    expect(screen.getByText('Pregunta número 1')).toBeInTheDocument()
    await app.user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Pregunta número 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })

  it('sends only the Exam\'s Recognized Text, the Subject\'s Language and the Grade Level', async () => {
    server.use(openRouter.practiceQuiz.questions(questions(5)))
    const app = await renderApp({
      student: { name: 'Ana', gradeLevel: 7 },
      openRouterKey: 'sk-or-v1-good',
      subjects,
      exams: [
        {
          subject: 'Science',
          period: q1,
          materials: [
            { name: 'Unit 1', pages: ['Photosynthesis needs light.', 'Leaves are green.'] },
            { name: 'Unit 2', pages: ['Roots take in water.'] },
          ],
        },
        { subject: 'Matemáticas', period: q1, materials: [{ name: 'Unidad 1', pages: ['Las fracciones.'] }] },
      ],
    })
    await openExam(app, 'Science')

    await startQuiz(app, 5)

    const [request] = openRouterRequests.filter((r) => r.url === `${OPENROUTER}/chat/completions`)
    const body = await request.json()
    expect(body.model).toBe('anthropic/claude-haiku-5.5')
    expect(body.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true } })
    expect(body.provider).toEqual({ require_parameters: true })
    const prompt = body.messages.map((message: { content: string }) => message.content).join('\n')
    expect(prompt).toContain('Photosynthesis needs light.')
    expect(prompt).toContain('Leaves are green.')
    expect(prompt).toContain('Roots take in water.')
    expect(prompt).not.toContain('Las fracciones.')
    expect(prompt).toMatch(/grade 7/)
    expect(prompt).toMatch(/English/)
    expect(prompt).not.toMatch(/Spanish/)
    expect(prompt).toMatch(/5 multiple-choice questions/)
  })
})

describe('taking a Practice Quiz', () => {
  it('generates the Questions and shows the first one with its four options', async () => {
    server.use(openRouter.practiceQuiz.questions(questions(3)))
    const app = await renderApp(withMaterial([{ name: 'Unidad 1', pages: ['Las fracciones.'] }]))
    await openExam(app)

    await startQuiz(app, 3)

    expect(screen.getByText('Pregunta número 1')).toBeInTheDocument()
    expect(shownOptions().sort()).toEqual(['Correcta 1', 'Incorrecta 1a', 'Incorrecta 1b', 'Incorrecta 1c'])
  })

  it('shows one Question per screen, back and forth, keeping and changing answers', async () => {
    server.use(openRouter.practiceQuiz.questions(questions(3)))
    const app = await renderApp(withMaterial([{ name: 'Unidad 1', pages: ['Las fracciones.'] }]))
    await openExam(app)
    await startQuiz(app, 3)

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    await app.user.click(screen.getByRole('radio', { name: 'Incorrecta 1a' }))
    await app.user.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(await screen.findByRole('heading', { name: 'Pregunta 2 de 3' })).toBeInTheDocument()
    expect(screen.getByText('Pregunta número 2')).toBeInTheDocument()
    expect(screen.queryByText('Pregunta número 1')).not.toBeInTheDocument()
    expect(screen.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked)).toEqual([])
    await app.user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByRole('heading', { name: 'Pregunta 3 de 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()

    await app.user.click(screen.getByRole('button', { name: 'Anterior' }))
    await app.user.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(await screen.findByRole('heading', { name: 'Pregunta 1 de 3' })).toBeInTheDocument()
    expect(await screen.findByRole('radio', { name: 'Incorrecta 1a' })).toBeChecked()

    await app.user.click(screen.getByRole('radio', { name: 'Correcta 1' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Correcta 1' })).toBeChecked())
    expect(screen.getByRole('radio', { name: 'Incorrecta 1a' })).not.toBeChecked()
  })

  it('puts the correct option in different positions, not where the model wrote it', async () => {
    server.use(openRouter.practiceQuiz.questions(questions(8)))
    const app = await renderApp(withMaterial([{ name: 'Unidad 1', pages: ['Las fracciones.'] }]))
    await openExam(app)
    await startQuiz(app, 8)

    const correctPositions: number[] = []
    for (let n = 1; n <= 8; n++) {
      await screen.findByRole('heading', { name: `Pregunta ${n} de 8` })
      const options = shownOptions()
      expect(options.slice().sort()).toEqual([`Correcta ${n}`, `Incorrecta ${n}a`, `Incorrecta ${n}b`, `Incorrecta ${n}c`])
      correctPositions.push(options.indexOf(`Correcta ${n}`))
      if (n < 8) await app.user.click(screen.getByRole('button', { name: 'Siguiente' }))
    }

    expect(new Set(correctPositions).size).toBeGreaterThan(1)
  })
})

describe('submitting a Practice Quiz', () => {
  it('shows the Score and Feedback for each wrong answer, with the network down', async () => {
    server.use(
      openRouter.practiceQuiz.questions([question(1, '1'), question(2, '2'), question(3, '1'), question(4, '2')]),
    )
    const app = await renderApp(
      withMaterial([
        { name: 'Unidad 1', pages: ['Las fracciones.'] },
        { name: 'Unidad 2', pages: ['Los decimales.'] },
      ]),
    )
    await openExam(app)
    await startQuiz(app, 4)

    // Once created, the quiz needs no network.
    server.use(http.all(`${OPENROUTER}/*`, () => HttpResponse.error()))
    const sent = openRouterRequests.length
    for (const choice of ['Correcta 1', 'Incorrecta 2a', 'Incorrecta 3c', 'Correcta 4']) {
      await app.user.click(await screen.findByRole('radio', { name: choice }))
      if (choice !== 'Correcta 4') await app.user.click(screen.getByRole('button', { name: 'Siguiente' }))
    }
    await app.user.click(screen.getByRole('button', { name: 'Entregar' }))

    expect(await screen.findByRole('heading', { name: 'Resultado' })).toBeInTheDocument()
    expect(screen.getByText('2 / 4')).toBeInTheDocument()
    const feedback = within(screen.getByRole('region', { name: 'Respuestas incorrectas' }))
    const items = feedback.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Pregunta 2')
    expect(items[0]).toHaveTextContent('Pregunta número 2')
    expect(items[0]).toHaveTextContent('Tu respuesta: Incorrecta 2a')
    expect(items[0]).toHaveTextContent('Respuesta correcta: Correcta 2')
    expect(items[0]).toHaveTextContent('Explicación 2')
    expect(items[0]).toHaveTextContent('Material: Unidad 2')
    expect(items[1]).toHaveTextContent('Tu respuesta: Incorrecta 3c')
    expect(items[1]).toHaveTextContent('Respuesta correcta: Correcta 3')
    expect(items[1]).toHaveTextContent('Material: Unidad 1')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(openRouterRequests.length).toBe(sent)
  })

  it('says so when every answer is right', async () => {
    server.use(openRouter.practiceQuiz.questions(questions(1)))
    const app = await renderApp(withMaterial([{ name: 'Unidad 1', pages: ['Las fracciones.'] }]))
    await openExam(app)
    await startQuiz(app, 1)

    await app.user.click(screen.getByRole('radio', { name: 'Correcta 1' }))
    await app.user.click(screen.getByRole('button', { name: 'Entregar' }))

    expect(await screen.findByText('1 / 1')).toBeInTheDocument()
    expect(screen.getByText('¡Respondiste todo bien!')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Respuestas incorrectas' })).not.toBeInTheDocument()
  })
})

describe('Questions with Markdown and math', () => {
  it('renders formulas and Markdown in the Question, its options and its Feedback', async () => {
    server.use(
      openRouter.practiceQuiz.questions([
        {
          prompt: '¿Cuánto es $\\frac{1}{2} + \\frac{1}{4}$?',
          options: ['$\\frac{3}{4}$', '$\\frac{2}{6}$', '**ninguna**', '$1$'],
          correctIndex: 0,
          explanation: 'Se usa el común denominador: $\\frac{2}{4} + \\frac{1}{4}$.',
          sourceMaterialId: '1',
        },
      ]),
    )
    const app = await renderApp(withMaterial([{ name: 'Unidad 1', pages: ['Las fracciones.'] }]))
    await openExam(app)
    await startQuiz(app, 1)

    // Not by the prompt: jsdom can't compute an accessible name made of KaTeX output.
    const quiz = screen.getByRole('region', { name: 'Pregunta 1 de 1' })
    expect(formulas(quiz).sort()).toEqual(['1', '\\frac{1}{2} + \\frac{1}{4}', '\\frac{2}{6}', '\\frac{3}{4}'])
    expect(within(quiz).getByText('ninguna').tagName).toBe('STRONG')
    expect(quiz).not.toHaveTextContent('$')

    await app.user.click(within(quiz).getByText('ninguna'))
    await app.user.click(screen.getByRole('button', { name: 'Entregar' }))

    const feedback = await screen.findByRole('region', { name: 'Respuestas incorrectas' })
    expect(formulas(feedback)).toEqual([
      '\\frac{1}{2} + \\frac{1}{4}',
      '\\frac{3}{4}',
      '\\frac{2}{4} + \\frac{1}{4}',
    ])
    expect(within(feedback).getByText('ninguna').tagName).toBe('STRONG')
    expect(feedback).not.toHaveTextContent('$')
  })
})

describe('deleting an Exam with quizzes', () => {
  it('names its quizzes in the confirmation and deletes them with it', async () => {
    server.use(openRouter.practiceQuiz.questions(questions(2)))
    const app = await renderApp(withMaterial([{ name: 'Unidad 1', pages: ['Las fracciones.'] }]))
    await openExam(app)
    await startQuiz(app, 2)
    const quizUrl = window.location.hash
    await app.user.click(screen.getByRole('link', { name: 'Volver a Matemáticas' }))
    await startQuiz(app, 2)
    await app.user.click(screen.getByRole('link', { name: 'Volver a Matemáticas' }))

    await app.user.click(await screen.findByRole('button', { name: 'Eliminar examen' }))
    const confirm = within(await screen.findByRole('alertdialog', { name: '¿Eliminar este examen?' }))
    expect(confirm.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'El examen de Matemáticas de 2026–2027 · Q1',
      '1 material',
      '2 quizzes',
    ])
    await app.user.click(confirm.getByRole('button', { name: 'Sí, eliminar' }))
    await screen.findByRole('heading', { name: /Ana/, level: 1 })

    window.location.hash = quizUrl
    await waitFor(() => expect(window.location.hash).toBe('#/'))
    expect(screen.queryByRole('heading', { name: 'Quiz de práctica' })).not.toBeInTheDocument()
  })
})

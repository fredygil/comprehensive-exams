import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

    expect(await screen.findByRole('img', { name: 'Página 1: original' })).toHaveAttribute('src')
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

describe('when a Page cannot be read', () => {
  const invalidKey = 'La clave de OpenRouter no es válida. Pídele a un adulto que la revise en Ajustes.'
  const noCredit = 'Se acabó el saldo de la clave de OpenRouter. Pídele a un adulto que lo recargue.'
  const offline = 'No hay conexión a internet. Conéctate e inténtalo de nuevo.'
  const busy = 'El modelo está ocupado. Espera un momento e inténtalo de nuevo.'
  const unavailable = 'El servicio no está disponible ahora. Inténtalo de nuevo en un rato.'
  const badResponse = 'La respuesta del modelo no se pudo usar. Inténtalo de nuevo.'

  it.each([
    ['the key is invalid (401)', openRouter.readPage.status(401), invalidKey],
    ['credit has run out (402)', openRouter.readPage.status(402, { limit_source: 'openrouter_credits' }), noCredit],
    ['the key limit is spent (403)', openRouter.readPage.status(403, { limit_source: 'openrouter_key_limit' }), noCredit],
    ['the tablet is offline', openRouter.readPage.offline(), offline],
    ['the model is busy (429)', openRouter.readPage.status(429), busy],
    ['the provider is down (503)', openRouter.readPage.status(503), unavailable],
    ['the answer was cut off', openRouter.readPage.cutOff(), badResponse],
    ['the request is rejected (400)', openRouter.readPage.status(400), badResponse],
  ])('says so in Spanish when %s', async (_, failure, message) => {
    server.use(failure)
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)

    await app.user.upload(screen.getByLabelText('Agregar material'), photo('fracciones.jpg'))
    await openMaterial(app, 'fracciones')

    const text = within(screen.getByRole('region', { name: 'Texto reconocido' }))
    expect(await text.findByRole('alert')).toHaveTextContent(message)
  })
})

describe('after reading', () => {
  it('shows the Material and its Recognized Text offline, after reopening the app', async () => {
    server.use(openRouter.readPage.text('Los números primos solo se dividen entre 1 y sí mismos.'))
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)
    await app.user.upload(screen.getByLabelText('Agregar material'), photo('primos.jpg'))
    await openMaterial(app, 'primos')
    await screen.findByText('Los números primos solo se dividen entre 1 y sí mismos.')
    const sent = openRouterRequests.length

    server.use(openRouter.readPage.offline(), openRouter.key.offline())
    await app.reopen()
    await openExam(app)
    await openMaterial(app, 'primos')

    expect(await screen.findByRole('img', { name: 'Página 1: original' })).toHaveAttribute('src')
    expect(
      await screen.findByText('Los números primos solo se dividen entre 1 y sí mismos.'),
    ).toBeInTheDocument()
    expect(openRouterRequests).toHaveLength(sent)
  })
})

describe('deleting an Exam with Material', () => {
  it('names the Material in the confirmation and deletes it with the Exam', async () => {
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [{ ...mathExam, materials: [{ name: 'a', pages: ['Texto a.'] }, { name: 'b', pages: ['Texto b.'] }] }],
    })
    await openExam(app)
    await openMaterial(app, 'b')
    expect(await screen.findByText('Texto b.')).toBeInTheDocument()
    await app.user.click(screen.getByRole('link', { name: 'Volver a Matemáticas' }))
    await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })

    await app.user.click(screen.getByRole('button', { name: 'Eliminar examen' }))
    const confirm = within(await screen.findByRole('alertdialog', { name: '¿Eliminar este examen?' }))
    expect(confirm.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'El examen de Matemáticas de 2026–2027 · Q1',
      '2 materiales',
    ])
    await app.user.click(confirm.getByRole('button', { name: 'Sí, eliminar' }))
    await screen.findByRole('heading', { name: /Ana/, level: 1 })

    // A new Exam for the same Subject and Period starts empty.
    await app.user.click(screen.getByRole('link', { name: 'Nuevo examen' }))
    await app.user.selectOptions(await screen.findByLabelText('Materia'), 'Matemáticas')
    await app.user.click(screen.getByRole('button', { name: 'Crear examen' }))
    await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
    expect(
      await within(screen.getByRole('region', { name: 'Material' })).findByText(
        'Aún no hay material para este examen.',
      ),
    ).toBeInTheDocument()
  })
})

describe('adding Material with no key saved', () => {
  it('keeps its Pages waiting, says why, and reads them once a key is saved', async () => {
    server.use(openRouter.readPage.text('Texto leído después.'))
    const app = await renderApp({ student: ana, subjects, exams: [mathExam] })
    await openExam(app)

    await app.user.upload(screen.getByLabelText('Agregar material'), photo('fracciones.jpg'))
    await openMaterial(app, 'fracciones')

    const text = within(screen.getByRole('region', { name: 'Texto reconocido' }))
    expect(await text.findByRole('link', { name: 'Configurar la clave' })).toBeInTheDocument()
    expect(openRouterRequests).toHaveLength(0)

    await app.user.click(text.getByRole('link', { name: 'Configurar la clave' }))
    await app.user.type(await screen.findByLabelText('Clave'), 'sk-or-v1-good')
    await app.user.click(screen.getByRole('button', { name: 'Guardar clave' }))
    await screen.findByText('Clave guardada.')

    await app.user.click(screen.getByRole('link', { name: 'Inicio' }))
    await openExam(app)
    await openMaterial(app, 'fracciones')
    expect(await screen.findByText('Texto leído después.')).toBeInTheDocument()
  })
})

describe('choosing a file that is not a photo', () => {
  it('says which file could not be added and adds the rest', async () => {
    server.use(openRouter.readPage.text('Texto.'))
    await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    // The Android picker doesn't always honour `accept`.
    const user = userEvent.setup({ applyAccept: false })
    await user.click(await screen.findByRole('link', { name: /Matemáticas/ }))
    await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })

    await user.upload(screen.getByLabelText('Agregar material'), [
      new File(['hola'], 'notas.txt', { type: 'text/plain' }),
      photo('unidad 1.jpg'),
    ])

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo agregar «notas.txt»: solo se pueden agregar fotos JPG o PNG.',
    )
    const material = within(screen.getByRole('region', { name: 'Material' }))
    expect((await material.findAllByRole('link')).map((link) => link.textContent)).toEqual(['unidad 1'])
  })
})

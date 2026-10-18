import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { photo } from './harness/files'
import { OPENROUTER, openRouter, openRouterRequests, server } from './harness/openRouter'
import { renderApp } from './harness/renderApp'

const ana = { name: 'Ana', gradeLevel: 5 }
const subjects = [{ name: 'Matemáticas', language: 'es' as const }]
const q1 = { schoolYearStart: 2026, quarter: 1 as const }

/** Page reading requests sent so far in this test. */
const readRequests = () => openRouterRequests.filter((r) => r.url === `${OPENROUTER}/chat/completions`)

type App = Awaited<ReturnType<typeof renderApp>>

async function openExam(app: App) {
  await app.user.click(await screen.findByRole('link', { name: /Matemáticas/ }))
  await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
}

async function openMaterial(app: App, name: string) {
  const material = within(await screen.findByRole('region', { name: 'Material' }))
  await app.user.click(await material.findByRole('link', { name }))
  await screen.findByRole('heading', { name, level: 1 })
}

/** The Material list item that links to `name`. */
async function materialItem(name: string) {
  const material = within(await screen.findByRole('region', { name: 'Material' }))
  return (await material.findByRole('link', { name })).closest('li')!
}

describe('reading a Material with many Pages', () => {
  it('shows per-Page progress and lets her open the Pages read so far', async () => {
    server.use(openRouter.readPage.inTurn(['La página uno.', 'hang']))
    const app = await renderApp({
      student: ana,
      openRouterKey: 'sk-or-v1-good',
      subjects,
      exams: [{ subject: 'Matemáticas', period: q1, materials: [{ name: 'Unidad 1', pages: [], unreadPages: 3 }] }],
    })
    await openExam(app)

    expect(await within(await materialItem('Unidad 1')).findByText('1 / 3 páginas')).toBeInTheDocument()

    await openMaterial(app, 'Unidad 1')
    expect(await screen.findByText('1 / 3 páginas')).toBeInTheDocument()
    expect(await screen.findByText('La página uno.')).toBeInTheDocument()
  })
})

describe('closing the app while Pages are being read', () => {
  it('reads the unread Pages, and the one it was reading, when she opens it again', async () => {
    server.use(openRouter.readPage.inTurn(['La página uno.', 'hang']))
    const app = await renderApp({
      student: ana,
      openRouterKey: 'sk-or-v1-good',
      subjects,
      exams: [{ subject: 'Matemáticas', period: q1, materials: [{ name: 'Unidad 1', pages: [], unreadPages: 3 }] }],
    })
    await openExam(app)
    expect(await within(await materialItem('Unidad 1')).findByText('1 / 3 páginas')).toBeInTheDocument()
    // The second Page is on its way to the model when the app closes.
    await waitFor(() => expect(readRequests()).toHaveLength(2))

    server.use(openRouter.readPage.texts(['La página dos.', 'La página tres.']))
    await app.reopen()
    await openExam(app)

    expect(await within(await materialItem('Unidad 1')).findByText('3 / 3 páginas')).toBeInTheDocument()
    expect(readRequests()).toHaveLength(4)
  })
})

describe('when one Page cannot be read', () => {
  it('marks it failed with "Reintentar", reads the others, and retries only that Page', async () => {
    server.use(openRouter.readPage.inTurn(['Texto de a.', 400, 'Texto de c.']))
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [{ subject: 'Matemáticas', period: q1 }] })
    await openExam(app)

    await app.user.upload(screen.getByLabelText('Agregar material'), [photo('a.jpg'), photo('b.jpg'), photo('c.jpg')])

    expect(await within(await materialItem('c')).findByText('1 / 1 página')).toBeInTheDocument()
    expect(within(await materialItem('b')).getByText('0 / 1 página · 1 con error')).toBeInTheDocument()

    await openMaterial(app, 'b')
    const text = within(screen.getByRole('region', { name: 'Texto reconocido' }))
    expect(await text.findByRole('alert')).toHaveTextContent(
      'La respuesta del modelo no se pudo usar. Inténtalo de nuevo.',
    )
    server.use(openRouter.readPage.text('Texto de b.'))
    await app.user.click(text.getByRole('button', { name: 'Reintentar' }))

    expect(await text.findByText('Texto de b.')).toBeInTheDocument()
    expect(readRequests()).toHaveLength(4)
    await app.user.click(screen.getByRole('link', { name: 'Volver a Matemáticas' }))
    await openMaterial(app, 'a')
    expect(await screen.findByText('Texto de a.')).toBeInTheDocument()
  })
})

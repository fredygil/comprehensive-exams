import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { openRouter, openRouterRequests, server } from './harness/openRouter'
import { renderApp } from './harness/renderApp'

const ana = { name: 'Ana', gradeLevel: 5 }

async function openSettings(app: Awaited<ReturnType<typeof renderApp>>) {
  await app.user.click(await screen.findByRole('link', { name: 'Ajustes' }))
  return screen.findByRole('heading', { name: 'Ajustes', level: 1 })
}

function section(name: string) {
  return within(screen.getByRole('region', { name }))
}

describe('Settings: the Student', () => {
  it('lets her change her name and Grade Level', async () => {
    const app = await renderApp({ student: ana })
    await openSettings(app)

    const student = section('Estudiante')
    expect(student.getByLabelText('Nombre')).toHaveValue('Ana')
    expect(student.getByLabelText('Grado')).toHaveDisplayValue('5.º grado')

    await app.user.clear(student.getByLabelText('Nombre'))
    await app.user.type(student.getByLabelText('Nombre'), 'Sofía')
    await app.user.selectOptions(student.getByLabelText('Grado'), '6.º grado')
    await app.user.click(student.getByRole('button', { name: 'Guardar' }))
    await app.user.click(screen.getByRole('link', { name: 'Inicio' }))

    expect(await screen.findByRole('heading', { name: /Sofía/ })).toBeInTheDocument()

    await app.reopen()
    await openSettings(app)
    expect(section('Estudiante').getByLabelText('Nombre')).toHaveValue('Sofía')
    expect(section('Estudiante').getByLabelText('Grado')).toHaveDisplayValue('6.º grado')
  })
})

describe('Settings: the OpenRouter key', () => {
  it('checks a pasted key and says it works', async () => {
    const app = await renderApp({ student: ana })
    await openSettings(app)

    const key = section('Clave de OpenRouter')
    await app.user.type(key.getByLabelText('Clave'), 'sk-or-v1-good')
    await app.user.click(key.getByRole('button', { name: 'Probar clave' }))

    expect(await key.findByText('La clave funciona.')).toBeInTheDocument()
    expect(key.getByText('Sin límite de gasto.')).toBeInTheDocument()
  })

  it("shows the key's spend limit and what is left of it", async () => {
    server.use(openRouter.key.valid({ limit: 10, limitRemaining: 7.5 }))
    const app = await renderApp({ student: ana })
    await openSettings(app)

    const key = section('Clave de OpenRouter')
    await app.user.type(key.getByLabelText('Clave'), 'sk-or-v1-capped')
    await app.user.click(key.getByRole('button', { name: 'Probar clave' }))

    expect(await key.findByText('La clave funciona.')).toBeInTheDocument()
    expect(key.getByText('Límite de gasto: $10.00.')).toBeInTheDocument()
    expect(key.getByText('Disponible: $7.50.')).toBeInTheDocument()
  })

  it('says when the key is not valid', async () => {
    server.use(openRouter.key.invalid())
    const app = await renderApp({ student: ana })
    await openSettings(app)

    const key = section('Clave de OpenRouter')
    await app.user.type(key.getByLabelText('Clave'), 'sk-or-v1-wrong')
    await app.user.click(key.getByRole('button', { name: 'Probar clave' }))

    expect(await key.findByText('La clave no es válida.')).toBeInTheDocument()
    expect(key.queryByText('La clave funciona.')).not.toBeInTheDocument()
  })

  it.each([
    ['offline', openRouter.key.offline(), 'No hay conexión a internet. Conéctate e inténtalo de nuevo.'],
    ['out of credit', openRouter.key.status(402), 'Se acabó el saldo de la clave de OpenRouter. Pídele a un adulto que lo recargue.'],
    ['rate limited', openRouter.key.status(429), 'El modelo está ocupado. Espera un momento e inténtalo de nuevo.'],
    ['down', openRouter.key.status(503), 'El servicio no está disponible ahora. Inténtalo de nuevo en un rato.'],
  ])('explains in Spanish when OpenRouter is %s', async (_, handler, message) => {
    server.use(handler)
    const app = await renderApp({ student: ana })
    await openSettings(app)

    const key = section('Clave de OpenRouter')
    await app.user.type(key.getByLabelText('Clave'), 'sk-or-v1-good')
    await app.user.click(key.getByRole('button', { name: 'Probar clave' }))

    expect(await key.findByText(message)).toBeInTheDocument()
  })

  it('sends the key with the app attribution headers', async () => {
    const app = await renderApp({ student: ana })
    await openSettings(app)

    const key = section('Clave de OpenRouter')
    await app.user.type(key.getByLabelText('Clave'), 'sk-or-v1-good')
    await app.user.click(key.getByRole('button', { name: 'Probar clave' }))
    await key.findByText('La clave funciona.')

    const [request] = openRouterRequests
    expect(request.url).toBe('https://openrouter.ai/api/v1/key')
    expect(request.headers.get('Authorization')).toBe('Bearer sk-or-v1-good')
    expect(request.headers.get('HTTP-Referer')).toBe('https://fredygil.github.io/comprehensive-exams/')
    expect(request.headers.get('X-OpenRouter-Title')).toBe('Comprehensive Exams')
  })

  it('keeps the key on the tablet across launches', async () => {
    const app = await renderApp({ student: ana })
    await openSettings(app)

    const key = section('Clave de OpenRouter')
    await app.user.type(key.getByLabelText('Clave'), 'sk-or-v1-good')
    await app.user.click(key.getByRole('button', { name: 'Guardar clave' }))
    await key.findByText('Clave guardada.')

    await app.reopen()
    await openSettings(app)
    expect(section('Clave de OpenRouter').getByLabelText('Clave')).toHaveValue('sk-or-v1-good')
  })

  it('can only be checked once one is entered', async () => {
    const app = await renderApp({ student: ana })
    await openSettings(app)

    expect(section('Clave de OpenRouter').getByRole('button', { name: 'Probar clave' })).toBeDisabled()
  })
})

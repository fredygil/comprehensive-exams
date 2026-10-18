import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from './harness/renderApp'

const ana = { name: 'Ana', gradeLevel: 5 }
const notice = /configura la clave de OpenRouter/i

describe('without an OpenRouter key', () => {
  it('tells the Student AI features need the key and where to set it', async () => {
    const app = await renderApp({ student: ana })

    expect(await screen.findByText(notice)).toBeInTheDocument()

    await app.user.click(screen.getByRole('link', { name: 'Configurar la clave' }))
    expect(await screen.findByRole('heading', { name: 'Ajustes', level: 1 })).toBeInTheDocument()
  })

  it('stops warning once a key is saved', async () => {
    const app = await renderApp({ student: ana })
    await app.user.click(await screen.findByRole('link', { name: 'Configurar la clave' }))

    await app.user.type(await screen.findByLabelText('Clave'), 'sk-or-v1-good')
    await app.user.click(screen.getByRole('button', { name: 'Guardar clave' }))
    await app.user.click(screen.getByRole('link', { name: 'Inicio' }))

    await screen.findByRole('heading', { name: /Ana/ })
    expect(screen.queryByText(notice)).not.toBeInTheDocument()
  })

  it('does not warn when a key is already set', async () => {
    await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good' })

    await screen.findByRole('heading', { name: /Ana/ })
    expect(screen.queryByText(notice)).not.toBeInTheDocument()
  })
})

import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { setClock } from './harness/clock'
import { renderApp } from './harness/renderApp'

async function completeFirstRun(app: Awaited<ReturnType<typeof renderApp>>, name: string) {
  await app.user.type(await screen.findByLabelText('¿Cómo te llamas?'), name)
  await app.user.selectOptions(screen.getByLabelText('¿En qué grado estás?'), '5.º grado')
  await app.user.click(screen.getByRole('button', { name: 'Empezar' }))
}

describe('first run', () => {
  it('asks the Student her name and Grade Level, then greets her by name', async () => {
    const app = await renderApp()

    await completeFirstRun(app, 'Ana')

    expect(await screen.findByRole('heading', { name: /Ana/ })).toBeInTheDocument()
  })

  it('is skipped on later launches, which greet her by name', async () => {
    const app = await renderApp()
    await completeFirstRun(app, 'Ana')
    await screen.findByRole('heading', { name: /Ana/ })

    await app.reopen()

    expect(await screen.findByRole('heading', { name: /Ana/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('¿Cómo te llamas?')).not.toBeInTheDocument()
  })

  it('greets her for the time of day', async () => {
    setClock('2026-10-18T09:00')
    const app = await renderApp({ student: { name: 'Ana', gradeLevel: 5 } })
    expect(await screen.findByRole('heading', { name: 'Buenos días, Ana' })).toBeInTheDocument()

    setClock('2026-10-18T15:00')
    await app.reopen()
    expect(await screen.findByRole('heading', { name: 'Buenas tardes, Ana' })).toBeInTheDocument()

    setClock('2026-10-18T21:30')
    await app.reopen()
    expect(await screen.findByRole('heading', { name: 'Buenas noches, Ana' })).toBeInTheDocument()
  })

  it('needs a name before starting', async () => {
    await renderApp()

    expect(await screen.findByRole('button', { name: 'Empezar' })).toBeDisabled()
  })

  it('asks the browser to keep the data even when the tablet is low on space', async () => {
    const app = await renderApp()
    await screen.findByLabelText('¿Cómo te llamas?')

    await vi.waitFor(() => expect(app.storage.persist).toHaveBeenCalled())
  })

  it('does not ask again once the browser has agreed', async () => {
    const app = await renderApp()
    await screen.findByLabelText('¿Cómo te llamas?')
    await vi.waitFor(() => expect(app.storage.persist).toHaveBeenCalled())
    app.storage.persist.mockClear()

    await app.reopen()
    await screen.findByLabelText('¿Cómo te llamas?')
    await vi.waitFor(() => expect(app.storage.persisted).toHaveBeenCalledTimes(2))

    expect(app.storage.persist).not.toHaveBeenCalled()
  })
})

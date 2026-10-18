import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { openRouter, server } from './harness/openRouter'
import { renderApp } from './harness/renderApp'

const ana = { name: 'Ana', gradeLevel: 5 }
const subjects = [{ name: 'Matemáticas', language: 'es' as const }]
const q1 = { schoolYearStart: 2026, quarter: 1 as const }

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

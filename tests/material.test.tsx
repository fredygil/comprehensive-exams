import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { photo } from './harness/files'
import { openRouter, server } from './harness/openRouter'
import { renderApp } from './harness/renderApp'

const ana = { name: 'Ana', gradeLevel: 5 }
const subjects = [{ name: 'Matemáticas', language: 'es' as const }]
const q1 = { schoolYearStart: 2026, quarter: 1 as const }
const mathExam = { subject: 'Matemáticas', period: q1 }

type App = Awaited<ReturnType<typeof renderApp>>

async function openExam(app: App, subject = 'Matemáticas') {
  await app.user.click(await screen.findByRole('link', { name: new RegExp(subject) }))
  await screen.findByRole('heading', { name: subject, level: 1 })
}

async function openMaterial(app: App, name: string) {
  const material = within(screen.getByRole('region', { name: 'Material' }))
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
})

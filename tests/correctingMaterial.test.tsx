import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { openRouter, openRouterRequests, server } from './harness/openRouter'
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

function recognizedText() {
  return within(screen.getByRole('region', { name: 'Texto reconocido' }))
}

/** Opens the editor on the Page shown, replaces its text and saves. */
async function correctText(app: App, text: string) {
  await app.user.click(await recognizedText().findByRole('button', { name: 'Corregir texto' }))
  const editor = recognizedText().getByRole('textbox', { name: 'Texto reconocido de la página 1' })
  await app.user.clear(editor)
  await app.user.type(editor, text)
  await app.user.click(recognizedText().getByRole('button', { name: 'Guardar texto' }))
}

describe('correcting a Page', () => {
  it('saves the corrected Recognized Text beside the scan and marks it as edited', async () => {
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [{ subject: 'Matemáticas', period: q1, materials: [{ name: 'Unidad 1', pages: ['Las fraciones'] }] }],
    })
    await openExam(app)
    await openMaterial(app, 'Unidad 1')
    expect(await recognizedText().findByText('Las fraciones')).toBeInTheDocument()

    await correctText(app, 'Las fracciones tienen numerador.')

    expect(await recognizedText().findByText('Editado por ti.')).toBeInTheDocument()
    expect(recognizedText().getByText('Las fracciones tienen numerador.')).toBeInTheDocument()
    expect(recognizedText().queryByText('Las fraciones')).not.toBeInTheDocument()
    expect(recognizedText().queryByRole('textbox')).not.toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Página 1: original' })).toBeInTheDocument()

    await app.reopen()
    await openExam(app)
    await openMaterial(app, 'Unidad 1')
    expect(await recognizedText().findByText('Las fracciones tienen numerador.')).toBeInTheDocument()
    expect(recognizedText().getByText('Editado por ti.')).toBeInTheDocument()
  })
})

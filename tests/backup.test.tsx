import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setClock } from './harness/clock'
import { renderApp, type RenderAppOptions } from './harness/renderApp'

const q1 = { schoolYearStart: 2026, quarter: 1 as const }

type App = Awaited<ReturnType<typeof renderApp>>

async function openSettings(app: App) {
  await app.user.click(await screen.findByRole('link', { name: 'Ajustes' }))
  await screen.findByRole('heading', { name: 'Ajustes', level: 1 })
}

function backupSection() {
  return within(screen.getByRole('region', { name: 'Copia de seguridad' }))
}

/** In Settings: taps "Exportar copia" and returns the file the app saved. */
async function exportBackup(app: App) {
  await openSettings(app)
  await app.user.click(backupSection().getByRole('button', { name: 'Exportar copia' }))
  await backupSection().findByText(/Copia lista/)
  expect(app.savedFiles).toHaveLength(1)
  return app.savedFiles[0]
}

/** Picks the backup file in "Importar copia" and confirms that it replaces everything. */
async function importBackup(app: App, file: File) {
  await app.user.upload(screen.getByLabelText('Importar copia'), file)
  const confirmation = await screen.findByRole('alertdialog', { name: '¿Restaurar esta copia?' })
  await app.user.click(within(confirmation).getByRole('button', { name: 'Sí, restaurar' }))
}

async function openExam(app: App, subject = 'Matemáticas') {
  await app.user.click(await screen.findByRole('link', { name: new RegExp(subject) }))
  await screen.findByRole('heading', { name: subject, level: 1 })
}

async function openMaterial(app: App, name: string) {
  const material = within(await screen.findByRole('region', { name: 'Material' }))
  await app.user.click(await material.findByRole('link', { name }))
  await screen.findByRole('heading', { name, level: 1 })
}

const anasTablet: RenderAppOptions = {
  student: { name: 'Ana', gradeLevel: 5 },
  openRouterKey: 'sk-or-v1-anas-key',
  subjects: [{ name: 'Matemáticas', language: 'es' }],
  exams: [
    {
      subject: 'Matemáticas',
      period: q1,
      examDate: '2026-10-21',
      materials: [{ name: 'Unidad 1', pages: ['Las fracciones tienen numerador.'] }],
    },
  ],
}

describe('backup round trip', () => {
  it('restores her Exams and Material on a new tablet', async () => {
    setClock('2026-10-18T09:00')
    const old = await renderApp(anasTablet)
    const file = await exportBackup(old)
    await old.close()

    const fresh = await renderApp({ student: { name: 'Nueva', gradeLevel: 1 }, openRouterKey: 'sk-or-v1-new' })
    await openSettings(fresh)
    await importBackup(fresh, file)

    expect(await screen.findByRole('heading', { name: 'Buenos días, Ana', level: 1 })).toBeInTheDocument()
    await openExam(fresh)
    await openMaterial(fresh, 'Unidad 1')
    expect(await screen.findByText('Las fracciones tienen numerador.')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Página 1: original' })).toBeInTheDocument()
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from './harness/renderApp'

const ana = { name: 'Ana', gradeLevel: 5 }
const subjects = [
  { name: 'Matemáticas', language: 'es' as const },
  { name: 'Science', language: 'en' as const },
]
const q1 = { schoolYearStart: 2026, quarter: 1 as const }
const q2 = { schoolYearStart: 2026, quarter: 2 as const }

type App = Awaited<ReturnType<typeof renderApp>>

async function home() {
  return screen.findByRole('heading', { name: /Ana/, level: 1 })
}

async function openExam(app: App, subject: string) {
  await app.user.click(await screen.findByRole('link', { name: new RegExp(subject) }))
  await screen.findByRole('heading', { name: subject, level: 1 })
}

async function openSubjects(app: App) {
  await app.user.click(await screen.findByRole('link', { name: 'Materias' }))
  await screen.findByRole('heading', { name: 'Materias', level: 1 })
}

describe('deleting an Exam', () => {
  it('asks first, naming what will be lost, and can be cancelled', async () => {
    const app = await renderApp({ student: ana, subjects, exams: [{ subject: 'Matemáticas', period: q1 }] })
    await openExam(app, 'Matemáticas')

    await app.user.click(screen.getByRole('button', { name: 'Eliminar examen' }))

    const confirm = within(await screen.findByRole('alertdialog', { name: '¿Eliminar este examen?' }))
    expect(confirm.getByRole('listitem')).toHaveTextContent('El examen de Matemáticas de 2026–2027 · Q1')
    expect(confirm.getByText('Esto no se puede deshacer.')).toBeInTheDocument()

    await app.user.click(confirm.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Matemáticas', level: 1 })).toBeInTheDocument()
  })

  it('removes it once confirmed, for good', async () => {
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [
        { subject: 'Matemáticas', period: q1 },
        { subject: 'Science', period: q1 },
      ],
    })
    await openExam(app, 'Matemáticas')

    await app.user.click(screen.getByRole('button', { name: 'Eliminar examen' }))
    await app.user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, eliminar' }),
    )

    await home()
    expect(screen.queryByRole('link', { name: /Matemáticas/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Science/ })).toBeInTheDocument()

    await app.reopen()
    await home()
    expect(screen.queryByRole('link', { name: /Matemáticas/ })).not.toBeInTheDocument()

    // The Subject and Period are free for a new Exam again.
    await app.user.click(screen.getByRole('link', { name: 'Nuevo examen' }))
    await app.user.selectOptions(await screen.findByLabelText('Materia'), 'Matemáticas')
    await app.user.click(screen.getByRole('button', { name: 'Crear examen' }))
    expect(await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })).toBeInTheDocument()
  })
})

describe('deleting a Subject', () => {
  it('asks first, naming every Exam that will be lost', async () => {
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [
        { subject: 'Matemáticas', period: q1 },
        { subject: 'Matemáticas', period: q2 },
      ],
    })
    await openSubjects(app)

    const subject = within(screen.getByRole('region', { name: 'Matemáticas' }))
    await app.user.click(subject.getByRole('button', { name: 'Eliminar materia' }))

    const confirm = within(await screen.findByRole('alertdialog', { name: '¿Eliminar la materia Matemáticas?' }))
    expect(confirm.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'La materia Matemáticas',
      'El examen de Matemáticas de 2026–2027 · Q2',
      'El examen de Matemáticas de 2026–2027 · Q1',
    ])

    await app.user.click(confirm.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('region', { name: 'Matemáticas' })).toBeInTheDocument()
  })

  it('removes it and all its Exams once confirmed, for good', async () => {
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [
        { subject: 'Matemáticas', period: q1 },
        { subject: 'Matemáticas', period: q2 },
        { subject: 'Science', period: q2 },
      ],
    })
    await openSubjects(app)

    const subject = within(screen.getByRole('region', { name: 'Matemáticas' }))
    await app.user.click(subject.getByRole('button', { name: 'Eliminar materia' }))
    await app.user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, eliminar' }),
    )

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Matemáticas' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('region', { name: 'Science' })).toBeInTheDocument()

    await app.reopen()
    await home()
    expect(screen.queryByRole('link', { name: /Matemáticas/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Science/ })).toBeInTheDocument()

    await app.user.click(screen.getByRole('link', { name: '2026–2027 · Q1' }))
    await screen.findByRole('heading', { name: '2026–2027 · Q1', level: 1 })
    expect(screen.queryByRole('link', { name: /Matemáticas/ })).not.toBeInTheDocument()

    await openSubjects(app)
    expect(screen.queryByRole('region', { name: 'Matemáticas' })).not.toBeInTheDocument()
  })

  it('says when the Subject has no Exams', async () => {
    const app = await renderApp({ student: ana, subjects })
    await openSubjects(app)

    const subject = within(screen.getByRole('region', { name: 'Science' }))
    await app.user.click(subject.getByRole('button', { name: 'Eliminar materia' }))

    const confirm = within(await screen.findByRole('alertdialog', { name: '¿Eliminar la materia Science?' }))
    expect(confirm.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'La materia Science',
    ])
    expect(confirm.getByText('No tiene exámenes.')).toBeInTheDocument()
  })
})

import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setClock } from './harness/clock'
import { renderApp } from './harness/renderApp'

const ana = { name: 'Ana', gradeLevel: 5 }
const subjects = [
  { name: 'Matemáticas', language: 'es' as const },
  { name: 'Science', language: 'en' as const },
]

type App = Awaited<ReturnType<typeof renderApp>>

async function openNewExam(app: App) {
  await app.user.click(await screen.findByRole('link', { name: 'Nuevo examen' }))
  await screen.findByRole('heading', { name: 'Nuevo examen', level: 1 })
}

async function goHome(app: App) {
  await app.user.click(screen.getByRole('link', { name: 'Inicio' }))
  await screen.findByRole('heading', { name: /Ana/, level: 1 })
}

function region(name: string) {
  return within(screen.getByRole('region', { name }))
}

describe('creating an Exam', () => {
  it('creates the first Exam in a new Period, shown on the home screen', async () => {
    setClock('2026-10-18T09:00')
    const app = await renderApp({ student: ana, subjects })
    await openNewExam(app)

    await app.user.selectOptions(screen.getByLabelText('Materia'), 'Matemáticas')
    expect(screen.getByLabelText('Año escolar')).toHaveDisplayValue('2026–2027')
    await app.user.selectOptions(screen.getByLabelText('Trimestre'), 'Q1')
    await app.user.click(screen.getByRole('button', { name: 'Crear examen' }))

    expect(await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('2026–2027 · Q1')).toBeInTheDocument()

    await goHome(app)
    expect(region('2026–2027 · Q1').getByRole('link', { name: /Matemáticas/ })).toBeInTheDocument()

    await app.reopen()
    await screen.findByRole('heading', { name: /Ana/, level: 1 })
    expect(region('2026–2027 · Q1').getByRole('link', { name: /Matemáticas/ })).toBeInTheDocument()
  })

  it('places a new Period in the school year (August–June) of today', async () => {
    setClock('2027-03-10T09:00')
    const app = await renderApp({ student: ana, subjects })
    await openNewExam(app)

    expect(screen.getByLabelText('Año escolar')).toHaveDisplayValue('2026–2027')
  })

  it('pre-selects the newest Period', async () => {
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [
        { subject: 'Matemáticas', period: { schoolYearStart: 2026, quarter: 2 } },
        { subject: 'Matemáticas', period: { schoolYearStart: 2026, quarter: 1 } },
      ],
    })
    await openNewExam(app)

    expect(screen.getByLabelText('Periodo')).toHaveDisplayValue('2026–2027 · Q2')
    expect(screen.queryByLabelText('Año escolar')).not.toBeInTheDocument()

    await app.user.selectOptions(screen.getByLabelText('Materia'), 'Science')
    await app.user.click(screen.getByRole('button', { name: 'Crear examen' }))

    expect(await screen.findByRole('heading', { name: 'Science', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('2026–2027 · Q2')).toBeInTheDocument()
  })

  it('creates another Period from the same form', async () => {
    setClock('2027-01-20T09:00')
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [{ subject: 'Matemáticas', period: { schoolYearStart: 2026, quarter: 2 } }],
    })
    await openNewExam(app)

    await app.user.selectOptions(screen.getByLabelText('Materia'), 'Matemáticas')
    await app.user.selectOptions(screen.getByLabelText('Periodo'), 'Nuevo periodo…')
    await app.user.selectOptions(screen.getByLabelText('Año escolar'), '2026–2027')
    await app.user.selectOptions(screen.getByLabelText('Trimestre'), 'Q3')
    await app.user.click(screen.getByRole('button', { name: 'Crear examen' }))

    expect(await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('2026–2027 · Q3')).toBeInTheDocument()

    await goHome(app)
    expect(region('2026–2027 · Q3').getByRole('link', { name: /Matemáticas/ })).toBeInTheDocument()
  })

  it('refuses a second Exam for the same Subject and Period', async () => {
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [{ subject: 'Matemáticas', period: { schoolYearStart: 2026, quarter: 1 } }],
    })
    await openNewExam(app)

    await app.user.selectOptions(screen.getByLabelText('Materia'), 'Matemáticas')
    await app.user.click(screen.getByRole('button', { name: 'Crear examen' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya tienes un examen de Matemáticas en 2026–2027 · Q1.',
    )
    expect(screen.getByRole('heading', { name: 'Nuevo examen', level: 1 })).toBeInTheDocument()

    await goHome(app)
    expect(region('2026–2027 · Q1').getAllByRole('link', { name: /Matemáticas/ })).toHaveLength(1)
  })
})

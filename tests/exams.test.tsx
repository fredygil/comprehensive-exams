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

const q1 = { schoolYearStart: 2026, quarter: 1 as const }

describe('the Exam Date', () => {
  it('can be set when the Exam is created, with a countdown on the home screen', async () => {
    setClock('2026-10-18T09:00')
    const app = await renderApp({ student: ana, subjects })
    await openNewExam(app)

    await app.user.selectOptions(screen.getByLabelText('Materia'), 'Matemáticas')
    await app.user.type(screen.getByLabelText('Fecha del examen (opcional)'), '2026-10-21')
    await app.user.click(screen.getByRole('button', { name: 'Crear examen' }))

    expect(await screen.findByText('Miércoles, 21 de octubre · en 3 días')).toBeInTheDocument()

    await goHome(app)
    expect(region('2026–2027 · Q1').getByRole('link', { name: /Matemáticas/ })).toHaveTextContent(
      /en 3 días/,
    )
  })

  it('can be changed and cleared on the Exam screen, kept across launches', async () => {
    setClock('2026-10-18T09:00')
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [{ subject: 'Matemáticas', period: q1, examDate: '2026-10-21' }],
    })
    await app.user.click(await screen.findByRole('link', { name: /Matemáticas/ }))
    await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })

    const date = region('Fecha del examen')
    await app.user.clear(date.getByLabelText('Fecha del examen'))
    await app.user.type(date.getByLabelText('Fecha del examen'), '2026-10-19')
    await app.user.click(date.getByRole('button', { name: 'Guardar fecha' }))
    expect(await screen.findByText('Lunes, 19 de octubre · mañana')).toBeInTheDocument()

    await app.reopen()
    await app.user.click(await screen.findByRole('link', { name: /Matemáticas/ }))
    await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
    expect(screen.getByText('Lunes, 19 de octubre · mañana')).toBeInTheDocument()

    await app.user.click(region('Fecha del examen').getByRole('button', { name: 'Quitar fecha' }))
    expect(await screen.findByText('Sin fecha')).toBeInTheDocument()
    expect(region('Fecha del examen').getByLabelText('Fecha del examen')).toHaveValue('')

    await app.reopen()
    await app.user.click(await screen.findByRole('link', { name: /Matemáticas/ }))
    await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
    expect(screen.getByText('Sin fecha')).toBeInTheDocument()
  })
})

describe('the home screen', () => {
  it("lists the current Period's Exams soonest first, undated last, counting down from today", async () => {
    setClock('2026-10-18T09:00')
    await renderApp({
      student: ana,
      subjects: [...subjects, { name: 'Historia', language: 'es' }, { name: 'Arte', language: 'es' }],
      exams: [
        { subject: 'Arte', period: q1 },
        { subject: 'Science', period: q1, examDate: '2026-10-25' },
        { subject: 'Matemáticas', period: q1, examDate: '2026-10-18' },
        { subject: 'Historia', period: q1, examDate: '2026-10-19' },
      ],
    })
    await screen.findByRole('heading', { name: /Ana/, level: 1 })

    const items = region('2026–2027 · Q1').getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'MatemáticasDomingo, 18 de octubre · hoy',
      'HistoriaLunes, 19 de octubre · mañana',
      'ScienceDomingo, 25 de octubre · en 7 días',
      'ArteSin fecha',
    ])
  })

  it('counts down again as the days go by', async () => {
    setClock('2026-10-18T09:00')
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [{ subject: 'Science', period: q1, examDate: '2026-10-25' }],
    })
    expect(await screen.findByText(/en 7 días/)).toBeInTheDocument()

    setClock('2026-10-24T20:00')
    await app.reopen()
    expect(await screen.findByText(/mañana/)).toBeInTheDocument()

    setClock('2026-10-27T08:00')
    await app.reopen()
    expect(await screen.findByText(/hace 2 días/)).toBeInTheDocument()
  })
})

describe('earlier Periods', () => {
  it('can be browsed from the home screen, newest first, with their Exams', async () => {
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [
        { subject: 'Matemáticas', period: { schoolYearStart: 2025, quarter: 3 } },
        { subject: 'Science', period: { schoolYearStart: 2025, quarter: 4 }, examDate: '2026-06-02' },
        { subject: 'Matemáticas', period: { schoolYearStart: 2025, quarter: 4 } },
        { subject: 'Matemáticas', period: q1 },
      ],
    })
    await screen.findByRole('heading', { name: /Ana/, level: 1 })

    const earlier = region('Periodos anteriores')
    expect(earlier.getAllByRole('link').map((link) => link.textContent)).toEqual([
      '2025–2026 · Q4',
      '2025–2026 · Q3',
    ])

    await app.user.click(earlier.getByRole('link', { name: '2025–2026 · Q4' }))
    expect(await screen.findByRole('heading', { name: '2025–2026 · Q4', level: 1 })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^Science/),
      'MatemáticasSin fecha',
    ])

    await app.user.click(screen.getByRole('link', { name: /Science/ }))
    expect(await screen.findByRole('heading', { name: 'Science', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('2025–2026 · Q4')).toBeInTheDocument()
  })

  it('are not offered while there is only one Period', async () => {
    await renderApp({ student: ana, subjects, exams: [{ subject: 'Matemáticas', period: q1 }] })
    await screen.findByRole('heading', { name: /Ana/, level: 1 })

    expect(screen.queryByRole('region', { name: 'Periodos anteriores' })).not.toBeInTheDocument()
  })
})

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

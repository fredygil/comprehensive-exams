import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from './harness/renderApp'

const ana = { name: 'Ana', gradeLevel: 5 }

type App = Awaited<ReturnType<typeof renderApp>>

async function openSubjects(app: App) {
  await app.user.click(await screen.findByRole('link', { name: 'Materias' }))
  return screen.findByRole('heading', { name: 'Materias', level: 1 })
}

async function createSubject(app: App, name: string, language: 'Español' | 'English') {
  const form = within(screen.getByRole('region', { name: 'Nueva materia' }))
  await app.user.type(form.getByLabelText('Nombre'), name)
  await app.user.selectOptions(form.getByLabelText('Idioma'), language)
  await app.user.click(form.getByRole('button', { name: 'Crear materia' }))
}

describe('Subjects', () => {
  it('creates a Subject with a name and Language, kept across launches', async () => {
    const app = await renderApp({ student: ana })
    await openSubjects(app)

    await createSubject(app, 'Matemáticas', 'Español')

    const subject = within(await screen.findByRole('region', { name: 'Matemáticas' }))
    expect(subject.getByLabelText('Idioma')).toHaveDisplayValue('Español')

    await app.reopen()
    await openSubjects(app)
    expect(screen.getByRole('region', { name: 'Matemáticas' })).toBeInTheDocument()
  })

  it('needs a Language before the Subject can be created', async () => {
    const app = await renderApp({ student: ana })
    await openSubjects(app)

    const form = within(screen.getByRole('region', { name: 'Nueva materia' }))
    await app.user.type(form.getByLabelText('Nombre'), 'Science')

    expect(form.getByRole('button', { name: 'Crear materia' })).toBeDisabled()
  })

  it('renames a Subject and changes its Language, kept across launches', async () => {
    const app = await renderApp({ student: ana })
    await openSubjects(app)
    await createSubject(app, 'Matematicas', 'English')

    const subject = within(await screen.findByRole('region', { name: 'Matematicas' }))
    await app.user.clear(subject.getByLabelText('Nombre'))
    await app.user.type(subject.getByLabelText('Nombre'), 'Matemáticas')
    await app.user.selectOptions(subject.getByLabelText('Idioma'), 'Español')
    await app.user.click(subject.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('region', { name: 'Matemáticas' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Matematicas' })).not.toBeInTheDocument()

    await app.reopen()
    await openSubjects(app)
    const renamed = within(screen.getByRole('region', { name: 'Matemáticas' }))
    expect(renamed.getByLabelText('Nombre')).toHaveValue('Matemáticas')
    expect(renamed.getByLabelText('Idioma')).toHaveDisplayValue('Español')
  })
})

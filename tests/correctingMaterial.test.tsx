import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { photo } from './harness/files'
import { OPENROUTER, openRouter, openRouterRequests, server } from './harness/openRouter'
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

/** Opens the editor on the Page shown, replaces its text, saves, and waits for the editor to close. */
async function correctText(app: App, text: string) {
  await app.user.click(await recognizedText().findByRole('button', { name: 'Corregir texto' }))
  const editor = recognizedText().getByRole('textbox', { name: 'Texto reconocido de la página 1' })
  await app.user.clear(editor)
  await app.user.type(editor, text)
  await app.user.click(recognizedText().getByRole('button', { name: 'Guardar texto' }))
  // The editor holds the new text too (React mirrors a textarea's value into
  // its text content), so wait until it has closed before looking for it.
  await recognizedText().findByRole('button', { name: 'Corregir texto' })
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

  it('works offline', async () => {
    server.use(openRouter.readPage.offline(), openRouter.key.offline())
    const app = await renderApp({
      student: ana,
      openRouterKey: 'sk-or-v1-good',
      subjects,
      exams: [{ subject: 'Matemáticas', period: q1, materials: [{ name: 'Unidad 1', pages: ['2 + 2 = 5'] }] }],
    })
    await openExam(app)
    await openMaterial(app, 'Unidad 1')

    await correctText(app, '2 + 2 = 4')

    expect(await recognizedText().findByText('2 + 2 = 4')).toBeInTheDocument()
    expect(recognizedText().queryByRole('alert')).not.toBeInTheDocument()
    expect(openRouterRequests).toHaveLength(0)
  })

  it('can be cancelled, leaving the text as it was', async () => {
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [{ subject: 'Matemáticas', period: q1, materials: [{ name: 'Unidad 1', pages: ['Texto leído.'] }] }],
    })
    await openExam(app)
    await openMaterial(app, 'Unidad 1')

    await app.user.click(await recognizedText().findByRole('button', { name: 'Corregir texto' }))
    await app.user.type(recognizedText().getByRole('textbox'), ' Y algo más.')
    await app.user.click(recognizedText().getByRole('button', { name: 'Cancelar' }))

    expect(recognizedText().getByText('Texto leído.')).toBeInTheDocument()
    expect(recognizedText().queryByText('Editado por ti.')).not.toBeInTheDocument()
  })

  it('is never overwritten by reading', async () => {
    server.use(openRouter.readPage.texts(['Texto leído por el modelo.', 'Texto de la unidad 2.']))
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [{ subject: 'Matemáticas', period: q1 }] })
    await openExam(app)
    await app.user.upload(screen.getByLabelText('Agregar material'), photo('unidad 1.jpg'))
    await openMaterial(app, 'unidad 1')
    await recognizedText().findByText('Texto leído por el modelo.')

    await correctText(app, 'Mi texto corregido.')
    await recognizedText().findByText('Mi texto corregido.')

    // More Material and a restart both set the Reading Queue going again.
    await app.user.click(screen.getByRole('link', { name: 'Volver a Matemáticas' }))
    await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
    await app.user.upload(screen.getByLabelText('Agregar material'), photo('unidad 2.jpg'))
    await openMaterial(app, 'unidad 2')
    await screen.findByText('Texto de la unidad 2.')
    await app.reopen()
    await openExam(app)
    await openMaterial(app, 'unidad 1')

    expect(await recognizedText().findByText('Mi texto corregido.')).toBeInTheDocument()
    expect(openRouterRequests.filter((r) => r.url === `${OPENROUTER}/chat/completions`)).toHaveLength(2)
  })
})

function thisMaterial() {
  return within(screen.getByRole('region', { name: 'Este material' }))
}

describe('renaming a Material', () => {
  it('shows the new name everywhere, after reopening too', async () => {
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [
        {
          subject: 'Matemáticas',
          period: q1,
          materials: [
            { name: 'IMG_2041', pages: ['Fracciones.'] },
            { name: 'IMG_2042', pages: ['Decimales.'] },
          ],
        },
      ],
    })
    await openExam(app)
    await openMaterial(app, 'IMG_2041')

    const name = thisMaterial().getByLabelText('Nombre')
    expect(name).toHaveValue('IMG_2041')
    await app.user.clear(name)
    await app.user.type(name, '  Unidad 3 – Fracciones ')
    await app.user.click(thisMaterial().getByRole('button', { name: 'Cambiar nombre' }))

    expect(await screen.findByRole('heading', { name: 'Unidad 3 – Fracciones', level: 1 })).toBeInTheDocument()
    await app.user.click(screen.getByRole('link', { name: 'Volver a Matemáticas' }))
    const material = within(await screen.findByRole('region', { name: 'Material' }))
    expect((await material.findAllByRole('link')).map((link) => link.textContent)).toEqual([
      'Unidad 3 – Fracciones',
      'IMG_2042',
    ])

    await app.reopen()
    await openExam(app)
    await openMaterial(app, 'Unidad 3 – Fracciones')
    expect(await screen.findByText('Fracciones.')).toBeInTheDocument()
  })

  it('needs a name', async () => {
    const app = await renderApp({
      student: ana,
      subjects,
      exams: [{ subject: 'Matemáticas', period: q1, materials: [{ name: 'IMG_2041', pages: ['Fracciones.'] }] }],
    })
    await openExam(app)
    await openMaterial(app, 'IMG_2041')

    const rename = thisMaterial().getByRole('button', { name: 'Cambiar nombre' })
    expect(rename).toBeDisabled()
    await app.user.clear(thisMaterial().getByLabelText('Nombre'))
    await app.user.type(thisMaterial().getByLabelText('Nombre'), '   ')
    expect(rename).toBeDisabled()
  })
})

describe("the Exam's material revision", () => {
  /** The Exam's material revision, read through the Store's domain query. */
  async function revision(app: App) {
    const current = await app.store.currentPeriodExams()
    return current!.exams[0].materialRevision
  }

  it('goes up when Material is added, its text edited or it is deleted; not on a rename', async () => {
    server.use(openRouter.readPage.text('Texto leído.'))
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [{ subject: 'Matemáticas', period: q1 }] })
    await openExam(app)
    const start = await revision(app)
    expect(start).toBe(0)

    await app.user.upload(screen.getByLabelText('Agregar material'), photo('unidad 1.jpg'))
    await openMaterial(app, 'unidad 1')
    await recognizedText().findByText('Texto leído.')
    expect(await revision(app)).toBe(start + 1)

    await correctText(app, 'Texto corregido.')
    expect(await revision(app)).toBe(start + 2)

    // Saving the text unchanged is not an edit.
    await app.user.click(recognizedText().getByRole('button', { name: 'Corregir texto' }))
    await app.user.click(recognizedText().getByRole('button', { name: 'Guardar texto' }))
    await recognizedText().findByRole('button', { name: 'Corregir texto' })
    expect(await revision(app)).toBe(start + 2)

    await app.user.clear(thisMaterial().getByLabelText('Nombre'))
    await app.user.type(thisMaterial().getByLabelText('Nombre'), 'Unidad 1 – Fracciones')
    await app.user.click(thisMaterial().getByRole('button', { name: 'Cambiar nombre' }))
    await screen.findByRole('heading', { name: 'Unidad 1 – Fracciones', level: 1 })
    expect(await revision(app)).toBe(start + 2)

    await app.user.click(thisMaterial().getByRole('button', { name: 'Eliminar material' }))
    await app.user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, eliminar' }))
    await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
    expect(await revision(app)).toBe(start + 3)

    await app.reopen()
    expect(await revision(app)).toBe(start + 3)
  })

  it('is kept per Exam', async () => {
    const app = await renderApp({
      student: ana,
      subjects: [...subjects, { name: 'Science', language: 'en' }],
      exams: [
        { subject: 'Matemáticas', period: q1, materials: [{ name: 'Unidad 1', pages: ['Fracciones.'] }] },
        { subject: 'Science', period: q1 },
      ],
    })
    await openExam(app)
    await openMaterial(app, 'Unidad 1')
    const exams = async () => (await app.store.currentPeriodExams())!.exams
    const science = (await exams()).find((exam) => exam.subject.name === 'Science')!

    await correctText(app, 'Fracciones corregidas.')

    expect((await exams()).find((exam) => exam.id === science.id)!.materialRevision).toBe(
      science.materialRevision,
    )
  })
})

describe('deleting a Material', () => {
  const twoMaterials = [
    {
      subject: 'Matemáticas',
      period: q1,
      materials: [
        { name: 'Unidad 1', pages: ['Fracciones.'] },
        { name: 'Unidad 2', pages: ['Decimales.'] },
      ],
    },
  ]

  async function deleteMaterial(app: App) {
    await app.user.click(thisMaterial().getByRole('button', { name: 'Eliminar material' }))
    await app.user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, eliminar' }))
    await screen.findByRole('heading', { name: 'Matemáticas', level: 1 })
  }

  it('asks first, naming the Material, and can be cancelled', async () => {
    const app = await renderApp({ student: ana, subjects, exams: twoMaterials })
    await openExam(app)
    await openMaterial(app, 'Unidad 1')

    await app.user.click(thisMaterial().getByRole('button', { name: 'Eliminar material' }))
    const confirm = within(await screen.findByRole('alertdialog', { name: '¿Eliminar este material?' }))
    expect(confirm.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'El material «Unidad 1»',
      '1 página',
    ])
    await app.user.click(confirm.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Unidad 1', level: 1 })).toBeInTheDocument()
  })

  it('removes it once confirmed, for good', async () => {
    const app = await renderApp({ student: ana, subjects, exams: twoMaterials })
    await openExam(app)
    await openMaterial(app, 'Unidad 1')

    await deleteMaterial(app)

    const material = within(await screen.findByRole('region', { name: 'Material' }))
    expect((await material.findAllByRole('link')).map((link) => link.textContent)).toEqual(['Unidad 2'])
    await app.reopen()
    await openExam(app)
    const afterReopen = within(await screen.findByRole('region', { name: 'Material' }))
    expect((await afterReopen.findAllByRole('link')).map((link) => link.textContent)).toEqual(['Unidad 2'])
  })

  it('removes its Pages, so they are never read', async () => {
    server.use(openRouter.readPage.text('Texto del material correcto.'))
    const app = await renderApp({ student: ana, subjects, exams: [{ subject: 'Matemáticas', period: q1 }] })
    await openExam(app)
    // No key yet, so its Page waits in line to be read.
    await app.user.upload(screen.getByLabelText('Agregar material'), photo('equivocado.jpg'))
    await openMaterial(app, 'equivocado')
    await deleteMaterial(app)
    expect(
      await within(screen.getByRole('region', { name: 'Material' })).findByText('Aún no hay material para este examen.'),
    ).toBeInTheDocument()

    await app.user.click(screen.getByRole('link', { name: 'Ajustes' }))
    await app.user.type(await screen.findByLabelText('Clave'), 'sk-or-v1-good')
    await app.user.click(screen.getByRole('button', { name: 'Guardar clave' }))
    await screen.findByText('Clave guardada.')
    await app.user.click(screen.getByRole('link', { name: 'Inicio' }))
    await openExam(app)
    // Pages are read in the order they were added: a deleted one would go first.
    await app.user.upload(screen.getByLabelText('Agregar material'), photo('correcto.jpg'))
    await openMaterial(app, 'correcto')
    await screen.findByText('Texto del material correcto.')

    expect(openRouterRequests.filter((r) => r.url === `${OPENROUTER}/chat/completions`)).toHaveLength(1)
  })
})

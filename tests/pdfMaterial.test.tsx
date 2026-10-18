import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { bytesOfDataUrl, pdf, pdfPageNumber, photo } from './harness/files'
import { OPENROUTER, openRouter, openRouterRequests, server } from './harness/openRouter'
import { renderApp } from './harness/renderApp'

const ana = { name: 'Ana', gradeLevel: 5 }
const subjects = [{ name: 'Matemáticas', language: 'es' as const }]
const mathExam = { subject: 'Matemáticas', period: { schoolYearStart: 2026, quarter: 1 as const } }

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

/** Every PDF Page reads as "Texto de la página N." for its page N of the original PDF. */
function readPdfPagesByNumber() {
  return openRouter.readPage.as(async ({ bytes }) => `Texto de la página ${await pdfPageNumber(bytes)}.`)
}

function recognizedText() {
  return within(screen.getByRole('region', { name: 'Texto reconocido' }))
}

describe('adding a PDF', () => {
  it('makes one Material with one Page per PDF page, in order, and she can page through them', async () => {
    server.use(readPdfPagesByNumber())
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)

    await app.user.upload(screen.getByLabelText('Agregar material'), await pdf('unidad 3.pdf', 3))
    await openMaterial(app, 'unidad 3')

    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Página 1: original' })).toBeInTheDocument()
    expect(await recognizedText().findByText('Texto de la página 1.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()

    await app.user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Página 2: original' })).toBeInTheDocument()
    expect(await recognizedText().findByText('Texto de la página 2.')).toBeInTheDocument()

    await app.user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(await recognizedText().findByText('Texto de la página 3.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled()

    await app.user.click(screen.getByRole('button', { name: 'Página anterior' }))
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
    expect(await recognizedText().findByText('Texto de la página 2.')).toBeInTheDocument()
  })

  it('sends each PDF Page to the reading model on its own, as a single-page PDF file', async () => {
    server.use(readPdfPagesByNumber())
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)

    await app.user.upload(screen.getByLabelText('Agregar material'), await pdf('unidad 3.pdf', 3))
    await openMaterial(app, 'unidad 3')
    await app.user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await app.user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await recognizedText().findByText('Texto de la página 3.')

    const requests = openRouterRequests.filter((r) => r.url === `${OPENROUTER}/chat/completions`)
    const bodies = await Promise.all(requests.map((request) => request.json()))
    const sentPages = []
    for (const body of bodies) {
      const parts = body.messages[0].content as { type: string; file?: { file_data: string } }[]
      expect(parts.map((part) => part.type)).toEqual(['text', 'file'])
      const fileData = parts[1].file!.file_data
      expect(fileData).toMatch(/^data:application\/pdf;base64,/)
      sentPages.push(await pdfPageNumber(bytesOfDataUrl(fileData)))
      expect(body.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'native' } }])
    }
    expect(sentPages).toEqual([1, 2, 3])
  })
})

describe('choosing PDFs and photos in one pick', () => {
  it('adds each file as its own Material and reads photos as images and PDF Pages as PDFs', async () => {
    server.use(
      openRouter.readPage.as(async ({ mime, bytes }) =>
        mime === 'application/pdf'
          ? `Texto de la página ${await pdfPageNumber(bytes)} del PDF.`
          : 'Texto de la foto.',
      ),
    )
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)

    await app.user.upload(screen.getByLabelText('Agregar material'), [
      photo('pizarra.jpg'),
      await pdf('unidad 4.pdf', 2),
      photo('resumen.png'),
    ])

    const material = within(screen.getByRole('region', { name: 'Material' }))
    expect((await material.findAllByRole('link')).map((link) => link.textContent)).toEqual([
      'pizarra',
      'unidad 4',
      'resumen',
    ])

    await openMaterial(app, 'unidad 4')
    expect(await recognizedText().findByText('Texto de la página 1 del PDF.')).toBeInTheDocument()
    await app.user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(await recognizedText().findByText('Texto de la página 2 del PDF.')).toBeInTheDocument()

    await app.user.click(screen.getByRole('link', { name: 'Volver a Matemáticas' }))
    await openMaterial(app, 'resumen')
    expect(await screen.findByRole('img', { name: 'Página 1: original' })).toBeInTheDocument()
    expect(await recognizedText().findByText('Texto de la foto.')).toBeInTheDocument()
    // A single Page needs no paging.
    expect(screen.queryByRole('button', { name: 'Página siguiente' })).not.toBeInTheDocument()
  })
})

describe('choosing a PDF that cannot be opened', () => {
  it('says which file could not be added and adds the rest', async () => {
    server.use(openRouter.readPage.text('Texto.'))
    const app = await renderApp({ student: ana, openRouterKey: 'sk-or-v1-good', subjects, exams: [mathExam] })
    await openExam(app)

    await app.user.upload(screen.getByLabelText('Agregar material'), [
      new File(['%PDF-1.7 esto no es un PDF de verdad'], 'roto.pdf', { type: 'application/pdf' }),
      await pdf('unidad 5.pdf', 1),
    ])

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo agregar «roto.pdf»: el PDF está dañado o protegido.',
    )
    const material = within(screen.getByRole('region', { name: 'Material' }))
    expect((await material.findAllByRole('link')).map((link) => link.textContent)).toEqual(['unidad 5'])
  })
})

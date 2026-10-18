// The Page Viewer in a real browser (Vitest browser mode, Chromium): PDF.js
// needs a real canvas, which jsdom doesn't have. The app-level tests replace
// the Page Viewer with a stand-in (tests/harness/pageViewerStandIn.tsx).
//
// Fixtures (neutral content): sample-scan.pdf is a 2-page scan, each page a
// JPEG image like Drive's scanner makes, with a dark "ink" block top left on
// page 1 and bottom right on page 2. sample-photo.jpg is a 640 × 480 photo.
import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { splitIntoPages } from '../../src/pageSplitter/pageSplitter'
import { PageViewer } from '../../src/pageViewer/PageViewer'
import type { PageOriginal } from '../../src/store/store'
import '../../src/styles.css'
import photoUrl from './fixtures/sample-photo.jpg?url'
import scanUrl from './fixtures/sample-scan.pdf?url'

async function fixture(url: string, name: string, type: string) {
  const response = await fetch(url)
  return new File([await response.arrayBuffer()], name, { type })
}

/** The scan's Pages, as the Page Splitter stores them. */
async function scanPages() {
  return splitIntoPages(await fixture(scanUrl, 'unidad 3.pdf', 'application/pdf'))
}

/** The Page Viewer as the Material screen shows it, in a column `width` CSS pixels wide. */
function Viewer({ original, alt, width = 400 }: { original: PageOriginal; alt: string; width?: number }) {
  return (
    <figure className="page-original card" style={{ width, boxSizing: 'content-box' }}>
      <PageViewer original={original} alt={alt} />
    </figure>
  )
}

/** How dark the canvas is at a point given as fractions of its size (0 = black, 255 = white). */
function brightnessAt(canvas: HTMLCanvasElement, x: number, y: number) {
  const [r, g, b] = canvas
    .getContext('2d')!
    .getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data
  return (r + g + b) / 3
}

async function drawnCanvas(alt: string) {
  const canvas = page.getByRole('img', { name: alt })
  await expect.element(canvas).toHaveAttribute('data-state', 'ready')
  return canvas.element() as HTMLCanvasElement
}

describe('a PDF Page', () => {
  it('is drawn with PDF.js from its own single-page PDF', async () => {
    const [first, second] = await scanPages()

    const screen = await render(<Viewer original={first} alt="Página 1: original" />)
    const one = await drawnCanvas('Página 1: original')
    expect(brightnessAt(one, 0.27, 0.27)).toBeLessThan(100) // page 1's ink, top left
    expect(brightnessAt(one, 0.72, 0.73)).toBeGreaterThan(200) // paper

    await screen.rerender(<Viewer key="2" original={second} alt="Página 2: original" />)
    const two = await drawnCanvas('Página 2: original')
    expect(brightnessAt(two, 0.27, 0.27)).toBeGreaterThan(200)
    expect(brightnessAt(two, 0.72, 0.73)).toBeLessThan(100) // page 2's ink, bottom right
  })

  it('fits the width it is given, keeping the page shape, sharp on high-density screens', async () => {
    const [first] = await scanPages()

    await render(<Viewer original={first} alt="Página 1: original" width={500} />)
    const canvas = await drawnCanvas('Página 1: original')

    const shown = canvas.getBoundingClientRect()
    expect(shown.width).toBeCloseTo(500, 0)
    expect(shown.height / shown.width).toBeCloseTo(792 / 612, 2) // US Letter
    expect(canvas.width).toBe(Math.floor(500 * window.devicePixelRatio))
  })

  it('leaves the Page’s bytes intact, so it can be shown again (StrictMode runs effects twice)', async () => {
    const [first] = await scanPages()
    const size = first.bytes.byteLength

    const screen = await render(
      <StrictMode>
        <Viewer original={first} alt="Página 1: original" />
      </StrictMode>,
    )
    await drawnCanvas('Página 1: original')
    // Coming back to the Page mounts a new viewer on the same bytes.
    await screen.rerender(
      <StrictMode>
        <Viewer key="again" original={first} alt="Página 1: original" />
      </StrictMode>,
    )

    const again = await drawnCanvas('Página 1: original')
    expect(brightnessAt(again, 0.27, 0.27)).toBeLessThan(100)
    expect(first.bytes.byteLength).toBe(size)
  })

  it('says it cannot be shown when the PDF is damaged', async () => {
    const damaged = { bytes: new TextEncoder().encode('%PDF-1.7 roto').slice(), mime: 'application/pdf' as const }

    await render(<Viewer original={damaged} alt="Página 1: original" />)

    await expect.element(page.getByText('No se pudo mostrar esta página.')).toBeVisible()
  })
})

describe('a photo Page', () => {
  it('is shown as an image', async () => {
    const [photo] = await splitIntoPages(await fixture(photoUrl, 'pizarra.jpg', 'image/jpeg'))

    await render(<Viewer original={photo} alt="Página 1: original" />)

    const image = page.getByRole('img', { name: 'Página 1: original' })
    await expect.poll(() => (image.element() as HTMLImageElement).naturalWidth).toBe(640)
    expect((image.element() as HTMLImageElement).getBoundingClientRect().width).toBeCloseTo(400, 0)
  })
})

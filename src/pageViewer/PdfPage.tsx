// A PDF Page drawn on a canvas with PDF.js, fitted to the width of its column.
// Loaded lazily by PageViewer: PDF.js and its worker are large.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useEffect, useRef, useState } from 'react'
import { strings } from '../strings'

GlobalWorkerOptions.workerSrc = workerUrl

type DrawState = 'loading' | 'ready' | 'error'

/** Draws page 1 of `bytes` (a single-page PDF). `data-state` tells tests when it is drawn. */
export function PdfPage({ bytes, alt }: { bytes: Uint8Array<ArrayBuffer>; alt: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<DrawState>('loading')

  useEffect(() => {
    let cancelled = false
    let render: { cancel(): void; promise: Promise<void> } | undefined
    // A copy: PDF.js transfers the buffer to its worker, which would empty
    // the Page's bytes for the next draw (StrictMode, coming back to a Page).
    const task = getDocument({ data: bytes.slice() })

    async function draw() {
      const pdf = await task.promise
      const pdfPage = await pdf.getPage(1)
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      // Fit the column's width (the canvas is styled 100% wide); draw at
      // device pixels so it is sharp on the tablet.
      const columnWidth = canvas.clientWidth || 600
      const natural = pdfPage.getViewport({ scale: 1 })
      const viewport = pdfPage.getViewport({
        scale: (columnWidth / natural.width) * window.devicePixelRatio,
      })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      render = pdfPage.render({ canvas, viewport })
      await render.promise
      if (!cancelled) setState('ready')
    }

    draw().catch((error: unknown) => {
      if (cancelled) return
      console.error('Could not draw a PDF Page:', error)
      setState('error')
    })
    return () => {
      cancelled = true
      render?.cancel()
      void task.destroy()
    }
  }, [bytes])

  if (state === 'error') return <p className="error">{strings.material.page.cannotShow}</p>
  return (
    <canvas ref={canvasRef} className="page-image" role="img" aria-label={alt} data-state={state} />
  )
}

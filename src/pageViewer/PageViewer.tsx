// Page Viewer: displays a Page's original scan. A photo is an <img>; a PDF
// Page (a single-page PDF) is drawn with PDF.js, since Android Chrome has no
// built-in PDF viewer. PDF.js loads only when a PDF Page is first shown.
//
// Tested in a real browser (tests/browser/); the app-level tests in jsdom,
// which has no canvas, swap it for a stand-in (tests/harness/setup.ts).
import { lazy, Suspense, useEffect, useState } from 'react'
import type { PageOriginal } from '../store/store'

const PdfPage = lazy(() => import('./PdfPage').then((module) => ({ default: module.PdfPage })))

export type PageViewerProps = {
  original: PageOriginal
  /** The accessible name of the scan, e.g. "Página 1: original". */
  alt: string
}

export function PageViewer({ original, alt }: PageViewerProps) {
  if (original.mime === 'application/pdf') {
    return (
      <Suspense fallback={null}>
        <PdfPage bytes={original.bytes} alt={alt} />
      </Suspense>
    )
  }
  return <PhotoPage original={original} alt={alt} />
}

function PhotoPage({ original, alt }: PageViewerProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([original.bytes], { type: original.mime }))
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [original])

  // Shown once its URL exists, so an image on screen is always the real one.
  return url ? <img className="page-image" src={url} alt={alt} /> : null
}

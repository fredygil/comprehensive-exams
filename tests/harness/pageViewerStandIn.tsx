// A stand-in for the Page Viewer in the app-level tests: jsdom has no canvas,
// so PDF.js can't draw there. The real viewer is tested in a real browser
// (tests/browser/). setup.ts swaps it in for src/pageViewer/PageViewer.
//
// Every Page, photo or PDF, is an <img> named like the real viewer names it
// ("Página 1: original"), shown once its scan is loaded.
import { useEffect, useState } from 'react'
import type { PageViewerProps } from '../../src/pageViewer/PageViewer'

export function PageViewer({ original, alt }: PageViewerProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([original.bytes], { type: original.mime }))
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [original])

  return url ? <img src={url} alt={alt} data-mime={original.mime} /> : null
}

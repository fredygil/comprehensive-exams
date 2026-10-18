// Page Viewer: displays a Page's original scan. A photo is an <img>.
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useServices } from '../app/services'
import type { Page } from '../store/store'

export function PageViewer({ page, alt }: { page: Page; alt: string }) {
  const { store } = useServices()
  const original = useLiveQuery(() => store.getPageOriginal(page.id), [store, page.id])
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!original) return
    const objectUrl = URL.createObjectURL(new Blob([original.bytes], { type: original.mime }))
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [original])

  return <img className="page-image" src={url ?? undefined} alt={alt} />
}

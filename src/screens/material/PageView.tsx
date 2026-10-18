import { useLiveQuery } from 'dexie-react-hooks'
import { useId } from 'react'
import { useServices } from '../../app/services'
import { NeedsKeyNotice, useHasKey } from '../../components/NeedsKey'
import { RichText } from '../../components/RichText'
import { PageViewer } from '../../pageViewer/PageViewer'
import type { Page } from '../../store/store'
import { strings } from '../../strings'

/** A Page's original beside its Recognized Text: side by side in landscape, stacked in portrait. */
export function PageView({ page }: { page: Page }) {
  const textId = useId()
  const text = strings.material.page

  return (
    <div className="page-view">
      <figure className="page-original card">
        <PageOriginalView page={page} />
      </figure>
      <section aria-labelledby={textId} className="page-text card">
        <h2 id={textId}>{text.recognizedText}</h2>
        <PageText page={page} />
      </section>
    </div>
  )
}

/** The Page's scan, once loaded from the Store. */
function PageOriginalView({ page }: { page: Page }) {
  const { store } = useServices()
  const original = useLiveQuery(() => store.getPageOriginal(page.id), [store, page.id])
  if (!original) return null
  return <PageViewer original={original} alt={strings.material.page.original(page.index + 1)} />
}

function PageText({ page }: { page: Page }) {
  const hasKey = useHasKey()
  const text = strings.material.page
  switch (page.status) {
    case 'unread':
    case 'reading':
      // Without a key the Page waits in line until one is saved.
      return hasKey === false ? <NeedsKeyNotice /> : <p className="hint">{text.reading}</p>
    case 'failed':
      return (
        <p role="alert" className="error">
          {strings.errors[page.failure ?? 'BadResponse']}
        </p>
      )
    case 'read':
      return <RichText>{page.recognizedText ?? ''}</RichText>
  }
}

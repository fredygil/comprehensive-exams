import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState, type FormEvent } from 'react'
import { useServices } from '../../app/services'
import { NeedsKeyNotice, useHasKey } from '../../components/NeedsKey'
import { ReadingPausedNotice, useReadingPause } from '../../components/ReadingPaused'
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
  const { readingQueue } = useServices()
  const hasKey = useHasKey()
  const pause = useReadingPause()
  const text = strings.material.page
  switch (page.status) {
    case 'unread':
    case 'reading':
      // Without a key the Page waits in line until one is saved.
      if (hasKey === false) return <NeedsKeyNotice />
      if (pause) return <ReadingPausedNotice />
      return <p className="hint">{text.reading}</p>
    case 'failed':
      return (
        <div role="alert" className="stack">
          <p className="error">{strings.errors[page.failure ?? 'BadResponse']}</p>
          <button type="button" onClick={() => void readingQueue.retry(page.id)}>
            {text.retry}
          </button>
        </div>
      )
    case 'read':
      return <EditableText page={page} />
  }
}

/** A read Page's Recognized Text, which the Student can correct. */
function EditableText({ page }: { page: Page }) {
  const { store } = useServices()
  const [draft, setDraft] = useState<string | null>(null)
  const text = strings.material.page
  const current = page.recognizedText ?? ''

  async function save(event: FormEvent) {
    event.preventDefault()
    if (draft !== null && draft !== current) await store.editRecognizedText(page.id, draft)
    setDraft(null)
  }

  if (draft !== null) {
    return (
      <form onSubmit={save} className="stack">
        <textarea
          aria-label={text.editor(page.index + 1)}
          className="page-editor"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="row">
          <button type="submit">{text.save}</button>
          <button type="button" onClick={() => setDraft(null)}>
            {text.cancel}
          </button>
        </div>
      </form>
    )
  }

  return (
    <>
      <RichText>{current}</RichText>
      <div className="row">
        <button type="button" onClick={() => setDraft(current)}>
          {text.edit}
        </button>
        {page.editedByStudent && <p className="hint">{text.edited}</p>}
      </div>
    </>
  )
}

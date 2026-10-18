import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useServices } from '../../app/services'
import { strings } from '../../strings'
import { PageView } from './PageView'

/** One Material, a Page at a time: its original next to its Recognized Text. */
export function MaterialScreen() {
  const { store } = useServices()
  const params = useParams()
  const examId = Number(params.examId)
  const materialId = Number(params.materialId)
  const loaded = useLiveQuery(async () => {
    const material = await store.getMaterial(materialId)
    const exam = material && material.examId === examId ? await store.getExam(examId) : null
    if (!material || !exam) return null
    return { material, exam, pages: await store.materialPages(materialId) }
  }, [store, examId, materialId])
  // The Page shown (0-based).
  const [pageIndex, setPageIndex] = useState(0)

  // Render the screen whole once loaded, so its heading means it is ready.
  if (loaded === undefined) return null
  if (loaded === null) return <Navigate to={`/examenes/${examId}`} replace />

  const { material, exam, pages } = loaded
  const shown = Math.min(pageIndex, pages.length - 1)
  const page = pages[shown]
  const text = strings.material.page
  return (
    <main className="screen wide">
      <header>
        <Link to={`/examenes/${exam.id}`}>{strings.material.backToExam(exam.subject.name)}</Link>
        <h1>{material.name}</h1>
      </header>
      {pages.length > 1 && (
        <div className="row page-nav">
          <button type="button" disabled={shown === 0} onClick={() => setPageIndex(shown - 1)}>
            {text.previous}
          </button>
          <p aria-live="polite">{text.position(shown + 1, pages.length)}</p>
          <button
            type="button"
            disabled={shown === pages.length - 1}
            onClick={() => setPageIndex(shown + 1)}
          >
            {text.next}
          </button>
        </div>
      )}
      {/* key: a new Page starts its viewer afresh. */}
      {page && <PageView key={page.id} page={page} />}
    </main>
  )
}

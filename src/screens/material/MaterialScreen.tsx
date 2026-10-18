import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useServices } from '../../app/services'
import { strings } from '../../strings'
import { ManageMaterialSection } from './ManageMaterialSection'
import { PageView } from './PageView'

/** One Material: a Page's original next to its Recognized Text. */
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
  // The Page shown. A photo Material has one; moving between Pages comes with PDFs.
  const [pageIndex] = useState(0)

  // Render the screen whole once loaded, so its heading means it is ready.
  if (loaded === undefined) return null
  if (loaded === null) return <Navigate to={`/examenes/${examId}`} replace />

  const { material, exam, pages } = loaded
  const page = pages[pageIndex]
  return (
    <main className="screen wide">
      <header>
        <Link to={`/examenes/${exam.id}`}>{strings.material.backToExam(exam.subject.name)}</Link>
        <h1>{material.name}</h1>
      </header>
      {page && <PageView key={page.id} page={page} />}
      <ManageMaterialSection material={material} />
    </main>
  )
}

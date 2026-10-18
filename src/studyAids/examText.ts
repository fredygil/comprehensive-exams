// Study Aids: what every Study Aid is built from. The Exam's Recognized
// Text (read Pages only) and the prompt context (Language, Grade Level).
import type { ModelGateway } from '../gateway/gateway'
import type { MaterialText, PromptContext } from '../prompts/context'
import type { Exam, Store } from '../store/store'

export type StudyAidServices = { store: Store; gateway: ModelGateway }

/** The Recognized Text a Study Aid can use, and how many Pages it leaves out (unread or failed). */
export type ExamText = {
  materials: MaterialText[]
  /** The Pages included: the read ones, in order. */
  pageIds: number[]
  readPages: number
  notIncluded: number
}

/** The Exam's Recognized Text, Material by Material; only read Pages are included. */
export async function examText(store: Store, examId: number): Promise<ExamText> {
  const materials: MaterialText[] = []
  const pageIds: number[] = []
  let notIncluded = 0
  for (const material of await store.examMaterials(examId)) {
    const pages: string[] = []
    for (const page of await store.materialPages(material.id)) {
      if (page.status === 'read' && page.recognizedText !== null) {
        pages.push(page.recognizedText)
        pageIds.push(page.id)
      } else notIncluded++
    }
    if (pages.length) materials.push({ name: material.name, pages })
  }
  return { materials, pageIds, readPages: pageIds.length, notIncluded }
}

/** The Exam's Subject Language and the Student's Grade Level, for the Prompt Builder. */
export async function promptContext(store: Store, exam: Exam): Promise<PromptContext> {
  const student = await store.getStudent()
  if (!student) throw new Error('Study Aids need the Student (first run is not done)')
  return { language: exam.subject.language, gradeLevel: student.gradeLevel }
}

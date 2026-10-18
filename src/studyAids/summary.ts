// Study Aids: the Summary, a study guide of the whole Exam by topic.
//
// generateSummary(examId) sends the Exam's Recognized Text (read Pages only)
// to the summary model and stores the result with the material revision and
// Language it was built with, so the Store can tell when it is Outdated.
import type { ModelGateway, StructuredSchema } from '../gateway/gateway'
import { summaryPrompt, type MaterialText } from '../prompts/summary'
import type { Store } from '../store/store'

export type StudyAidServices = { store: Store; gateway: ModelGateway }

/** The Recognized Text a Study Aid can use, and how many Pages it leaves out (unread or failed). */
export type ExamText = {
  materials: MaterialText[]
  /** The Pages included: the read ones. */
  pageIds: number[]
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
  return { materials, pageIds, notIncluded }
}

type SummaryTopics = { topics: { title: string; content: string }[] }

const summarySchema: StructuredSchema<SummaryTopics> = {
  name: 'summary',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['topics'],
    properties: {
      topics: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'content'],
          properties: { title: { type: 'string' }, content: { type: 'string' } },
        },
      },
    },
  },
  isValid: (value): value is SummaryTopics => {
    const topics = (value as { topics?: unknown } | null)?.topics
    return (
      Array.isArray(topics) &&
      topics.length > 0 &&
      topics.every((topic: { title?: unknown; content?: unknown } | null) => {
        return typeof topic?.title === 'string' && topic.title.trim() !== '' && typeof topic.content === 'string'
      })
    )
  },
}

/** One `##` heading per topic, its key points under it. */
function topicsMarkdown({ topics }: SummaryTopics): string {
  return topics.map(({ title, content }) => `## ${title.trim()}\n\n${content.trim()}`).join('\n\n')
}

/**
 * Generates the Exam's Summary from its read Pages, in the Subject's
 * Language at the Student's Grade Level, and stores it in place of any
 * earlier one. On failure the earlier Summary stays as it was.
 */
export async function generateSummary({ store, gateway }: StudyAidServices, examId: number) {
  const exam = await store.getExam(examId)
  const student = await store.getStudent()
  if (!exam || !student) throw new Error('generateSummary needs the Exam and the Student')
  const text = await examText(store, examId)
  const context = { language: exam.subject.language, gradeLevel: student.gradeLevel }
  const topics = await gateway.generateStructured(
    summaryPrompt(context, exam.subject.name, text.materials),
    summarySchema,
    'summary',
  )
  await store.saveSummary(examId, {
    markdown: topicsMarkdown(topics),
    builtAtRevision: exam.materialRevision,
    builtWithLanguage: exam.subject.language,
    includedPageIds: text.pageIds,
  })
}

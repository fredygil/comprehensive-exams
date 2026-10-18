// Study Aids: Explainers and the topic suggestions that lead to them.
//
// suggestTopics(exam) asks the summary model for topics in the Exam's
// Recognized Text; generateExplainer(exam, topic) researches one topic on
// the web and stores the Explainer with its sources.
import type { ModelGateway, StructuredSchema } from '../gateway/gateway'
import type { PromptContext } from '../prompts/context'
import { suggestTopicsPrompt, type MaterialText } from '../prompts/suggestTopics'
import type { Exam, Store } from '../store/store'

export type StudyAidServices = { store: Store; gateway: ModelGateway }

/** The Recognized Text a Study Aid can use, and how many Pages it leaves out (unread or failed). */
export type ExamText = { materials: MaterialText[]; readPages: number; notIncluded: number }

/** The Exam's Recognized Text, Material by Material; only read Pages are included. */
export async function examText(store: Store, examId: number): Promise<ExamText> {
  const materials: MaterialText[] = []
  let readPages = 0
  let notIncluded = 0
  for (const material of await store.examMaterials(examId)) {
    const pages: string[] = []
    for (const page of await store.materialPages(material.id)) {
      if (page.status === 'read' && page.recognizedText !== null) pages.push(page.recognizedText)
      else notIncluded++
    }
    readPages += pages.length
    if (pages.length) materials.push({ name: material.name, pages })
  }
  return { materials, readPages, notIncluded }
}

async function promptContext(store: Store, exam: Exam): Promise<PromptContext> {
  const student = await store.getStudent()
  if (!student) throw new Error('Study Aids need the Student (first run is not done)')
  return { language: exam.subject.language, gradeLevel: student.gradeLevel }
}

const topicsSchema: StructuredSchema<{ topics: string[] }> = {
  name: 'topics',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['topics'],
    properties: { topics: { type: 'array', items: { type: 'string' } } },
  },
  isValid: (value): value is { topics: string[] } => {
    const topics = (value as { topics?: unknown } | null)?.topics
    return (
      Array.isArray(topics) &&
      topics.every((topic) => typeof topic === 'string') &&
      topics.some((topic) => topic.trim())
    )
  },
}

/** Topics from the Exam's Recognized Text worth an Explainer, in the Subject's Language. */
export async function suggestTopics({ store, gateway }: StudyAidServices, exam: Exam): Promise<string[]> {
  const context = await promptContext(store, exam)
  const { materials } = await examText(store, exam.id)
  // Topic suggestions have no job of their own; they use the summary model.
  const { topics } = await gateway.generateStructured(
    suggestTopicsPrompt(context, materials),
    topicsSchema,
    'summary',
  )
  return [...new Set(topics.map((topic) => topic.trim()).filter(Boolean))]
}

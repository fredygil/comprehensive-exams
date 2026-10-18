// Study Aids: the Summary, a study guide of the whole Exam by topic.
//
// generateSummary(examId) sends the Exam's Recognized Text (read Pages only)
// to the summary model and stores the result with the material revision and
// Language it was built with, so the Store can tell when it is Outdated.
import type { StructuredSchema } from '../gateway/gateway'
import { summaryPrompt } from '../prompts/summary'
import { examText, promptContext, type StudyAidServices } from './examText'

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
  if (!exam) throw new Error(`generateSummary: no Exam ${examId}`)
  const context = await promptContext(store, exam)
  const text = await examText(store, examId)
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

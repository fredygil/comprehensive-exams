// Study Aids: Explainers and the topic suggestions that lead to them.
//
// suggestTopics(exam) asks the summary model for topics in the Exam's
// Recognized Text; generateExplainer(exam, topic) researches one topic on
// the web and stores the Explainer with its sources.
import type { StructuredSchema } from '../gateway/gateway'
import { explainerPrompt } from '../prompts/explainer'
import { suggestTopicsPrompt } from '../prompts/suggestTopics'
import type { Exam } from '../store/store'
import { examText, promptContext, type StudyAidServices } from './examText'

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

/**
 * Researches the topic on the web and stores the Explainer (Markdown and the
 * sources it cites) under the Exam. Returns its id.
 */
export async function generateExplainer(
  { store, gateway }: StudyAidServices,
  exam: Exam,
  topic: string,
): Promise<number> {
  const context = await promptContext(store, exam)
  const answer = await gateway.generateWithWebSearch(explainerPrompt(context, exam.subject.name, topic))
  return store.addExplainer(exam.id, { topic, markdown: answer.markdown, sources: answer.citations })
}

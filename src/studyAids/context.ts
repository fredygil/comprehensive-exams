// Study Aids: what every Study Aid needs besides the Exam's Recognized Text
// (store.examText): its services and the prompt context (Language, Grade Level).
import type { ModelGateway } from '../gateway/gateway'
import { promptContext, type PromptContext } from '../prompts/context'
import type { Exam, Store } from '../store/store'

export type StudyAidServices = { store: Store; gateway: ModelGateway }

/** The Exam's Subject Language and the Student's Grade Level, for the Prompt Builder. */
export async function studyAidContext(store: Store, exam: Exam): Promise<PromptContext> {
  const student = await store.getStudent()
  if (!student) throw new Error('Study Aids need the Student (first run is not done)')
  return promptContext(exam, student)
}

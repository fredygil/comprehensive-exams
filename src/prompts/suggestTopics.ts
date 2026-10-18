import { languageName, studentLine, type PromptContext } from './context'

/** One Material's Recognized Text, Page by Page (read Pages only). */
export type MaterialText = { name: string; pages: string[] }

/** Asks for topics in the Student's notes worth a deeper, web-sourced Explainer. */
export function suggestTopicsPrompt(context: PromptContext, materials: MaterialText[]): string {
  return [
    `Below are the notebook notes of ${studentLine(context)}, for one exam.`,
    'Suggest 3 to 6 topics from these notes that are worth exploring further with a deeper explanation from web sources:',
    'ideas that are central, hard to understand, or only sketched in the notes.',
    'Use only topics that appear in the notes.',
    `Write each topic as a short title (a few words) in ${languageName(context.language)}.`,
    'Reply with JSON: {"topics": ["...", "..."]}.',
    '',
    ...materials.flatMap((material) => [`## Material: ${material.name}`, '', ...material.pages, '']),
  ].join('\n')
}

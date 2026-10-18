import { languageName, materialSections, studentLine, type PromptContext, type QuotedMaterial } from './context'

/** Asks for topics in the Exam's Material worth a deeper, web-sourced Explainer. */
export function suggestTopicsPrompt(context: PromptContext, materials: QuotedMaterial[]): string {
  return [
    `Below is the material of ${studentLine(context)} for one exam: the text read from their scanned notebook pages.`,
    'Suggest 3 to 6 topics from this material that are worth exploring further with a deeper explanation from web sources:',
    'ideas that are central, hard to understand, or only sketched in the material.',
    'Use only topics that appear in the material.',
    `Write each topic as a short title (a few words) in ${languageName(context.language)}.`,
    'Reply with JSON: {"topics": ["...", "..."]}.',
    '',
    ...materialSections(materials),
  ].join('\n')
}

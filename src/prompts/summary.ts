import { MARKDOWN_WITH_MATH, languageName, materialSections, studentLine, type PromptContext, type QuotedMaterial } from './context'

/** Asks for a study guide of the whole Exam, organized by topic, from its Material only. */
export function summaryPrompt(context: PromptContext, subject: string, materials: QuotedMaterial[]): string {
  return [
    `Below is all the material of ${studentLine(context)} for the comprehensive exam of ${subject}: the text read from their scanned notebook pages.`,
    'Write a study guide of everything in this material, organized by topic, so the student can study one topic at a time.',
    'Under each topic, list its key ideas, definitions, formulas, dates and names, as concise Markdown bullet points.',
    'Use only what is in the material: do not add facts, examples or topics that are not there.',
    `Write in ${languageName(context.language)}, in words a grade ${context.gradeLevel} student understands, even where the material uses another language.`,
    MARKDOWN_WITH_MATH,
    'Do not start a topic with its own heading; its title goes in "title".',
    'Reply with JSON: {"topics": [{"title": "...", "content": "Markdown"}]}, topics in the order they appear in the material.',
    '',
    ...materialSections(materials),
  ].join('\n')
}

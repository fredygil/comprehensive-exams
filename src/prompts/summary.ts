import { MARKDOWN_WITH_MATH, languageName, studentLine, type PromptContext } from './context'

/** One Material's Recognized Text, Page by Page (read Pages only). */
export type MaterialText = { name: string; pages: string[] }

/** Asks for a study guide of the whole Exam, organized by topic, from the Student's notes only. */
export function summaryPrompt(context: PromptContext, subject: string, materials: MaterialText[]): string {
  return [
    `Below are all the notebook notes of ${studentLine(context)}, for the comprehensive exam of ${subject}.`,
    'Write a study guide of everything in these notes, organized by topic, so the student can study one topic at a time.',
    'Under each topic, list its key ideas, definitions, formulas, dates and names, as concise Markdown bullet points.',
    'Use only what is in the notes: do not add facts, examples or topics that are not there.',
    `Write in ${languageName(context.language)}, in words a grade ${context.gradeLevel} student understands, even where the notes use another language.`,
    MARKDOWN_WITH_MATH,
    'Do not start a topic with its own heading; its title goes in "title".',
    'Reply with JSON: {"topics": [{"title": "...", "content": "Markdown"}]}, topics in the order they appear in the notes.',
    '',
    ...materials.flatMap((material) => [`## Material: ${material.name}`, '', ...material.pages, '']),
  ].join('\n')
}

import { MARKDOWN_WITH_MATH, languageName, studentLine, type PromptContext } from './context'

/** The transcription prompt sent with each Page's scan. */
export function readPagePrompt(context: PromptContext): string {
  return [
    `This is a photo or scan of one notebook page written by ${studentLine(context)}.`,
    'Transcribe everything on the page exactly as written: handwriting, printed text, tables and formulas, in reading order.',
    `Keep the language the page is written in. Do not translate anything, even if it is not ${languageName(context.language)}.`,
    'Do not correct, summarize, explain or add anything. If a word is unreadable, write [?].',
    MARKDOWN_WITH_MATH,
    'Reply with the transcription only.',
  ].join('\n')
}

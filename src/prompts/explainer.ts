import { MARKDOWN_WITH_MATH, languageName, studentLine, type PromptContext } from './context'

/** Asks for a deeper, web-researched explanation of one topic (sent with the web search tool). */
export function explainerPrompt(context: PromptContext, subject: string, topic: string): string {
  const language = languageName(context.language)
  return [
    `Explain this topic to ${studentLine(context)}, for the subject "${subject}":`,
    '',
    `Topic: ${topic}`,
    '',
    'Search the web and write an explanation that goes deeper than school notes:',
    'what it is, why it matters, how it works, worked examples, and common mistakes.',
    `Prefer sources written in ${language}; sources in other languages are allowed when they are better.`,
    `Write the whole explanation in ${language}, at a level a grade ${context.gradeLevel} student understands.`,
    'Start with a heading, and do not include a list of sources: the app shows them.',
    MARKDOWN_WITH_MATH,
  ].join('\n')
}

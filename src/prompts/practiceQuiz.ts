import { MARKDOWN_WITH_MATH, languageName, studentLine, type PromptContext } from './context'

/** One Material's Recognized Text, labelled with the id the model cites as `sourceMaterialId`. */
export type QuizSourceMaterial = { id: string; pages: string[] }

/**
 * The Practice Quiz prompt: `count` four-option Questions drawn only from the
 * Materials' Recognized Text, each with its explanation (the Feedback) and
 * the Material it comes from, avoiding the prompts of Questions already
 * asked (`earlierPrompts`). The JSON shape itself is the request's schema.
 */
export function practiceQuizPrompt(
  context: PromptContext,
  {
    count,
    materials,
    earlierPrompts = [],
  }: { count: number; materials: QuizSourceMaterial[]; earlierPrompts?: string[] },
): string {
  const language = languageName(context.language)
  return [
    `Write a practice quiz of ${count} multiple-choice questions for ${studentLine(context)}, to prepare for their exam.`,
    'Use only the notes below. Every question, option and explanation must be answerable from them; never ask about anything the notes do not cover.',
    `Write everything in ${language}, in words a student of that grade understands, even where the notes use another language.`,
    'Each question has exactly four options and exactly one of them is correct. The wrong options are plausible, and all four are about the same length.',
    'correctIndex is the 0-based position of the correct option in options.',
    'explanation says in one or two sentences why the correct option is right; the student reads it after answering wrong.',
    'sourceMaterialId is the id of the material the question comes from. Do not mention material ids in the text.',
    'Ask about different ideas; do not ask the same thing twice.',
    MARKDOWN_WITH_MATH,
    'Keep each field short: no headings.',
    '',
    'The notes, one material at a time:',
    ...materials.map(
      (material) => `<material id="${material.id}">\n${material.pages.join('\n\n')}\n</material>`,
    ),
    ...(earlierPrompts.length
      ? [
          '',
          'The student has already been asked the questions below. Ask about other things the notes cover, or the same idea in a clearly different way.',
          'Only if the notes have nothing new left to ask may you repeat one of them.',
          '<asked>',
          ...earlierPrompts.map((prompt) => `- ${prompt.replace(/\s+/g, ' ')}`),
          '</asked>',
        ]
      : []),
  ].join('\n')
}

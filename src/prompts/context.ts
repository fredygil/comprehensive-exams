// Prompt Builder: the one place that builds every prompt sent to a model.
//
// Every prompt carries the Subject's Language and the Student's Grade Level
// (a PromptContext). Each prompt lives in its own file next to this one
// (readPage.ts, ...) and builds on the shared pieces below. Prompts are in
// English, which models follow best; they name the Language to write in.
import type { GradeLevel, Language, Material, PageText } from '../store/store'

export type PromptContext = {
  /** The Subject's Language. */
  language: Language
  /** The Student's Grade Level. */
  gradeLevel: GradeLevel
}

/**
 * What a prompt quotes of one Material: its read Pages' Recognized Text, in
 * order. The Store's MaterialText (store.examText) is one.
 */
export type QuotedMaterial = { material: Pick<Material, 'id' | 'name'>; pages: Pick<PageText, 'text'>[] }

/** The Materials worth quoting: those with at least one read Page. */
export function withReadPages<T extends QuotedMaterial>(materials: T[]): T[] {
  return materials.filter((material) => material.pages.length > 0)
}

/** Each Material's Recognized Text under a "## Material: <name>" heading, Page after Page. */
export function materialSections(materials: QuotedMaterial[]): string[] {
  return withReadPages(materials).flatMap(({ material, pages }) => [
    `## Material: ${material.name}`,
    '',
    ...pages.map((page) => page.text),
    '',
  ])
}

const LANGUAGE_NAMES: Record<Language, string> = { es: 'Spanish', en: 'English' }

/** "Spanish" for 'es': how prompts name a Language. */
export function languageName(language: Language): string {
  return LANGUAGE_NAMES[language]
}

/** Who the content is for, e.g. "a grade 5 student studying a subject taught in Spanish". */
export function studentLine({ language, gradeLevel }: PromptContext): string {
  return `a grade ${gradeLevel} student studying a subject taught in ${languageName(language)}`
}

/**
 * How to write Markdown with math so the app renders it (remark-math +
 * KaTeX): `$` and `$$` delimiters only, and escaped dollar signs for money.
 */
export const MARKDOWN_WITH_MATH = [
  'Format the text as Markdown (headings, lists and tables where they help).',
  'Write every formula in LaTeX: $...$ for inline math, and $$ on its own line before and after display math.',
  'Never use \\( \\) or \\[ \\] as math delimiters.',
  'Write a literal dollar sign (money) as \\$.',
].join('\n')

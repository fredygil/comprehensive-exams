// The AI jobs and the default model for each one.
// Source: docs/research/openrouter-models.md and spec #1 "Default models".
// Every job's model can be changed in Settings.

export const JOBS = ['readPages', 'summary', 'practiceQuiz', 'explainer'] as const

export type Job = (typeof JOBS)[number]

export const DEFAULT_MODELS: Record<Job, string> = {
  readPages: 'google/gemini-3.1-flash-lite',
  summary: 'anthropic/claude-haiku-5.5',
  practiceQuiz: 'anthropic/claude-haiku-5.5',
  explainer: 'anthropic/claude-haiku-5.5',
}

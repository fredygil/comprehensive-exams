// The OpenRouter key for the live check. It comes only from the environment,
// never from a file in the repo. Imported by live-check/vitest.config.ts, so
// it has no imports of its own.

export const KEY_VARIABLE = 'OPENROUTER_API_KEY'

/** The key from `env`, or an error that says how to provide it. */
export function requireKey(env: Record<string, string | undefined>): string {
  const key = env[KEY_VARIABLE]?.trim()
  if (!key) {
    throw new Error(
      `The live check needs an OpenRouter key in ${KEY_VARIABLE}. Run it as:\n` +
        `  ${KEY_VARIABLE}=sk-or-... npm run live-check`,
    )
  }
  return key
}

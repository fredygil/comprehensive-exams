// `npm run live-check`: the live check against real OpenRouter. Never part of
// `npm test` or CI: vitest.config.ts doesn't include live-check/, and this
// config exits before running anything when there is no key.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { requireKey } from './key.ts'

try {
  requireKey(process.env)
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    include: ['live-check/run.live.ts'],
    // jsdom for FileReader, which the Gateway uses to make data URLs.
    environment: 'jsdom',
    // Real model calls: a Page can take a while to read.
    testTimeout: 5 * 60_000,
    // Print the report as it comes, not buffered per test.
    disableConsoleIntercept: true,
  },
})

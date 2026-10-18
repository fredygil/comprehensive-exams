// The live check's entry, run by `npm run live-check` (live-check/vitest.config.ts).
// Reads the neutral sample Pages in fixtures/ with a real key and prints the
// report. Optional: LIVE_CHECK_READ_MODEL / LIVE_CHECK_QUIZ_MODEL try other
// models; LIVE_CHECK_GRADE_LEVEL sets the Grade Level (default 6).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { PageMime } from '../src/store/store'
import { requireKey } from './key'
import { runLiveCheck, type Sample } from './liveCheck'

function fixture(file: string, mime: PageMime): Sample['original'] {
  return { mime, bytes: new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', file))) }
}

const env = process.env

test('live check against OpenRouter', async () => {
  const { ok } = await runLiveCheck({
    key: requireKey(env),
    samples: [
      { name: 'sample-page-es.pdf', language: 'es', original: fixture('sample-page-es.pdf', 'application/pdf') },
      { name: 'sample-photo-en.jpg', language: 'en', original: fixture('sample-photo-en.jpg', 'image/jpeg') },
    ],
    models: {
      ...(env.LIVE_CHECK_READ_MODEL && { readPages: env.LIVE_CHECK_READ_MODEL }),
      ...(env.LIVE_CHECK_QUIZ_MODEL && { practiceQuiz: env.LIVE_CHECK_QUIZ_MODEL }),
    },
    gradeLevel: env.LIVE_CHECK_GRADE_LEVEL ? Number(env.LIVE_CHECK_GRADE_LEVEL) : undefined,
    print: (text) => console.log(text),
  })
  expect(ok, 'some calls failed: see FAILED above').toBe(true)
})

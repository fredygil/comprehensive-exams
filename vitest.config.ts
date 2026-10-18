import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// A fixed time zone, so fake-clock tests (countdowns, "today", greetings) give
// the same result on a laptop and on the UTC CI runner. Workers inherit it.
process.env.TZ = 'America/Bogota'

// Kept separate from vite.config.ts so tests don't load the PWA plugin.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/harness/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    // Vitest 5 only clears mock calls by default; also undo implementations
    // and vi.stubGlobal between tests.
    restoreMocks: true,
    unstubGlobals: true,
  },
})

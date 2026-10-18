import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// A fixed time zone, so fake-clock tests (countdowns, "today", greetings) give
// the same result on a laptop and on the UTC CI runner. Workers inherit it.
process.env.TZ = 'America/Bogota'

// Kept separate from vite.config.ts so tests don't load the PWA plugin.
export default defineConfig({
  plugins: [react()],
  test: {
    // Vitest 5 only clears mock calls by default; also undo implementations
    // and vi.stubGlobal between tests.
    restoreMocks: true,
    unstubGlobals: true,
    projects: [
      {
        // The primary seam: the whole app in jsdom (npm run test:unit).
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./tests/harness/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
          exclude: ['**/*.browser.test.{ts,tsx}', '**/node_modules/**'],
        },
      },
      {
        // The Page Viewer in real Chromium, for PDF.js (npm run test:browser).
        extends: true,
        // Pre-bundled up front: discovering them mid-run reloads the page and the tests.
        optimizeDeps: { include: ['pdfjs-dist', 'pdf-lib', 'react-dom/client', 'vitest-browser-react'] },
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.browser.test.{ts,tsx}'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})

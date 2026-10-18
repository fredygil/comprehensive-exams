// Global test setup (vitest.config.ts → setupFiles).
import '@testing-library/jest-dom/vitest'
// Replaces IndexedDB with an in-memory implementation for the whole run.
// renderApp() gives each test its own database name, so tests don't share data.
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { openRouterRequests, server } from './openRouter'
import { closeOpenApps } from './renderApp'

// jsdom can't draw PDF Pages: the app gets a stand-in Page Viewer.
vi.mock('../../src/pageViewer/PageViewer', () => import('./pageViewerStandIn'))

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))

beforeEach(() => {
  openRouterRequests.length = 0
})

afterEach(async () => {
  cleanup()
  await closeOpenApps()
  server.resetHandlers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

afterAll(() => server.close())

// The primary test seam: the whole app, rendered through its screens.
//
//   const app = await renderApp()               // a fresh tablet, first run
//   await app.user.click(screen.getByRole(...))  // drive it like the Student
//   await app.reopen()                          // close and reopen the app
//
// Each call is one "tablet": its own fake IndexedDB database and its own fake
// `navigator.storage`. `reopen()` unmounts the app, closes the Store and
// mounts a fresh app against the same database, like closing the app and
// launching it again from the home screen.
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { App } from '../../src/app/App'
import { createAppServices, type AppServices } from '../../src/app/services'
import type { Student } from '../../src/store/store'

export type RenderAppOptions = {
  /**
   * Preconditions, written through the Store's public API before launch.
   * Use these to skip setup steps that aren't what the test is about; drive
   * the behaviour under test through the screens.
   */
  student?: Student
  openRouterKey?: string
}

type RunningApp = { services: AppServices; unmount: () => void }

let devices = 0
let running: RunningApp[] = []

/** Called by setup.ts after each test. */
export async function closeOpenApps() {
  for (const app of running) {
    app.unmount()
    await app.services.store.close()
  }
  running = []
  Reflect.deleteProperty(navigator, 'storage')
}

function fakeStorageManager() {
  let persisted = false
  return {
    persisted: vi.fn(async () => persisted),
    persist: vi.fn(async () => {
      persisted = true
      return true
    }),
  }
}

export async function renderApp(options: RenderAppOptions = {}) {
  const dbName = `test-device-${++devices}`
  const storage = fakeStorageManager()
  Object.defineProperty(navigator, 'storage', { value: storage, configurable: true })

  let current: RunningApp | undefined

  async function launch(seed?: (services: AppServices) => Promise<void>) {
    // Launching from the home screen always starts at the start URL.
    window.history.replaceState(null, '', '/')
    const services = createAppServices({ dbName })
    await seed?.(services)
    const { unmount } = render(<App services={services} />)
    current = { services, unmount }
    running.push(current)
  }

  await launch(async ({ store }) => {
    if (options.student) await store.saveStudent(options.student)
    if (options.openRouterKey) await store.saveOpenRouterKey(options.openRouterKey)
  })

  return {
    user: userEvent.setup(),
    /** The fake `navigator.storage`, to check persistence was requested. */
    storage,
    /** Close the app and open it again on the same tablet. */
    async reopen() {
      if (!current) throw new Error('app is not open')
      const closing = current
      running = running.filter((app) => app !== closing)
      closing.unmount()
      await closing.services.store.close()
      await launch()
    },
  }
}

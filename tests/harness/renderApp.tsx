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
import type {
  ExplainerDraft,
  IsoDate,
  PeriodDraft,
  Store,
  Student,
  SubjectDraft,
} from '../../src/store/store'

export type RenderAppOptions = {
  /**
   * Preconditions, written through the Store's public API before launch.
   * Use these to skip setup steps that aren't what the test is about; drive
   * the behaviour under test through the screens.
   */
  student?: Student
  openRouterKey?: string
  /** Subjects that already exist, e.g. `[{ name: 'Matemáticas', language: 'es' }]`. */
  subjects?: SubjectDraft[]
  /**
   * Exams that already exist, naming one of `subjects`; their Periods are
   * created as needed. E.g. `[{ subject: 'Matemáticas', period: { schoolYearStart: 2026, quarter: 1 } }]`.
   */
  exams?: {
    subject: string
    period: PeriodDraft
    examDate?: IsoDate
    /** Material already added and read, in order. */
    materials?: SeededMaterial[]
    /** Explainers already generated, e.g. `[{ topic, markdown, sources: [{ url, title }] }]`. */
    explainers?: ExplainerDraft[]
  }[]
}

/**
 * A photo Material whose Pages have all been read: one Recognized Text
 * (Markdown) per Page, e.g. `{ name: 'Unidad 1', pages: ['# Fracciones ...'] }`.
 * `unreadPages: n` adds n more Pages after those, still waiting to be read
 * (the app reads them on launch).
 */
export type SeededMaterial = { name: string; pages: string[]; unreadPages?: number }

async function seedMaterial(store: Store, examId: number, material: SeededMaterial) {
  const bytes = new TextEncoder().encode(`photo bytes of ${material.name}`)
  const [materialId] = await store.addMaterials(examId, [
    {
      name: material.name,
      sourceFileName: `${material.name}.jpg`,
      pages: Array.from({ length: material.pages.length + (material.unreadPages ?? 0) }, () => ({
        bytes,
        mime: 'image/jpeg' as const,
      })),
    },
  ])
  const pages = await store.materialPages(materialId)
  for (const [i, text] of material.pages.entries()) await store.markPageRead(pages[i].id, text)
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
    // Retries of a busy model happen at once, so tests don't sit through the backoff.
    const services = createAppServices({ dbName, wait: async () => {} })
    await seed?.(services)
    const { unmount } = render(<App services={services} />)
    current = { services, unmount }
    running.push(current)
  }

  await launch(async ({ store }) => {
    if (options.student) await store.saveStudent(options.student)
    if (options.openRouterKey) await store.saveOpenRouterKey(options.openRouterKey)
    const subjectIds = new Map<string, number>()
    for (const subject of options.subjects ?? []) {
      subjectIds.set(subject.name, await store.createSubject(subject))
    }
    for (const exam of options.exams ?? []) {
      const subjectId = subjectIds.get(exam.subject)
      if (subjectId === undefined) throw new Error(`renderApp: no Subject named ${exam.subject}`)
      const examId = await store.createExam({
        subjectId,
        period: exam.period,
        examDate: exam.examDate ?? null,
      })
      for (const material of exam.materials ?? []) await seedMaterial(store, examId, material)
      for (const explainer of exam.explainers ?? []) await store.addExplainer(examId, explainer)
    }
  })

  return {
    user: userEvent.setup(),
    /** The fake `navigator.storage`, to check persistence was requested. */
    storage,
    /**
     * The running app's Store, for the few rules only its domain queries can
     * show (e.g. an Exam's material revision). Read through it; never write.
     */
    get store(): Store {
      if (!current) throw new Error('app is not open')
      return current.services.store
    },
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

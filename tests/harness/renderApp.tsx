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
import { examText } from '../../src/studyAids/examText'
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
    /**
     * A Summary (its Markdown) generated after the Material above was added
     * and read, so it is not Outdated and includes every read Page.
     */
    summary?: string
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

/** Stores a Summary as if generated now, from the Exam's read Pages. */
async function seedSummary(store: Store, examId: number, markdown: string) {
  const exam = (await store.getExam(examId))!
  const { pageIds } = await examText(store, examId)
  await store.saveSummary(
    examId,
    {
      markdown,
      builtAtRevision: exam.materialRevision,
      builtWithLanguage: exam.subject.language,
      includedPageIds: pageIds,
    },
    store.epoch(),
  )
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
  const savedFiles: File[] = []

  async function launch(seed?: (services: AppServices) => Promise<void>) {
    // Launching from the home screen always starts at the start URL.
    window.history.replaceState(null, '', '/')
    // Retries of a busy model happen at once, so tests don't sit through the backoff.
    const services = createAppServices({
      dbName,
      wait: async () => {},
      saveFile: (file) => savedFiles.push(file),
    })
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
      for (const explainer of exam.explainers ?? []) await store.addExplainer(examId, explainer, store.epoch())
      if (exam.summary !== undefined) await seedSummary(store, examId, exam.summary)
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
    /** Files the app handed to the tablet to save (downloads), in order, e.g. a backup. */
    savedFiles,
    /** Close the app for good, e.g. before picking up another tablet with renderApp(). */
    async close() {
      if (!current) throw new Error('app is not open')
      const closing = current
      running = running.filter((app) => app !== closing)
      current = undefined
      closing.unmount()
      await closing.services.store.close()
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

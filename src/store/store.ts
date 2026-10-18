// Store: the only module that touches IndexedDB (via Dexie).
//
// It speaks in domain terms (getStudent, saveModel, ...) rather than tables.
// Reads are plain async functions, so the UI can wrap them in
// `useLiveQuery(() => store.getStudent())` and re-render when data changes.
//
// One Store, one interface, built from a file per area of the domain that
// share one database (db.ts):
//   settings.ts   the Student and Settings
//   exams.ts      Subjects, Periods, Exams, and deleting an Exam with its parts
//   material.ts   Material and Pages, Page reading, the Exam's Recognized Text
//   studyAids.ts  the Summary and Explainers
//   quizzes.ts    Practice and Mistakes Quizzes
//   snapshot.ts   everything at once, for a backup
// The domain types are in types.ts; import them from here.
//
// Store methods must not use `this`: the Store is often destructured.
import { DEFAULT_DB_NAME, Database, type StoreContext } from './db'
import { examsStore } from './exams'
import { materialStore } from './material'
import { quizzesStore } from './quizzes'
import { settingsStore } from './settings'
import { snapshotStore } from './snapshot'
import { studyAidsStore } from './studyAids'
import type { StoreEpoch } from './types'

export * from './types'
export { DEFAULT_DB_NAME } from './db'

export function createStore(dbName: string = DEFAULT_DB_NAME) {
  const db = new Database(dbName)
  const context: StoreContext = { db, epoch: { current: 0 } }

  const material = materialStore(context)
  const studyAids = studyAidsStore(context)
  const quizzes = quizzesStore(context)
  // Everything stored under an Exam, which goes with it, in the order
  // confirmations list it (see ExamPartKind).
  const exams = examsStore(context, [
    material.examPart,
    studyAids.summaryPart,
    studyAids.explainersPart,
    quizzes.examPart,
  ])

  return {
    /**
     * The epoch to pass to a write that will happen after a slow job (a model
     * call): take it before the job starts, so a result that comes back after
     * its Exam was deleted, or after a backup replaced everything, is dropped.
     */
    epoch(): StoreEpoch {
      return context.epoch.current
    },

    ...settingsStore(context),
    ...exams,
    ...material.store,
    ...studyAids.store,
    ...quizzes.store,
    ...snapshotStore(context),

    async close() {
      db.close()
    },
  }
}

export type Store = ReturnType<typeof createStore>

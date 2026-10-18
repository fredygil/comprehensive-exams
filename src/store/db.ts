// Store: the Dexie database (schema and row types) and what every part of
// the Store shares. Only the files in src/store/ import this.
import Dexie, { type EntityTable, type Table } from 'dexie'
import type { Job } from '../settings/models'
import type {
  ExamPartKind,
  Explainer,
  IsoDate,
  Material,
  Page,
  PageMime,
  Period,
  PracticeQuiz,
  Question,
  StoreEpoch,
  Student,
  Subject,
  Summary,
} from './types'

// What is actually written: models holds only the jobs changed from the default.
export type StoredSettings = {
  openRouterKey?: string | null
  models?: Partial<Record<Job, string>>
}

export type ExamRow = {
  id: number
  subjectId: number
  periodId: number
  examDate: IsoDate | null
  materialRevision: number
}

export type PageOriginalRow = { pageId: number; bytes: ArrayBuffer; mime: PageMime }

// Singleton records (one Student, one Settings) live in one table, keyed by id.
export type SingletonRow =
  | { id: 'student'; value: Student }
  | { id: 'settings'; value: StoredSettings }

export class Database extends Dexie {
  singletons!: EntityTable<SingletonRow, 'id'>
  subjects!: EntityTable<Subject, 'id'>
  periods!: EntityTable<Period, 'id'>
  exams!: EntityTable<ExamRow, 'id'>
  materials!: EntityTable<Material, 'id'>
  pages!: EntityTable<Page, 'id'>
  // Kept apart from `pages` so listing Pages never loads their scans.
  // Bytes are stored as an ArrayBuffer: fake-indexeddb (tests) drops Blobs.
  pageOriginals!: EntityTable<PageOriginalRow, 'pageId'>
  explainers!: EntityTable<Explainer, 'id'>
  questions!: EntityTable<Question, 'id'>
  quizzes!: EntityTable<PracticeQuiz, 'id'>
  // Keyed by examId: at most one Summary per Exam.
  summaries!: EntityTable<Summary, 'examId'>

  constructor(name: string) {
    super(name)
    // Add new tables to this schema until v0 is released; after that, add a
    // new `this.version(n)` instead of editing an old one.
    this.version(1).stores({
      singletons: 'id',
      subjects: '++id',
      periods: '++id, &[schoolYearStart+quarter]',
      exams: '++id, &[subjectId+periodId], subjectId, periodId',
      materials: '++id, examId',
      pages: '++id, materialId, status',
      pageOriginals: 'pageId',
      explainers: '++id, examId',
      questions: '++id, examId',
      quizzes: '++id, examId',
      summaries: 'examId',
    })
  }
}

export const DEFAULT_DB_NAME = 'comprehensive-exams'

/** What every part of the Store works on: the database and the current epoch (see StoreEpoch). */
export type StoreContext = { db: Database; epoch: { current: StoreEpoch } }

/**
 * One kind of data stored under an Exam (an ExamPartKind): the tables it
 * touches (so deletes run in one transaction), how much an Exam holds for
 * the confirmation, and how to delete it for a set of Exams. Each part of
 * the Store that keeps data under an Exam defines its own; createStore lists
 * them.
 *
 * Keep each `delete` flat: await Dexie calls directly, not another async
 * helper. Inside a transaction Dexie only follows native `await` one async
 * function deep; deeper, the transaction commits early (PrematureCommitError).
 */
export type ExamPart = {
  kind: ExamPartKind
  tables: Table[]
  count: (examId: number) => Promise<number>
  delete: (examIds: number[]) => Promise<void>
}

/**
 * May a result started in `startedIn` be stored under the Exam? Not if the
 * Exam was deleted, or everything was replaced, since. Call inside the
 * write's transaction, which must include db.exams.
 */
export async function canStoreUnder({ db, epoch }: StoreContext, examId: number, startedIn: StoreEpoch) {
  return startedIn === epoch.current && (await db.exams.get(examId)) !== undefined
}

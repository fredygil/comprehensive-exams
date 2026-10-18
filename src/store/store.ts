// Store: the only module that touches IndexedDB (via Dexie).
//
// It speaks in domain terms (getStudent, saveModel, ...) rather than tables.
// Reads are plain async functions, so the UI can wrap them in
// `useLiveQuery(() => store.getStudent())` and re-render when data changes.
import Dexie, { type EntityTable } from 'dexie'
import { DEFAULT_MODELS, JOBS, type Job } from '../settings/models'

export type GradeLevel = number

export type Student = {
  name: string
  gradeLevel: GradeLevel
}

export type Settings = {
  openRouterKey: string | null
  models: Record<Job, string>
}

// What is actually written: models holds only the jobs changed from the default.
type StoredSettings = {
  openRouterKey?: string | null
  models?: Partial<Record<Job, string>>
}

export type Language = 'es' | 'en'
export const LANGUAGES: Language[] = ['es', 'en']

export type Subject = {
  id: number
  name: string
  language: Language
}

export type SubjectDraft = Omit<Subject, 'id'>

export type Quarter = 1 | 2 | 3 | 4
export const QUARTERS: Quarter[] = [1, 2, 3, 4]

/** A quarter of a school year; schoolYearStart 2026 means 2026–2027 (August–June). */
export type PeriodDraft = {
  schoolYearStart: number
  quarter: Quarter
}

export type Period = PeriodDraft & { id: number }

/** A calendar day, 'YYYY-MM-DD' in local time. */
export type IsoDate = string

type ExamRow = {
  id: number
  subjectId: number
  periodId: number
  examDate: IsoDate | null
}

/** An Exam as the screens see it: with its Subject and Period. */
export type Exam = {
  id: number
  subject: Subject
  period: Period
  examDate: IsoDate | null
}

export type ExamDraft = {
  subjectId: number
  /** Found, or created if this tablet doesn't have it yet. */
  period: PeriodDraft
  examDate: IsoDate | null
}

/** Thrown by createExam: the Subject already has an Exam in that Period. */
export class DuplicateExamError extends Error {
  constructor() {
    super('This Subject already has an Exam in that Period')
    this.name = 'DuplicateExamError'
  }
}

// Singleton records (one Student, one Settings) live in one table, keyed by id.
type SingletonRow =
  | { id: 'student'; value: Student }
  | { id: 'settings'; value: StoredSettings }

class Database extends Dexie {
  singletons!: EntityTable<SingletonRow, 'id'>
  subjects!: EntityTable<Subject, 'id'>
  periods!: EntityTable<Period, 'id'>
  exams!: EntityTable<ExamRow, 'id'>

  constructor(name: string) {
    super(name)
    // Add new tables to this schema until v0 is released; after that, add a
    // new `this.version(n)` instead of editing an old one.
    this.version(1).stores({
      singletons: 'id',
      subjects: '++id',
      periods: '++id, &[schoolYearStart+quarter]',
      exams: '++id, &[subjectId+periodId], subjectId, periodId',
    })
  }
}

export const DEFAULT_DB_NAME = 'comprehensive-exams'

export function createStore(dbName: string = DEFAULT_DB_NAME) {
  const db = new Database(dbName)

  async function readSettings(): Promise<StoredSettings> {
    const row = await db.singletons.get('settings')
    return row?.id === 'settings' ? row.value : {}
  }

  async function withSubjectAndPeriod(rows: ExamRow[]): Promise<Exam[]> {
    const subjects = await db.subjects.bulkGet(rows.map((row) => row.subjectId))
    const periods = await db.periods.bulkGet(rows.map((row) => row.periodId))
    return rows.map((row, i) => ({
      id: row.id,
      subject: subjects[i]!,
      period: periods[i]!,
      examDate: row.examDate,
    }))
  }

  /** Every Period, newest first. */
  async function listPeriods(): Promise<Period[]> {
    const periods = await db.periods.toArray()
    return periods.sort(newestFirst)
  }

  /** The newest Period: the one the home screen shows. */
  async function currentPeriod(): Promise<Period | null> {
    return (await listPeriods())[0] ?? null
  }

  /** A Period's Exams, soonest Exam Date first; undated Exams last. */
  async function periodExams(periodId: number): Promise<Exam[]> {
    const rows = await db.exams.where('periodId').equals(periodId).toArray()
    return (await withSubjectAndPeriod(rows)).sort(soonestFirst)
  }

  async function writeSettings(change: StoredSettings) {
    await db.transaction('rw', db.singletons, async () => {
      const current = await readSettings()
      await db.singletons.put({ id: 'settings', value: { ...current, ...change } })
    })
  }

  return {
    /** The Student, or null before the first-run screen has been completed. */
    async getStudent(): Promise<Student | null> {
      const row = await db.singletons.get('student')
      return row?.id === 'student' ? row.value : null
    },

    async saveStudent(student: Student) {
      await db.singletons.put({ id: 'student', value: student })
    },

    /** Settings with defaults filled in for anything never changed. */
    async getSettings(): Promise<Settings> {
      const stored = await readSettings()
      return {
        openRouterKey: stored.openRouterKey ?? null,
        models: { ...DEFAULT_MODELS, ...stored.models },
      }
    },

    async getOpenRouterKey(): Promise<string | null> {
      return (await readSettings()).openRouterKey ?? null
    },

    /** Stores the key on this device only. An empty key removes it. */
    async saveOpenRouterKey(key: string | null) {
      const trimmed = key?.trim()
      await writeSettings({ openRouterKey: trimmed ? trimmed : null })
    },

    /**
     * Only models that differ from the defaults are stored, so a job the
     * parent never changed follows DEFAULT_MODELS if the defaults change.
     * A blank model means "use the default".
     */
    async saveModels(models: Record<Job, string>) {
      const overrides: Partial<Record<Job, string>> = {}
      for (const job of JOBS) {
        const model = models[job].trim()
        if (model && model !== DEFAULT_MODELS[job]) overrides[job] = model
      }
      await writeSettings({ models: overrides })
    },

    async resetModels() {
      await writeSettings({ models: {} })
    },

    /** Every Subject, by name. */
    async listSubjects(): Promise<Subject[]> {
      const subjects = await db.subjects.toArray()
      return subjects.sort(byName)
    },

    async createSubject(subject: SubjectDraft): Promise<number> {
      return db.subjects.add({ ...subject, name: subject.name.trim() })
    },

    /** Renames a Subject and/or changes its Language. */
    async updateSubject(id: number, change: SubjectDraft) {
      await db.subjects.update(id, { ...change, name: change.name.trim() })
    },

    listPeriods,
    currentPeriod,

    /**
     * Creates an Exam, and its Period if needed. Only one Exam per Subject
     * and Period: a second one throws DuplicateExamError.
     */
    async createExam(exam: ExamDraft): Promise<number> {
      return db.transaction('rw', [db.periods, db.exams], async () => {
        const { schoolYearStart, quarter } = exam.period
        const existing = await db.periods
          .where('[schoolYearStart+quarter]')
          .equals([schoolYearStart, quarter])
          .first()
        const periodId = existing?.id ?? (await db.periods.add({ schoolYearStart, quarter }))
        const duplicate = await db.exams
          .where('[subjectId+periodId]')
          .equals([exam.subjectId, periodId])
          .count()
        if (duplicate) throw new DuplicateExamError()
        return db.exams.add({ subjectId: exam.subjectId, periodId, examDate: exam.examDate })
      })
    },

    /** The Exam, or null if there is none with that id (e.g. it was deleted). */
    async getExam(id: number): Promise<Exam | null> {
      const row = await db.exams.get(id)
      return row ? (await withSubjectAndPeriod([row]))[0] : null
    },

    periodExams,

    /** Sets, changes or (with null) clears the Exam Date. */
    async setExamDate(examId: number, examDate: IsoDate | null) {
      await db.exams.update(examId, { examDate })
    },

    /** The current Period and its Exams, soonest first; null before the first Exam. */
    async currentPeriodExams(): Promise<{ period: Period; exams: Exam[] } | null> {
      const period = await currentPeriod()
      return period ? { period, exams: await periodExams(period.id) } : null
    },

    async close() {
      db.close()
    },
  }
}

export type Store = ReturnType<typeof createStore>

function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, 'es')
}

function newestFirst(a: PeriodDraft, b: PeriodDraft) {
  return b.schoolYearStart - a.schoolYearStart || b.quarter - a.quarter
}

function soonestFirst(a: Exam, b: Exam) {
  if (a.examDate !== b.examDate) {
    if (a.examDate === null) return 1
    if (b.examDate === null) return -1
    return a.examDate < b.examDate ? -1 : 1
  }
  return byName(a.subject, b.subject)
}

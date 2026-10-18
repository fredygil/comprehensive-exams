// Store: the only module that touches IndexedDB (via Dexie).
//
// It speaks in domain terms (getStudent, saveModel, ...) rather than tables.
// Reads are plain async functions, so the UI can wrap them in
// `useLiveQuery(() => store.getStudent())` and re-render when data changes.
import Dexie, { type EntityTable, type Table } from 'dexie'
import type { GatewayErrorKind } from '../gateway/errors'
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
  materialRevision: number
}

/** An Exam as the screens see it: with its Subject and Period. */
export type Exam = {
  id: number
  subject: Subject
  period: Period
  examDate: IsoDate | null
  /**
   * Goes up whenever the Exam's Material changes: added, deleted, or its
   * Recognized Text edited. A Summary built at an older revision is Outdated.
   */
  materialRevision: number
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

/** One file added to an Exam; its Pages hold the scan and the Recognized Text. */
export type Material = {
  id: number
  examId: number
  /** Named after its file by default, e.g. "fracciones" for fracciones.jpg. */
  name: string
  sourceFileName: string
  /** When it was added (ms since the epoch). */
  addedAt: number
}

/** The kinds of file a Page's original can be. */
export type PageMime = 'image/jpeg' | 'image/png'

/** A Page's original scan: its bytes and their type. */
export type PageOriginal = {
  bytes: Uint8Array<ArrayBuffer>
  mime: PageMime
}

/** Where a Page is in being read: unread → reading → read | failed. */
export type PageStatus = 'unread' | 'reading' | 'read' | 'failed'

/** A single scanned page within a Material (its original is read separately, see getPageOriginal). */
export type Page = {
  id: number
  materialId: number
  /** 0-based position in its Material. */
  index: number
  mime: PageMime
  status: PageStatus
  /** Markdown with LaTeX math; null until the Page has been read. */
  recognizedText: string | null
  editedByStudent: boolean
  /** Why the last reading failed (status 'failed'), else null. */
  failure: GatewayErrorKind | null
}

/** A Material to add: its name and its Pages' originals, in order. */
export type MaterialDraft = {
  name: string
  sourceFileName: string
  pages: PageOriginal[]
}

/**
 * The kinds of data stored under an Exam, which go when the Exam (or its
 * Subject) is deleted. Later tickets add theirs here ('summary',
 * 'explainers', 'quizzes', ...), with a line in `examParts` below and its
 * text in `strings.deletion.examParts`.
 */
export type ExamPartKind = 'materials'

/** How much of one kind of data an Exam holds, e.g. { kind: 'materials', count: 3 }. */
export type ExamPartCount = { kind: ExamPartKind; count: number }

/** What deleting an Exam loses: the Exam and everything stored under it. */
export type ExamDeletion = { exam: Exam; parts: ExamPartCount[] }

/** What deleting a Material loses: the Material and its Pages. */
export type MaterialDeletion = { material: Material; pages: number }

/** What deleting a Subject loses: the Subject and each of its Exams, newest Period first. */
export type SubjectDeletion = { subject: Subject; exams: ExamDeletion[] }

type PageOriginalRow = { pageId: number; bytes: ArrayBuffer; mime: PageMime }

// Singleton records (one Student, one Settings) live in one table, keyed by id.
type SingletonRow =
  | { id: 'student'; value: Student }
  | { id: 'settings'; value: StoredSettings }

class Database extends Dexie {
  singletons!: EntityTable<SingletonRow, 'id'>
  subjects!: EntityTable<Subject, 'id'>
  periods!: EntityTable<Period, 'id'>
  exams!: EntityTable<ExamRow, 'id'>
  materials!: EntityTable<Material, 'id'>
  pages!: EntityTable<Page, 'id'>
  // Kept apart from `pages` so listing Pages never loads their scans.
  // Bytes are stored as an ArrayBuffer: fake-indexeddb (tests) drops Blobs.
  pageOriginals!: EntityTable<PageOriginalRow, 'pageId'>

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
    })
  }
}

export const DEFAULT_DB_NAME = 'comprehensive-exams'

export function createStore(dbName: string = DEFAULT_DB_NAME) {
  const db = new Database(dbName)

  // Data stored under an Exam, one entry per ExamPartKind. Each entry names
  // the tables it touches (so deletes run in one transaction), counts what an
  // Exam holds for the confirmation, and deletes it for a set of Exams.
  //
  // Keep each `delete` flat: await Dexie calls directly, not another async
  // helper. Inside a transaction Dexie only follows native `await` one async
  // function deep; deeper, the transaction commits early (PrematureCommitError).
  //
  const examParts: {
    kind: ExamPartKind
    tables: Table[]
    count: (examId: number) => Promise<number>
    delete: (examIds: number[]) => Promise<void>
  }[] = [
    {
      kind: 'materials',
      tables: [db.materials, db.pages, db.pageOriginals],
      count: (examId) => db.materials.where('examId').equals(examId).count(),
      delete: async (examIds) => {
        const materialIds = await db.materials.where('examId').anyOf(examIds).primaryKeys()
        const pageIds = await db.pages.where('materialId').anyOf(materialIds).primaryKeys()
        await db.pageOriginals.bulkDelete(pageIds)
        await db.pages.bulkDelete(pageIds)
        await db.materials.bulkDelete(materialIds)
      },
    },
  ]
  const examPartTables = () => examParts.flatMap((part) => part.tables)

  async function examDeletion(exam: Exam): Promise<ExamDeletion> {
    const parts = await Promise.all(
      examParts.map(async (part) => ({ kind: part.kind, count: await part.count(exam.id) })),
    )
    return { exam, parts: parts.filter((part) => part.count > 0) }
  }

  /** Deletes Exams and everything under them; call inside a transaction over examPartTables(). */
  async function deleteExamsWithParts(examIds: number[]) {
    for (const part of examParts) await part.delete(examIds)
    await db.exams.bulkDelete(examIds)
  }

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
      materialRevision: row.materialRevision,
    }))
  }

  /** The Exam, or null if there is none with that id (e.g. it was deleted). */
  async function getExam(id: number): Promise<Exam | null> {
    const row = await db.exams.get(id)
    return row ? (await withSubjectAndPeriod([row]))[0] : null
  }

  /** Marks the Exam's Material as changed; call inside a transaction that includes db.exams. */
  function bumpMaterialRevision(examId: number) {
    return db.exams.where('id').equals(examId).modify((exam) => {
      exam.materialRevision += 1
    })
  }

  /** The Page, unless the Student has edited it (then reading must leave it alone). */
  function readablePage(pageId: number) {
    return db.pages.where('id').equals(pageId).filter((page) => !page.editedByStudent)
  }

  async function getPage(id: number): Promise<Page | null> {
    return (await db.pages.get(id)) ?? null
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

    /** What deleting this Subject would lose, for the confirmation; null if it doesn't exist. */
    async subjectDeletion(subjectId: number): Promise<SubjectDeletion | null> {
      const subject = await db.subjects.get(subjectId)
      if (!subject) return null
      const rows = await db.exams.where('subjectId').equals(subjectId).toArray()
      const exams = (await withSubjectAndPeriod(rows)).sort((a, b) => newestFirst(a.period, b.period))
      return { subject, exams: await Promise.all(exams.map(examDeletion)) }
    },

    /** Deletes the Subject, all its Exams and everything stored under them. */
    async deleteSubject(subjectId: number) {
      await db.transaction('rw', [db.subjects, db.exams, ...examPartTables()], async () => {
        const examIds = await db.exams.where('subjectId').equals(subjectId).primaryKeys()
        await deleteExamsWithParts(examIds)
        await db.subjects.delete(subjectId)
      })
    },

    /** Renames a Subject and/or changes its Language. */
    async updateSubject(id: number, change: SubjectDraft) {
      await db.subjects.update(id, { ...change, name: change.name.trim() })
    },

    listPeriods,
    currentPeriod,

    /** Every Period before the current one, newest first. */
    async earlierPeriods(): Promise<Period[]> {
      return (await listPeriods()).slice(1)
    },

    async getPeriod(id: number): Promise<Period | null> {
      return (await db.periods.get(id)) ?? null
    },

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
        return db.exams.add({
          subjectId: exam.subjectId,
          periodId,
          examDate: exam.examDate,
          materialRevision: 0,
        })
      })
    },

    getExam,

    periodExams,

    /** What deleting this Exam would lose, for the confirmation; null if it doesn't exist. */
    async examDeletion(examId: number): Promise<ExamDeletion | null> {
      const exam = await getExam(examId)
      return exam ? examDeletion(exam) : null
    },

    /** Deletes the Exam and everything stored under it. */
    async deleteExam(examId: number) {
      await db.transaction('rw', [db.exams, ...examPartTables()], () =>
        deleteExamsWithParts([examId]),
      )
    },

    /** Sets, changes or (with null) clears the Exam Date. */
    async setExamDate(examId: number, examDate: IsoDate | null) {
      await db.exams.update(examId, { examDate })
    },

    /** The current Period and its Exams, soonest first; null before the first Exam. */
    async currentPeriodExams(): Promise<{ period: Period; exams: Exam[] } | null> {
      const period = await currentPeriod()
      return period ? { period, exams: await periodExams(period.id) } : null
    },

    /**
     * Adds Materials to an Exam, in order, each with its Pages unread.
     * Returns their ids. Reading them is the Reading Queue's job.
     */
    async addMaterials(examId: number, drafts: MaterialDraft[]): Promise<number[]> {
      return db.transaction('rw', [db.exams, db.materials, db.pages, db.pageOriginals], async () => {
        const ids: number[] = []
        for (const draft of drafts) {
          const materialId = await db.materials.add({
            examId,
            name: draft.name.trim() || draft.sourceFileName,
            sourceFileName: draft.sourceFileName,
            addedAt: Date.now(),
          })
          for (const [index, original] of draft.pages.entries()) {
            const pageId = await db.pages.add({
              materialId,
              index,
              mime: original.mime,
              status: 'unread',
              recognizedText: null,
              editedByStudent: false,
              failure: null,
            })
            await db.pageOriginals.add({
              pageId,
              bytes: original.bytes.slice().buffer,
              mime: original.mime,
            })
          }
          ids.push(materialId)
        }
        if (ids.length) await bumpMaterialRevision(examId)
        return ids
      })
    },

    /** An Exam's Materials, in the order they were added. */
    async examMaterials(examId: number): Promise<Material[]> {
      const materials = await db.materials.where('examId').equals(examId).toArray()
      return materials.sort((a, b) => a.addedAt - b.addedAt || a.id - b.id)
    },

    /** The Material, or null if there is none with that id (e.g. it was deleted). */
    async getMaterial(id: number): Promise<Material | null> {
      return (await db.materials.get(id)) ?? null
    },

    /** Renames a Material, e.g. to "Unidad 3 – Fracciones". */
    async renameMaterial(id: number, name: string) {
      await db.materials.update(id, { name: name.trim() })
    },

    /** What deleting this Material would lose, for the confirmation; null if it doesn't exist. */
    async materialDeletion(id: number): Promise<MaterialDeletion | null> {
      const material = await db.materials.get(id)
      if (!material) return null
      return { material, pages: await db.pages.where('materialId').equals(id).count() }
    },

    /** Deletes a Material with its Pages and their scans. */
    async deleteMaterial(id: number) {
      await db.transaction('rw', [db.exams, db.materials, db.pages, db.pageOriginals], async () => {
        const material = await db.materials.get(id)
        if (!material) return
        const pageIds = await db.pages.where('materialId').equals(id).primaryKeys()
        await db.pageOriginals.bulkDelete(pageIds)
        await db.pages.bulkDelete(pageIds)
        await db.materials.delete(id)
        await bumpMaterialRevision(material.examId)
      })
    },

    /** A Material's Pages, in order. */
    async materialPages(materialId: number): Promise<Page[]> {
      const pages = await db.pages.where('materialId').equals(materialId).toArray()
      return pages.sort((a, b) => a.index - b.index)
    },

    getPage,

    /** A Page's original scan, or null if the Page is gone. */
    async getPageOriginal(pageId: number): Promise<PageOriginal | null> {
      const row = await db.pageOriginals.get(pageId)
      // Normalize: values read back from fake-indexeddb come from another realm.
      return row ? { bytes: new Uint8Array(row.bytes), mime: row.mime } : null
    },

    /**
     * The Student's correction of a read Page's Recognized Text. From now on
     * it is what every Study Aid and Practice Quiz uses, and reading never
     * overwrites it.
     */
    async editRecognizedText(pageId: number, recognizedText: string) {
      await db.transaction('rw', [db.exams, db.materials, db.pages], async () => {
        const page = await db.pages.get(pageId)
        const material = page && (await db.materials.get(page.materialId))
        if (!material || page.recognizedText === recognizedText) return
        await db.pages.update(pageId, { recognizedText, editedByStudent: true })
        await bumpMaterialRevision(material.examId)
      })
    },

    // Page reading (the Reading Queue). Each is a no-op if the Page is gone,
    // or if the Student has edited it: reading never overwrites her text.

    /** The next Page waiting to be read, oldest first; null when none is. */
    async nextUnreadPage(): Promise<Page | null> {
      return (await db.pages.where('status').equals('unread').first()) ?? null
    },

    async markPageReading(pageId: number) {
      await readablePage(pageId).modify({ status: 'reading', failure: null })
    },

    /** Stores what the reading model read on the Page. */
    async markPageRead(pageId: number, recognizedText: string) {
      await readablePage(pageId).modify({ status: 'read', recognizedText, failure: null })
    },

    async markPageFailed(pageId: number, failure: GatewayErrorKind) {
      await readablePage(pageId).modify({ status: 'failed', failure })
    },

    /** Puts a Page back in line to be read. */
    async markPageUnread(pageId: number) {
      await readablePage(pageId).modify({ status: 'unread', failure: null })
    },

    /** Pages left 'reading' when the app was closed go back to 'unread'. */
    async requeueInterruptedPages() {
      await db.pages.where('status').equals('reading').modify({ status: 'unread' })
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

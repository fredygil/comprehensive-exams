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
export type PageMime = 'image/jpeg' | 'image/png' | 'application/pdf'

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

/** How far reading a Material has got: Pages read and failed, out of all its Pages. */
export type ReadingProgress = { read: number; failed: number; total: number }

export function readingProgress(pages: Pick<Page, 'status'>[]): ReadingProgress {
  return {
    read: pages.filter((page) => page.status === 'read').length,
    failed: pages.filter((page) => page.status === 'failed').length,
    total: pages.length,
  }
}

/** A Material to add: its name and its Pages' originals, in order. */
export type MaterialDraft = {
  name: string
  sourceFileName: string
  pages: PageOriginal[]
}

/** A web page an Explainer was written from. */
export type Source = { url: string; title: string }

/** A deeper, web-sourced explanation of one topic of an Exam. */
export type Explainer = {
  id: number
  examId: number
  topic: string
  /** Markdown with LaTeX math. */
  markdown: string
  /** The web pages it cites, in order, each once. */
  sources: Source[]
  /** When it was generated (ms since the epoch). */
  createdAt: number
}

export type ExplainerDraft = Pick<Explainer, 'topic' | 'markdown' | 'sources'>

/** One multiple-choice item of a Practice Quiz: a prompt with four options, exactly one correct. */
export type Question = {
  id: number
  examId: number
  /** Markdown with math, like every model-written text. */
  prompt: string
  /**
   * Always four, in the order its Practice Quiz shows them (the app shuffled
   * them). A Mistakes Quiz shows them in an order of its own (QuizItem.optionOrder).
   */
  options: string[]
  /** 0-based index into options. */
  correctIndex: number
  /** Why the correct option is right: the Feedback for a wrong answer. */
  explanation: string
  /** The Material it was drawn from; it may since have been deleted. */
  sourceMaterialId: number
  /** That Material's name when the Question was made, so Feedback keeps it. */
  sourceMaterialName: string
  /** Answered wrong in a submitted quiz and not answered right since in a Mistakes Quiz. */
  isMistake: boolean
}

export type QuestionDraft = Omit<Question, 'id' | 'examId' | 'isMistake'>

export type QuizKind = 'practice' | 'mistakes'

/** In Progress → Submitted. */
export type QuizState = 'inProgress' | 'submitted'

/**
 * One Question of a quiz and the Student's answer (null while unanswered).
 * `optionOrder` is the order this quiz shows the Question's options in, as
 * indexes into Question.options (missing: as stored, which is how a Practice
 * Quiz shows them). `chosenIndex` is a position in that shown order.
 */
export type QuizItem = { questionId: number; chosenIndex: number | null; optionOrder?: number[] }

/** A Question of a Mistakes Quiz to store: which one, and the order to show its options in. */
export type MistakesQuizItem = { questionId: number; optionOrder: number[] }

/** A Practice Quiz (or Mistakes Quiz): its Questions, in order, with the Student's answers. */
export type PracticeQuiz = {
  id: number
  examId: number
  kind: QuizKind
  state: QuizState
  items: QuizItem[]
  /** Questions answered correctly; null until Submitted. */
  score: number | null
  /** Some Questions may repeat earlier ones. */
  mayRepeat: boolean
  /** ms since the epoch. */
  createdAt: number
  submittedAt: number | null
  /** The 0-based position of the Question she was on while In Progress, so she resumes there (missing: the first). */
  currentPosition?: number
}

/** A Question's new Mistake status, decided when its quiz is submitted. */
export type MistakeChange = { questionId: number; isMistake: boolean }

/**
 * A quiz with its Questions, in the quiz's order, each as this quiz shows it:
 * options in the item's order, `correctIndex` a position in that order.
 */
export type QuizWithQuestions = { quiz: PracticeQuiz; questions: Question[] }

/** A Material's Recognized Text: its read Pages, in order. */
export type MaterialText = { material: Material; pages: string[] }

/**
 * A study guide of the whole Exam, organized by topic; an Exam has at most
 * one. It remembers what it was built from, so the Store can tell when it is
 * Outdated (see examSummary).
 */
export type Summary = {
  examId: number
  /** Markdown with LaTeX math: one `##` heading per topic. */
  markdown: string
  /** The Exam's material revision when it was built. */
  builtAtRevision: number
  /** The Subject's Language when it was built. */
  builtWithLanguage: Language
  /** The Pages whose Recognized Text it was built from (the read ones). */
  includedPageIds: number[]
  /** When it was generated (ms since the epoch). */
  createdAt: number
}

export type SummaryDraft = Omit<Summary, 'examId' | 'createdAt'>

/** An Exam's Summary and how it stands against the Exam now. */
export type SummaryState = {
  summary: Summary
  /** The Material or the Subject's Language changed since it was built. */
  outdated: boolean
  /** The Exam's Pages it doesn't include (unread, failed, or read later). */
  notIncluded: number
}

/**
 * The kinds of data stored under an Exam, which go when the Exam (or its
 * Subject) is deleted. Later tickets add theirs here ('summary',
 * 'explainers', 'quizzes', ...), with a line in `examParts` below and its
 * text in `strings.deletion.examParts`.
 */
export type ExamPartKind = 'materials' | 'summary' | 'quizzes' | 'explainers'

/** How much of one kind of data an Exam holds, e.g. { kind: 'materials', count: 3 }. */
export type ExamPartCount = { kind: ExamPartKind; count: number }

/** What deleting an Exam loses: the Exam and everything stored under it. */
export type ExamDeletion = { exam: Exam; parts: ExamPartCount[] }

/** What deleting a Material loses: the Material and its Pages. */
export type MaterialDeletion = { material: Material; pages: number }

/** What deleting a Subject loses: the Subject and each of its Exams, newest Period first. */
export type SubjectDeletion = { subject: Subject; exams: ExamDeletion[] }

/**
 * Everything stored on the tablet except the OpenRouter key: every table of
 * the schema, by name, with all its rows as stored (bytes as ArrayBuffers).
 * It is what a backup carries (src/backup/backup.ts).
 */
export type StoreSnapshot = Record<string, object[]>

/** Thrown by replaceAll: the snapshot doesn't hold this Store's tables, or its rows can't be stored. */
export class InvalidSnapshotError extends Error {
  constructor(options?: ErrorOptions) {
    super('Not a snapshot of this Store', options)
    this.name = 'InvalidSnapshotError'
  }
}

/**
 * Which contents of the tablet a slow job (a Summary, Explainer or Practice
 * Quiz being generated) started from: replaceAll starts a new epoch. Writes
 * that take one are dropped if it has changed (see epoch()).
 */
export type StoreEpoch = number

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

export function createStore(dbName: string = DEFAULT_DB_NAME) {
  const db = new Database(dbName)
  // Goes up when replaceAll replaces everything (see StoreEpoch).
  let currentEpoch: StoreEpoch = 0

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
    {
      kind: 'summary',
      tables: [db.summaries],
      count: (examId) => db.summaries.where('examId').equals(examId).count(),
      delete: async (examIds) => {
        await db.summaries.bulkDelete(examIds)
      },
    },
    {
      kind: 'explainers',
      tables: [db.explainers],
      count: (examId) => db.explainers.where('examId').equals(examId).count(),
      delete: async (examIds) => {
        await db.explainers.where('examId').anyOf(examIds).delete()
      },
    },
    {
      kind: 'quizzes',
      tables: [db.quizzes, db.questions],
      count: (examId) => db.quizzes.where('examId').equals(examId).count(),
      delete: async (examIds) => {
        await db.quizzes.where('examId').anyOf(examIds).delete()
        await db.questions.where('examId').anyOf(examIds).delete()
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

  /**
   * May a result started in `startedIn` be stored under the Exam? Not if the
   * Exam was deleted, or everything was replaced, since. Call inside the
   * write's transaction, which must include db.exams.
   */
  async function canStoreUnder(examId: number, startedIn: StoreEpoch): Promise<boolean> {
    return startedIn === currentEpoch && (await db.exams.get(examId)) !== undefined
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

  /** The quiz and its Questions, or null if there is none with that id (e.g. its Exam was deleted). */
  async function getQuiz(quizId: number): Promise<QuizWithQuestions | null> {
    const quiz = await db.quizzes.get(quizId)
    if (!quiz) return null
    const questions = await db.questions.bulkGet(quiz.items.map((item) => item.questionId))
    return { quiz, questions: questions.map((question, i) => asShown(question!, quiz.items[i])) }
  }

  /**
   * Does the snapshot hold exactly this schema's tables, each a list of rows?
   * The table list comes from the schema itself, so a table added later is
   * part of every backup without anyone listing it.
   */
  function isSnapshotOfThisStore(snapshot: unknown): snapshot is StoreSnapshot {
    if (!isRecord(snapshot)) return false
    const names = db.tables.map((table) => table.name)
    const given = Object.keys(snapshot)
    return (
      given.length === names.length &&
      names.every(
        (name) => Array.isArray(snapshot[name]) && (snapshot[name] as unknown[]).every(isRecord),
      )
    )
  }

  async function writeSettings(change: StoredSettings) {
    await db.transaction('rw', db.singletons, async () => {
      const current = await readSettings()
      await db.singletons.put({ id: 'settings', value: { ...current, ...change } })
    })
  }

  return {
    /**
     * The epoch to pass to a write that will happen after a slow job (a model
     * call): take it before the job starts, so a result that comes back after
     * its Exam was deleted, or after a backup replaced everything, is dropped.
     */
    epoch(): StoreEpoch {
      return currentEpoch
    },

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

    /** Reading progress of each of an Exam's Materials, by Material id. */
    async examReadingProgress(examId: number): Promise<Map<number, ReadingProgress>> {
      const materialIds = await db.materials.where('examId').equals(examId).primaryKeys()
      const pages = await db.pages.where('materialId').anyOf(materialIds).toArray()
      return new Map(
        materialIds.map((id) => [id, readingProgress(pages.filter((page) => page.materialId === id))]),
      )
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
      await db.pages
        .where('status')
        .equals('reading')
        .filter((page) => !page.editedByStudent)
        .modify({ status: 'unread' })
    },

    // Explainers. Adding Material never makes them outdated.

    /**
     * Stores a new Explainer for the Exam; returns its id, or null if it was
     * dropped (the Exam is gone, or everything was replaced, since `startedIn`).
     */
    async addExplainer(examId: number, draft: ExplainerDraft, startedIn: StoreEpoch): Promise<number | null> {
      return db.transaction('rw', [db.exams, db.explainers], async () => {
        if (!(await canStoreUnder(examId, startedIn))) return null
        return db.explainers.add({ examId, ...draft, createdAt: Date.now() })
      })
    },

    /** An Exam's Explainers, newest first. */
    async examExplainers(examId: number): Promise<Explainer[]> {
      const explainers = await db.explainers.where('examId').equals(examId).toArray()
      return explainers.sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
    },

    /** The Explainer, or null if there is none with that id (e.g. it was deleted). */
    async getExplainer(id: number): Promise<Explainer | null> {
      return (await db.explainers.get(id)) ?? null
    },

    async deleteExplainer(id: number) {
      await db.explainers.delete(id)
    },

    /** The Recognized Text of an Exam's read Pages, per Material in the order added; Materials with none are left out. */
    async examRecognizedText(examId: number): Promise<MaterialText[]> {
      const materials = await db.materials.where('examId').equals(examId).toArray()
      materials.sort((a, b) => a.addedAt - b.addedAt || a.id - b.id)
      const texts: MaterialText[] = []
      for (const material of materials) {
        const pages = await db.pages.where('materialId').equals(material.id).toArray()
        const read = pages
          .filter((page) => page.status === 'read' && page.recognizedText)
          .sort((a, b) => a.index - b.index)
          .map((page) => page.recognizedText!)
        if (read.length) texts.push({ material, pages: read })
      }
      return texts
    },

    /** The prompts of every Question asked so far on the Exam, oldest first (new quizzes avoid them). */
    async examQuestionPrompts(examId: number): Promise<string[]> {
      const questions = await db.questions.where('examId').equals(examId).sortBy('id')
      return questions.map((question) => question.prompt)
    },

    // Practice Quizzes (the Quiz Maker and the Quiz Session).

    /**
     * Stores new Questions and an In Progress quiz of them, in that order.
     * Returns the quiz id, or null if it was dropped (the Exam is gone, or
     * everything was replaced, since `startedIn`).
     */
    async addPracticeQuiz(
      examId: number,
      questions: QuestionDraft[],
      options: { mayRepeat: boolean; startedIn: StoreEpoch },
    ): Promise<number | null> {
      return db.transaction('rw', [db.exams, db.questions, db.quizzes], async () => {
        if (!(await canStoreUnder(examId, options.startedIn))) return null
        const items: QuizItem[] = []
        for (const question of questions) {
          const questionId = await db.questions.add({ ...question, examId, isMistake: false })
          items.push({ questionId, chosenIndex: null })
        }
        return db.quizzes.add({
          examId,
          kind: 'practice',
          state: 'inProgress',
          items,
          score: null,
          mayRepeat: options.mayRepeat,
          createdAt: Date.now(),
          submittedAt: null,
        })
      })
    },

    /**
     * Stores an In Progress Mistakes Quiz of these existing Questions of the
     * Exam, in this order, each showing its options in its own order.
     * Returns the quiz id.
     */
    async addMistakesQuiz(examId: number, items: MistakesQuizItem[]): Promise<number> {
      return db.quizzes.add({
        examId,
        kind: 'mistakes',
        state: 'inProgress',
        items: items.map(({ questionId, optionOrder }) => ({ questionId, chosenIndex: null, optionOrder })),
        score: null,
        mayRepeat: false,
        createdAt: Date.now(),
        submittedAt: null,
      })
    },

    getQuiz,

    /** The Exam's In Progress quizzes, newest first. */
    async inProgressQuizzes(examId: number): Promise<PracticeQuiz[]> {
      const quizzes = await db.quizzes.where('examId').equals(examId).toArray()
      return quizzes
        .filter((quiz) => quiz.state === 'inProgress')
        .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
    },

    /** The Exam's Submitted quizzes, the most recently submitted first. */
    async submittedQuizzes(examId: number): Promise<PracticeQuiz[]> {
      const quizzes = await db.quizzes.where('examId').equals(examId).toArray()
      return quizzes
        .filter((quiz) => quiz.state === 'submitted')
        .sort((a, b) => b.submittedAt! - a.submittedAt! || b.id - a.id)
    },

    /**
     * Deletes an In Progress quiz, with its Questions that no other quiz
     * lists (a Mistakes Quiz reuses Questions of Submitted quizzes, which stay).
     * A Submitted quiz is never deleted on its own.
     */
    async discardQuiz(quizId: number) {
      await db.transaction('rw', [db.quizzes, db.questions], async () => {
        const quiz = await db.quizzes.get(quizId)
        if (!quiz || quiz.state !== 'inProgress') return
        const others = await db.quizzes.where('examId').equals(quiz.examId).toArray()
        const kept = new Set(
          others.filter((other) => other.id !== quizId).flatMap((other) => other.items.map((item) => item.questionId)),
        )
        await db.quizzes.delete(quizId)
        await db.questions.bulkDelete(quiz.items.map((item) => item.questionId).filter((id) => !kept.has(id)))
      })
    },

    /** Remembers which Question of an In Progress quiz she is on. */
    async moveInQuiz(quizId: number, position: number) {
      await db.transaction('rw', db.quizzes, async () => {
        const quiz = await db.quizzes.get(quizId)
        if (!quiz || quiz.state !== 'inProgress' || !quiz.items[position]) return
        await db.quizzes.update(quizId, { currentPosition: position })
      })
    },

    /** Records (or changes) the answer to the quiz's Question at `position`, while it is In Progress. */
    async answerQuizQuestion(quizId: number, position: number, chosenIndex: number) {
      await db.transaction('rw', db.quizzes, async () => {
        const quiz = await db.quizzes.get(quizId)
        if (!quiz || quiz.state !== 'inProgress' || !quiz.items[position]) return
        const items = quiz.items.map((item, i) => (i === position ? { ...item, chosenIndex } : item))
        await db.quizzes.update(quizId, { items })
      })
    },

    /**
     * Makes an In Progress quiz Submitted with the Score `score` gives its
     * final answers (read in the same transaction, so an answer saved just
     * before counts), and gives its Questions the Mistake status `mistakes`
     * decides from the same answers.
     */
    async submitQuiz(
      quizId: number,
      score: (quiz: QuizWithQuestions) => number,
      mistakes: (quiz: QuizWithQuestions) => MistakeChange[] = () => [],
    ) {
      await db.transaction('rw', [db.quizzes, db.questions], async () => {
        const found = await getQuiz(quizId)
        if (!found || found.quiz.state !== 'inProgress') return
        await db.quizzes.update(quizId, {
          state: 'submitted',
          score: score(found),
          submittedAt: Date.now(),
        })
        for (const { questionId, isMistake } of mistakes(found)) {
          await db.questions.update(questionId, { isMistake })
        }
      })
    },

    /** The Exam's current Mistakes, oldest Question first. */
    async mistakesFor(examId: number): Promise<Question[]> {
      return db.questions
        .where('examId')
        .equals(examId)
        .filter((question) => question.isMistake)
        .sortBy('id')
    },

    // The Summary. It is Outdated when the Exam's material revision or its
    // Subject's Language is no longer what it was built with.

    /**
     * Stores the Exam's Summary, replacing the one it had. Returns false if it
     * was dropped (the Exam is gone, or everything was replaced, since `startedIn`).
     */
    async saveSummary(examId: number, draft: SummaryDraft, startedIn: StoreEpoch): Promise<boolean> {
      return db.transaction('rw', [db.exams, db.summaries], async () => {
        if (!(await canStoreUnder(examId, startedIn))) return false
        await db.summaries.put({ ...draft, examId, createdAt: Date.now() })
        return true
      })
    },

    /** The Exam's Summary and whether it is Outdated; null if it has none. */
    async examSummary(examId: number): Promise<SummaryState | null> {
      const summary = await db.summaries.get(examId)
      const exam = summary && (await getExam(examId))
      if (!summary || !exam) return null
      const materialIds = await db.materials.where('examId').equals(examId).primaryKeys()
      const pageIds = await db.pages.where('materialId').anyOf(materialIds).primaryKeys()
      const included = new Set(summary.includedPageIds)
      return {
        summary,
        outdated:
          summary.builtAtRevision !== exam.materialRevision ||
          summary.builtWithLanguage !== exam.subject.language,
        notIncluded: pageIds.filter((id) => !included.has(id)).length,
      }
    },

    // Backup. Both cover every table in the schema; the OpenRouter key never
    // leaves the tablet (ADR-0001) and is never replaced.

    /** Everything on the tablet, every table as stored, without the OpenRouter key. */
    async exportAll(): Promise<StoreSnapshot> {
      return db.transaction('r', db.tables, async () => {
        const snapshot: StoreSnapshot = {}
        for (const table of db.tables) snapshot[table.name] = await table.toArray()
        snapshot[db.singletons.name] = (snapshot[db.singletons.name] as SingletonRow[]).map(withoutKey)
        return snapshot
      })
    },

    isSnapshotOfThisStore,

    /**
     * Replaces everything on the tablet with the snapshot, in one transaction,
     * keeping this tablet's OpenRouter key. Pages that were being read when it
     * was taken are back in line to be read. It starts a new epoch, so a
     * Study Aid or quiz still being generated is dropped when it comes back. Throws InvalidSnapshotError (and
     * changes nothing) if the snapshot isn't one of this Store or its rows
     * can't be stored.
     */
    async replaceAll(snapshot: StoreSnapshot) {
      if (!isSnapshotOfThisStore(snapshot)) throw new InvalidSnapshotError()
      try {
        await db.transaction('rw', db.tables, async () => {
          currentEpoch += 1
          const { openRouterKey } = await readSettings()
          for (const table of db.tables) await table.clear()
          for (const table of db.tables) await table.bulkAdd(snapshot[table.name])
          await db.pages.where('status').equals('reading').modify({ status: 'unread' })
          const restored = await readSettings()
          await db.singletons.put({
            id: 'settings',
            value: { ...restored, openRouterKey: openRouterKey ?? null },
          })
        })
      } catch (error) {
        // A row with a missing or duplicate key, or a value IndexedDB can't store.
        if (error instanceof Error && STORE_REFUSED.has(error.name)) {
          throw new InvalidSnapshotError({ cause: error })
        }
        throw error
      }
    },

    async close() {
      db.close()
    },
  }
}

export type Store = ReturnType<typeof createStore>

/** Dexie's errors for rows IndexedDB won't store (bad or duplicate keys, uncloneable values). */
const STORE_REFUSED = new Set(['BulkError', 'ConstraintError', 'DataError', 'DataCloneError'])

/** A Question as this quiz item shows it: its options in the item's order. */
function asShown(question: Question, item: QuizItem): Question {
  const order = item.optionOrder
  if (!order) return question
  return {
    ...question,
    options: order.map((index) => question.options[index]),
    correctIndex: order.indexOf(question.correctIndex),
  }
}

/** A singleton row as it goes into a backup: Settings lose the key. */
function withoutKey(row: SingletonRow): SingletonRow {
  if (row.id !== 'settings') return row
  const { openRouterKey: _key, ...value } = row.value
  return { id: 'settings', value }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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

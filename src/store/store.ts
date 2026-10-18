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

/** One multiple-choice item of a Practice Quiz: a prompt with four options, exactly one correct. */
export type Question = {
  id: number
  examId: number
  /** Markdown with math, like every model-written text. */
  prompt: string
  /** Always four, in the order shown (the app shuffled them). */
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

/** One Question of a quiz and the Student's answer (null while unanswered). */
export type QuizItem = { questionId: number; chosenIndex: number | null }

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
}

/** A quiz with its Questions, in the quiz's order. */
export type QuizWithQuestions = { quiz: PracticeQuiz; questions: Question[] }

/** A Material's Recognized Text: its read Pages, in order. */
export type MaterialText = { material: Material; pages: string[] }

/**
 * The kinds of data stored under an Exam, which go when the Exam (or its
 * Subject) is deleted. Later tickets add theirs here ('summary',
 * 'explainers', 'quizzes', ...), with a line in `examParts` below and its
 * text in `strings.deletion.examParts`.
 */
export type ExamPartKind = 'materials' | 'quizzes'

/** How much of one kind of data an Exam holds, e.g. { kind: 'materials', count: 3 }. */
export type ExamPartCount = { kind: ExamPartKind; count: number }

/** What deleting an Exam loses: the Exam and everything stored under it. */
export type ExamDeletion = { exam: Exam; parts: ExamPartCount[] }

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
  questions!: EntityTable<Question, 'id'>
  quizzes!: EntityTable<PracticeQuiz, 'id'>

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
      questions: '++id, examId',
      quizzes: '++id, examId',
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
    }))
  }

  /** The Exam, or null if there is none with that id (e.g. it was deleted). */
  async function getExam(id: number): Promise<Exam | null> {
    const row = await db.exams.get(id)
    return row ? (await withSubjectAndPeriod([row]))[0] : null
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
    return { quiz, questions: questions.map((question) => question!) }
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
        return db.exams.add({ subjectId: exam.subjectId, periodId, examDate: exam.examDate })
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
      return db.transaction('rw', [db.materials, db.pages, db.pageOriginals], async () => {
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

    /** Has at least one of the Exam's Pages been read? (Quizzes and Study Aids need one.) */
    async examHasReadPages(examId: number): Promise<boolean> {
      const materialIds = await db.materials.where('examId').equals(examId).primaryKeys()
      const pages = await db.pages.where('materialId').anyOf(materialIds).toArray()
      return pages.some((page) => page.status === 'read')
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

    // Page reading (the Reading Queue). Each is a no-op if the Page is gone.

    /** The next Page waiting to be read, oldest first; null when none is. */
    async nextUnreadPage(): Promise<Page | null> {
      return (await db.pages.where('status').equals('unread').first()) ?? null
    },

    async markPageReading(pageId: number) {
      await db.pages.update(pageId, { status: 'reading', failure: null })
    },

    /** Stores what the reading model read on the Page. */
    async markPageRead(pageId: number, recognizedText: string) {
      await db.pages.update(pageId, { status: 'read', recognizedText, failure: null })
    },

    async markPageFailed(pageId: number, failure: GatewayErrorKind) {
      await db.pages.update(pageId, { status: 'failed', failure })
    },

    /** Puts a Page back in line to be read. */
    async markPageUnread(pageId: number) {
      await db.pages.update(pageId, { status: 'unread', failure: null })
    },

    /** Pages left 'reading' when the app was closed go back to 'unread'. */
    async requeueInterruptedPages() {
      await db.pages.where('status').equals('reading').modify({ status: 'unread' })
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

    // Practice Quizzes (the Quiz Maker and the Quiz Session).

    /** Stores new Questions and an In Progress quiz of them, in that order. Returns the quiz id. */
    async addPracticeQuiz(
      examId: number,
      questions: QuestionDraft[],
      options: { mayRepeat: boolean },
    ): Promise<number> {
      return db.transaction('rw', [db.questions, db.quizzes], async () => {
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

    getQuiz,

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
     * before counts).
     */
    async submitQuiz(quizId: number, score: (quiz: QuizWithQuestions) => number) {
      await db.transaction('rw', [db.quizzes, db.questions], async () => {
        const found = await getQuiz(quizId)
        if (!found || found.quiz.state !== 'inProgress') return
        await db.quizzes.update(quizId, {
          state: 'submitted',
          score: score(found),
          submittedAt: Date.now(),
        })
      })
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

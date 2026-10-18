// Store: the domain types it speaks in (src/store/store.ts), and the pure
// rules on them that screens and other modules share.
import type { GatewayErrorKind } from '../gateway/errors'
import type { Job } from '../settings/models'

export type GradeLevel = number

export type Student = {
  name: string
  gradeLevel: GradeLevel
}

export type Settings = {
  openRouterKey: string | null
  models: Record<Job, string>
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

/**
 * Has the Page been read, so its Recognized Text goes into quizzes and Study
 * Aids? The one rule for a "read Page" everywhere.
 */
export function isRead(page: Pick<Page, 'status' | 'recognizedText'>): page is Page & { recognizedText: string } {
  return page.status === 'read' && page.recognizedText !== null
}

export function readingProgress(pages: Pick<Page, 'status' | 'recognizedText'>[]): ReadingProgress {
  return {
    read: pages.filter(isRead).length,
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

/** A read Page's Recognized Text. */
export type PageText = { pageId: number; text: string }

/**
 * A Material's Recognized Text, as quizzes and Study Aids use it: its read
 * Pages in order, and how many of its Pages that leaves out (not read yet, or failed).
 */
export type MaterialText = { material: Material; pages: PageText[]; notIncluded: number }

/** The Recognized Text of an Exam's Materials (or some of them), with totals. */
export type ExamText = {
  /** Every Material, in the order added, including those with no read Page yet. */
  materials: MaterialText[]
  /** The read Pages, in order: what a Study Aid made now would include. */
  pageIds: number[]
  readPages: number
  /** Pages left out because they are not read (yet). */
  notIncluded: number
}

/** The totals of these Materials' Recognized Text, e.g. of the ones chosen for a quiz. */
export function examTextOf(materials: MaterialText[]): ExamText {
  const pageIds = materials.flatMap(({ pages }) => pages.map((page) => page.pageId))
  return {
    materials,
    pageIds,
    readPages: pageIds.length,
    notIncluded: materials.reduce((sum, material) => sum + material.notIncluded, 0),
  }
}

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
 * Subject) is deleted. A new kind needs its ExamPart (src/store/db.ts) in
 * the file of the Store that keeps it, listed in createStore's `examParts`,
 * and its text in `strings.deletion.examParts`.
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

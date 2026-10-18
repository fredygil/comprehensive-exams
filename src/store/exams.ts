// Store: Subjects, Periods and Exams, and deleting an Exam (or a Subject)
// with everything stored under it (its ExamParts).
import type { Database, ExamPart, ExamRow, StoreContext } from './db'
import {
  DuplicateExamError,
  type Exam,
  type ExamDeletion,
  type ExamDraft,
  type IsoDate,
  type Period,
  type PeriodDraft,
  type Subject,
  type SubjectDeletion,
  type SubjectDraft,
} from './types'

async function withSubjectAndPeriod(db: Database, rows: ExamRow[]): Promise<Exam[]> {
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
export async function getExam(db: Database, id: number): Promise<Exam | null> {
  const row = await db.exams.get(id)
  return row ? (await withSubjectAndPeriod(db, [row]))[0] : null
}

/** `examParts`: every kind of data stored under an Exam, in the order confirmations list them. */
export function examsStore({ db }: StoreContext, examParts: ExamPart[]) {
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
    return (await withSubjectAndPeriod(db, rows)).sort(soonestFirst)
  }

  return {
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
      const exams = (await withSubjectAndPeriod(db, rows)).sort((a, b) => newestFirst(a.period, b.period))
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

    getExam: (id: number) => getExam(db, id),

    periodExams,

    /** What deleting this Exam would lose, for the confirmation; null if it doesn't exist. */
    async examDeletion(examId: number): Promise<ExamDeletion | null> {
      const exam = await getExam(db, examId)
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
  }
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

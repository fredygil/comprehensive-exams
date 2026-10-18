// Store: an Exam's Study Aids, its Summary and its Explainers.
import { canStoreUnder, type ExamPart, type StoreContext } from './db'
import { getExam } from './exams'
import type { Explainer, ExplainerDraft, StoreEpoch, SummaryDraft, SummaryState } from './types'

export function studyAidsStore(context: StoreContext) {
  const { db } = context

  /** An Exam's Summary (at most one). */
  const summaryPart: ExamPart = {
    kind: 'summary',
    tables: [db.summaries],
    count: (examId) => db.summaries.where('examId').equals(examId).count(),
    delete: async (examIds) => {
      await db.summaries.bulkDelete(examIds)
    },
  }

  /** An Exam's Explainers. */
  const explainersPart: ExamPart = {
    kind: 'explainers',
    tables: [db.explainers],
    count: (examId) => db.explainers.where('examId').equals(examId).count(),
    delete: async (examIds) => {
      await db.explainers.where('examId').anyOf(examIds).delete()
    },
  }

  return {
    summaryPart,
    explainersPart,
    store: {
      // The Summary. It is Outdated when the Exam's material revision or its
      // Subject's Language is no longer what it was built with.

      /**
       * Stores the Exam's Summary, replacing the one it had. Returns false if it
       * was dropped (the Exam is gone, or everything was replaced, since `startedIn`).
       */
      async saveSummary(examId: number, draft: SummaryDraft, startedIn: StoreEpoch): Promise<boolean> {
        return db.transaction('rw', [db.exams, db.summaries], async () => {
          if (!(await canStoreUnder(context, examId, startedIn))) return false
          await db.summaries.put({ ...draft, examId, createdAt: Date.now() })
          return true
        })
      },

      /** The Exam's Summary and whether it is Outdated; null if it has none. */
      async examSummary(examId: number): Promise<SummaryState | null> {
        const summary = await db.summaries.get(examId)
        const exam = summary && (await getExam(db, examId))
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

      // Explainers. Adding Material never makes them outdated.

      /**
       * Stores a new Explainer for the Exam; returns its id, or null if it was
       * dropped (the Exam is gone, or everything was replaced, since `startedIn`).
       */
      async addExplainer(examId: number, draft: ExplainerDraft, startedIn: StoreEpoch): Promise<number | null> {
        return db.transaction('rw', [db.exams, db.explainers], async () => {
          if (!(await canStoreUnder(context, examId, startedIn))) return null
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
    },
  }
}

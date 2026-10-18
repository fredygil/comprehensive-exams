// Store: an Exam's Material and its Pages: adding, correcting and deleting
// them, Page reading (the Reading Queue), and the Recognized Text quizzes and
// Study Aids are made from.
import type { GatewayErrorKind } from '../gateway/errors'
import type { ExamPart, StoreContext } from './db'
import {
  examTextOf,
  isRead,
  readingProgress,
  type ExamText,
  type Material,
  type MaterialDeletion,
  type MaterialDraft,
  type MaterialText,
  type Page,
  type PageOriginal,
  type ReadingProgress,
} from './types'

export function materialStore({ db }: StoreContext) {
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

  /** An Exam's Materials, in the order they were added. */
  async function examMaterials(examId: number): Promise<Material[]> {
    const materials = await db.materials.where('examId').equals(examId).toArray()
    return materials.sort((a, b) => a.addedAt - b.addedAt || a.id - b.id)
  }

  /** A Material's Pages, in order. */
  async function materialPages(materialId: number): Promise<Page[]> {
    const pages = await db.pages.where('materialId').equals(materialId).toArray()
    return pages.sort((a, b) => a.index - b.index)
  }

  /** An Exam's Material: the Materials with their Pages and scans. */
  const examPart: ExamPart = {
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
  }

  return {
    examPart,
    store: {
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

      examMaterials,

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

      materialPages,

      async getPage(id: number): Promise<Page | null> {
        return (await db.pages.get(id)) ?? null
      },

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

      /**
       * The Recognized Text of the Exam's read Pages, Material by Material in
       * the order added (only `materialIds`, if given): what quizzes and Study
       * Aids are made from, and how many Pages they would leave out.
       */
      async examText(examId: number, materialIds?: number[]): Promise<ExamText> {
        const texts: MaterialText[] = []
        for (const material of await examMaterials(examId)) {
          if (materialIds && !materialIds.includes(material.id)) continue
          const pages = await materialPages(material.id)
          const read = pages.filter(isRead)
          texts.push({
            material,
            pages: read.map((page) => ({ pageId: page.id, text: page.recognizedText })),
            notIncluded: pages.length - read.length,
          })
        }
        return examTextOf(texts)
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
    },
  }
}

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

// Singleton records (one Student, one Settings) live in one table, keyed by id.
type SingletonRow =
  | { id: 'student'; value: Student }
  | { id: 'settings'; value: StoredSettings }

class Database extends Dexie {
  singletons!: EntityTable<SingletonRow, 'id'>
  subjects!: EntityTable<Subject, 'id'>

  constructor(name: string) {
    super(name)
    // Add new tables to this schema until v0 is released; after that, add a
    // new `this.version(n)` instead of editing an old one.
    this.version(1).stores({
      singletons: 'id',
      subjects: '++id',
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

    async close() {
      db.close()
    },
  }
}

export type Store = ReturnType<typeof createStore>

function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, 'es')
}

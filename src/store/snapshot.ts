// Store: everything on the tablet at once, for a backup (src/backup/backup.ts).
// Both directions cover every table in the schema; the OpenRouter key never
// leaves the tablet (ADR-0001) and is never replaced.
import type { SingletonRow, StoreContext } from './db'
import { readSettings } from './settings'
import { InvalidSnapshotError, type StoreSnapshot } from './types'

export function snapshotStore({ db, epoch }: StoreContext) {
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

  return {
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
     * Study Aid or quiz still being generated is dropped when it comes back.
     * Throws InvalidSnapshotError (and changes nothing) if the snapshot isn't
     * one of this Store or its rows can't be stored.
     */
    async replaceAll(snapshot: StoreSnapshot) {
      if (!isSnapshotOfThisStore(snapshot)) throw new InvalidSnapshotError()
      try {
        await db.transaction('rw', db.tables, async () => {
          epoch.current += 1
          const { openRouterKey } = await readSettings(db)
          for (const table of db.tables) await table.clear()
          for (const table of db.tables) await table.bulkAdd(snapshot[table.name])
          await db.pages.where('status').equals('reading').modify({ status: 'unread' })
          const restored = await readSettings(db)
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
  }
}

/** Dexie's errors for rows IndexedDB won't store (bad or duplicate keys, uncloneable values). */
const STORE_REFUSED = new Set(['BulkError', 'ConstraintError', 'DataError', 'DataCloneError'])

/** A singleton row as it goes into a backup: Settings lose the key. */
function withoutKey(row: SingletonRow): SingletonRow {
  if (row.id !== 'settings') return row
  const { openRouterKey: _key, ...value } = row.value
  return { id: 'settings', value }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

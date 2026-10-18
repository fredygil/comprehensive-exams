// Backup: everything on the tablet in one file, and back.
//
//   const file = await backup.exportAll()      // a File to save (e.g. to Drive)
//   const contents = await backup.read(file)   // checks it; throws InvalidBackupError
//   await backup.importAll(contents)           // replaces everything, keeps the key
//
// The file is versioned. It holds every table of the Store (the Store derives
// the list from its schema) and every scan, but never the OpenRouter key
// (ADR-0001). Its layout is one line of JSON, the header, then the bytes of
// every scan back to back:
//
//   {"format":"mis-examenes-backup","version":1,"exportedAt":...,"tables":{...}}\n<bytes><bytes>...
//
// In `tables`, each ArrayBuffer of a row is replaced by {"$bytes":[offset,length]}
// into the bytes after the header. Scans stay binary: no base64, and no single
// string as large as all of them, which a tablet may not manage.
//
// When the Store's schema changes, bump BACKUP_VERSION and convert files of
// the older versions in `read`, so earlier backups still restore.
import { toIsoDate } from '../exams/calendar'
import type { ReadingQueue } from '../readingQueue/readingQueue'
import { InvalidSnapshotError, type Store, type StoreSnapshot } from '../store/store'
import { InvalidBackupError } from './errors'

export { InvalidBackupError, type InvalidBackupReason } from './errors'

export const BACKUP_FORMAT = 'mis-examenes-backup'
export const BACKUP_VERSION = 1

/** A backup file that has been read and checked, ready to import. */
export type BackupContents = {
  /** When it was exported (ms since the epoch). */
  exportedAt: number
  snapshot: StoreSnapshot
}

type Header = { format: string; version: number; exportedAt: number; tables: StoreSnapshot }

const NEWLINE = 0x0a

export function createBackup({ store, readingQueue }: { store: Store; readingQueue: Pick<ReadingQueue, 'start' | 'stop'> }) {
  return {
    /** Everything on the tablet as one file, named after today, e.g. "mis-examenes-2026-10-18.backup". */
    async exportAll(): Promise<File> {
      const exportedAt = Date.now()
      const tables = await store.exportAll()
      const parts: ArrayBuffer[] = []
      let offset = 0
      const header = JSON.stringify(
        { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, tables } satisfies Header,
        (_key, value: unknown) => {
          if (!isArrayBuffer(value)) return value
          parts.push(value)
          offset += value.byteLength
          return { $bytes: [offset - value.byteLength, value.byteLength] }
        },
      )
      const name = `mis-examenes-${toIsoDate(new Date(exportedAt))}.backup`
      return new File([header, '\n', ...parts.map((part) => new Uint8Array(part))], name, { type: 'application/octet-stream' })
    },

    /** Reads and checks a backup file, changing nothing. */
    async read(file: Blob): Promise<BackupContents> {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const end = bytes.indexOf(NEWLINE)
      if (end < 0) throw new InvalidBackupError('notABackup')
      const body = bytes.subarray(end + 1)
      let header: unknown
      try {
        header = JSON.parse(new TextDecoder().decode(bytes.subarray(0, end)), (_key, value: unknown) =>
          isBytesRef(value) ? bytesAt(body, value.$bytes) : value,
        )
      } catch (error) {
        throw new InvalidBackupError('notABackup', { cause: error })
      }
      if (!isRecord(header) || header.format !== BACKUP_FORMAT) throw new InvalidBackupError('notABackup')
      const { version, exportedAt, tables } = header
      if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
        throw new InvalidBackupError('notABackup')
      }
      if (version > BACKUP_VERSION) throw new InvalidBackupError('newerVersion')
      if (typeof exportedAt !== 'number' || !store.isSnapshotOfThisStore(tables)) {
        throw new InvalidBackupError('notABackup')
      }
      return { exportedAt, snapshot: tables }
    },

    /**
     * Replaces everything on the tablet with the backup; the OpenRouter key
     * already here stays. Reading stops first (so no Page is written after
     * the replace) and picks up the backup's unread Pages afterwards.
     */
    async importAll(contents: BackupContents) {
      await readingQueue.stop()
      try {
        await store.replaceAll(contents.snapshot)
      } catch (error) {
        if (error instanceof InvalidSnapshotError) throw new InvalidBackupError('notABackup', { cause: error })
        throw error
      } finally {
        readingQueue.start()
      }
    },
  }
}

export type Backup = ReturnType<typeof createBackup>

// Values read back from IndexedDB come from another realm in tests, so no instanceof.
function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBytesRef(value: unknown): value is { $bytes: [number, number] } {
  return isRecord(value) && Array.isArray(value.$bytes)
}

function bytesAt(body: Uint8Array, [offset, length]: [number, number]): ArrayBuffer {
  const valid =
    Number.isInteger(offset) && Number.isInteger(length) && offset >= 0 && length >= 0 && offset + length <= body.length
  if (!valid) throw new Error('Bytes outside the file')
  return body.slice(offset, offset + length).buffer
}

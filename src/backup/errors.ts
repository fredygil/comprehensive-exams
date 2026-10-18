// Kept apart from backup.ts (and free of DOM code) because strings.ts, which
// vite.config.ts imports, needs the reasons.

/** Why a file can't be imported: it isn't a backup, or a newer app made it. */
export type InvalidBackupReason = 'notABackup' | 'newerVersion'

/** Thrown when reading or importing a file that isn't a backup this app can restore. */
export class InvalidBackupError extends Error {
  readonly reason: InvalidBackupReason
  constructor(reason: InvalidBackupReason, options?: ErrorOptions) {
    super(`Invalid backup: ${reason}`, options)
    this.name = 'InvalidBackupError'
    this.reason = reason
  }
}

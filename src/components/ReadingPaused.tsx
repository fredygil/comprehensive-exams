// "La lectura de páginas está en pausa": shown while the Reading Queue is
// paused by a problem the Student (or a parent) has to fix first.
//
//   {readingPaused(pause) && <ReadingPausedNotice reason={pause} />}
import { useSyncExternalStore } from 'react'
import { useServices } from '../app/services'
import type { PauseReason } from '../readingQueue/readingQueue'
import { strings } from '../strings'

/** Why reading is paused right now, or null while it isn't. */
export function useReadingPause(): PauseReason | null {
  const { readingQueue } = useServices()
  return useSyncExternalStore(readingQueue.subscribe, readingQueue.pause)
}

/**
 * Is it paused for a reason this notice explains? With no key, the screens
 * show <NeedsKeyNotice /> instead.
 */
export function readingPaused(
  reason: PauseReason | null,
): reason is Exclude<PauseReason, 'NoKey'> {
  return reason !== null && reason !== 'NoKey'
}

/** The pause, its cause in Spanish, and "Reintentar". */
export function ReadingPausedNotice({ reason }: { reason: PauseReason }) {
  const { readingQueue } = useServices()
  const text = strings.material.paused
  return (
    <div role="alert" className="notice">
      <p>
        {text.message} {strings.errors[reason]}
      </p>
      <button type="button" onClick={() => readingQueue.start()}>
        {text.retry}
      </button>
    </div>
  )
}

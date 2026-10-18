// "La lectura de páginas está en pausa": shown while the Reading Queue is
// paused by a problem the Student (or a parent) has to fix first.
//
//   <ReadingPausedNotice />           renders nothing unless reading is paused
//   const pause = useReadingPause()   to show it instead of something else
import { useSyncExternalStore } from 'react'
import { useServices } from '../app/services'
import type { PauseReason } from '../readingQueue/readingQueue'
import { strings } from '../strings'

/**
 * Why reading is paused right now, or null while it isn't. A pause for want
 * of a key is left to <NeedsKeyNotice /> (see NeedsKey.tsx), so it is null.
 */
export function useReadingPause(): Exclude<PauseReason, 'NoKey'> | null {
  const { readingQueue } = useServices()
  const pause = useSyncExternalStore(readingQueue.subscribe, readingQueue.pause)
  return pause === 'NoKey' ? null : pause
}

/** The pause, its cause in Spanish, and "Reintentar". */
export function ReadingPausedNotice() {
  const { readingQueue } = useServices()
  const pause = useReadingPause()
  const text = strings.material.paused
  if (!pause) return null
  return (
    <div role="alert" className="notice">
      <p>
        {text.message} {strings.errors[pause]}
      </p>
      <button type="button" onClick={() => readingQueue.start()}>
        {text.retry}
      </button>
    </div>
  )
}

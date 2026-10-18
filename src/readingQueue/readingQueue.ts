// Reading Queue: reads unread Pages one at a time through the Model Gateway
// and records each Page's status in the Store (unread → reading → read |
// failed). The screens show the Pages as the Store has them, plus whether
// reading is paused (`pause()` / `subscribe()`), and call `start()` /
// `retry(pageId)`.
//
// <App> starts it on launch and stops it when it closes; adding Material,
// saving a key or coming back online starts it again. A Page left 'reading'
// by a closed app goes back to 'unread' on the first start.
//
// A busy or unavailable model is retried with backoff, then the Page is
// marked failed and the queue moves on. A problem no Page can get past (no
// key, offline, invalid key, no credit) puts the Page back in line and
// pauses the whole queue until start() is called again.
import { GatewayError, type GatewayErrorKind } from '../gateway/errors'
import type { ModelGateway } from '../gateway/gateway'
import { readPagePrompt } from '../prompts/readPage'
import type { Page, Store } from '../store/store'

/** How long to wait before each retry of a busy (RateLimited) or unavailable model. */
export const RETRY_DELAYS_MS = [2_000, 5_000, 15_000]

/** Busy or down for now: the same Page, sent again a little later, may well be read. */
const RETRYABLE: ReadonlySet<GatewayErrorKind> = new Set(['RateLimited', 'Unavailable'])

export type ReadingQueueOptions = {
  store: Store
  gateway: Pick<ModelGateway, 'readPage'>
  /** Waits before a retry; tests make it instant. Defaults to setTimeout. */
  wait?: (ms: number) => Promise<void>
}

/** Why reading is paused: every Page would fail the same way until this is fixed. */
export type PauseReason = Extract<GatewayErrorKind, 'NoKey' | 'Offline' | 'InvalidKey' | 'NoCredit'>

const PAUSES: ReadonlySet<GatewayErrorKind> = new Set<PauseReason>([
  'NoKey',
  'Offline',
  'InvalidKey',
  'NoCredit',
])

const isPause = (kind: GatewayErrorKind): kind is PauseReason => PAUSES.has(kind)

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createReadingQueue({ store, gateway, wait = sleep }: ReadingQueueOptions) {
  let running: Promise<void> | null = null
  /** Set by start(): there may be new unread Pages. */
  let wanted = false
  let stopped = false
  let requeued = false
  let paused: PauseReason | null = null
  const listeners = new Set<() => void>()

  function setPaused(reason: PauseReason | null) {
    if (paused === reason) return
    paused = reason
    for (const listener of listeners) listener()
  }

  /** Asks the model, retrying with backoff while it is busy or down. */
  async function readWithRetries(request: Parameters<ModelGateway['readPage']>[0]) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await gateway.readPage(request)
      } catch (error) {
        const delay = RETRY_DELAYS_MS[attempt]
        const retryable = error instanceof GatewayError && RETRYABLE.has(error.kind)
        if (!retryable || delay === undefined || stopped) throw error
        await wait(delay)
        if (stopped) throw error
      }
    }
  }

  /** Reads one Page. Returns why reading must pause, or null to go on. */
  async function read(page: Page): Promise<PauseReason | null> {
    await store.markPageReading(page.id)
    try {
      const material = await store.getMaterial(page.materialId)
      const exam = material && (await store.getExam(material.examId))
      const student = await store.getStudent()
      const original = await store.getPageOriginal(page.id)
      // Deleted while waiting in line: nothing to read.
      if (!exam || !student || !original) return null
      const prompt = readPagePrompt({
        language: exam.subject.language,
        gradeLevel: student.gradeLevel,
      })
      const text = await readWithRetries({ prompt, original })
      await store.markPageRead(page.id, text)
      return null
    } catch (error) {
      // Closing: the next launch requeues the Page.
      if (stopped) return null
      const kind: GatewayErrorKind = error instanceof GatewayError ? error.kind : 'BadResponse'
      if (isPause(kind)) {
        // Not this Page's fault: it waits in line until reading resumes.
        await store.markPageUnread(page.id)
        return kind
      }
      await store.markPageFailed(page.id, kind)
      return null
    }
  }

  async function run() {
    if (!requeued) {
      requeued = true
      await store.requeueInterruptedPages()
    }
    while (wanted && !stopped) {
      wanted = false
      for (
        let page = await store.nextUnreadPage();
        page && !stopped;
        page = await store.nextUnreadPage()
      ) {
        const pause = await read(page)
        if (!pause) continue
        // start() came while that Page was out (e.g. a key was saved): try again.
        if (wanted) break
        setPaused(pause)
        return
      }
    }
  }

  /** Reads every unread Page, in order, unless it is already doing so. Ends a pause. */
  function start() {
    stopped = false
    wanted = true
    setPaused(null)
    running ??= run()
      .catch((error: unknown) => {
        // Closing the app closes the Store under a Page being read.
        if (!stopped) console.error('Reading Queue stopped:', error)
      })
      .finally(() => {
        running = null
        // start() was called while the last loop was finishing.
        if (wanted && !stopped) start()
      })
  }

  return {
    start,

    /** Reads a failed Page again ("Reintentar"), in line with the others. */
    async retry(pageId: number) {
      await store.markPageUnread(pageId)
      start()
    },

    /** Why reading is paused, or null while it isn't. */
    pause: (): PauseReason | null => paused,

    /** Calls `listener` whenever the pause starts or ends; returns the unsubscribe. */
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    /** Stops after the Page being read (the app is closing). */
    stop() {
      stopped = true
    },
  }
}

export type ReadingQueue = ReturnType<typeof createReadingQueue>

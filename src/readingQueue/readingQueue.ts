// Reading Queue: reads unread Pages one at a time through the Model Gateway
// and records each Page's status in the Store (unread → reading → read |
// failed). The screens show whatever the Store says, so they never talk to
// the queue except to `start()` it.
//
// <App> starts it on launch and stops it when it closes; adding Material
// starts it again. A Page left 'reading' by a closed app goes back to
// 'unread' on the first start.
import { GatewayError, type GatewayErrorKind } from '../gateway/errors'
import type { ModelGateway } from '../gateway/gateway'
import { readPagePrompt } from '../prompts/readPage'
import type { Page, Store } from '../store/store'

export type ReadingQueueOptions = {
  store: Store
  gateway: Pick<ModelGateway, 'readPage'>
}

export function createReadingQueue({ store, gateway }: ReadingQueueOptions) {
  let running: Promise<void> | null = null
  /** Set by start(): there may be new unread Pages. */
  let wanted = false
  let stopped = false
  let requeued = false

  /** Reads one Page. Returns false when reading should stop (e.g. no key). */
  async function read(page: Page): Promise<boolean> {
    await store.markPageReading(page.id)
    try {
      const material = await store.getMaterial(page.materialId)
      const exam = material && (await store.getExam(material.examId))
      const student = await store.getStudent()
      const original = await store.getPageOriginal(page.id)
      // Deleted while waiting in line: nothing to read.
      if (!exam || !student || !original) return true
      const prompt = readPagePrompt({
        language: exam.subject.language,
        gradeLevel: student.gradeLevel,
      })
      const text = await gateway.readPage({ prompt, original })
      await store.markPageRead(page.id, text)
      return true
    } catch (error) {
      if (stopped) return false
      const kind: GatewayErrorKind = error instanceof GatewayError ? error.kind : 'BadResponse'
      if (kind === 'NoKey') {
        // Nothing was sent: leave it in line for when a key is saved.
        await store.markPageUnread(page.id)
        return false
      }
      await store.markPageFailed(page.id, kind)
      return true
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
        if (!(await read(page))) return
      }
    }
  }

  /** Reads every unread Page, in order, unless it is already doing so. */
  function start() {
    stopped = false
    wanted = true
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

    /** Stops after the Page being read (the app is closing). */
    stop() {
      stopped = true
    },
  }
}

export type ReadingQueue = ReturnType<typeof createReadingQueue>

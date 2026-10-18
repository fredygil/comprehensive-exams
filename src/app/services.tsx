// The app's connections to the outside world, created once per launch and
// handed to <App>. Tests create them against a fake database (see
// tests/harness/renderApp.tsx); main.tsx creates the real ones.
import { createContext, useContext } from 'react'
import { createBackup, type Backup } from '../backup/backup'
import { createModelGateway, type ModelGateway } from '../gateway/gateway'
import { createQuizMaker, type QuizMaker } from '../quizMaker/quizMaker'
import { createQuizSession, type QuizSession } from '../quizSession/quizSession'
import { createReadingQueue, type ReadingQueue } from '../readingQueue/readingQueue'
import { createStore, type Store } from '../store/store'
import { APP_TITLE, APP_URL } from './config'
import { downloadFile } from './downloadFile'

export type AppServices = {
  store: Store
  gateway: ModelGateway
  /** Reads unread Pages in the background; <App> starts it on launch. */
  readingQueue: ReadingQueue
  /** Makes Practice Quizzes. */
  quizMaker: QuizMaker
  /** Answers and submits Practice Quizzes. */
  quizSession: QuizSession
  /** Exports everything to one file and imports it back. */
  backup: Backup
  /** Hands a file to the tablet to keep (a download), e.g. an exported backup. */
  saveFile: (file: File) => void
}

export type AppServicesOptions = {
  dbName?: string
  /** How the Reading Queue waits before retrying a busy model (tests make it instant). */
  wait?: (ms: number) => Promise<void>
  /** How a file is handed to the tablet; a download by default (tests keep the files). */
  saveFile?: (file: File) => void
}

export function createAppServices(options: AppServicesOptions = {}): AppServices {
  const store = createStore(options.dbName)
  const gateway = createModelGateway({
    getKey: () => store.getOpenRouterKey(),
    getModel: async (job) => (await store.getSettings()).models[job],
    appUrl: APP_URL,
    appTitle: APP_TITLE,
  })
  const readingQueue = createReadingQueue({ store, gateway, wait: options.wait })
  const quizMaker = createQuizMaker({ store, gateway })
  const quizSession = createQuizSession({ store })
  const backup = createBackup({ store, readingQueue })
  const saveFile = options.saveFile ?? downloadFile
  return { store, gateway, readingQueue, quizMaker, quizSession, backup, saveFile }
}

export const ServicesContext = createContext<AppServices | null>(null)

export function useServices(): AppServices {
  const services = useContext(ServicesContext)
  if (!services) throw new Error('useServices() needs <App services={...}>')
  return services
}

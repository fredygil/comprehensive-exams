// The app's connections to the outside world, created once per launch and
// handed to <App>. Tests create them against a fake database (see
// tests/harness/renderApp.tsx); main.tsx creates the real ones.
import { createContext, useContext } from 'react'
import { createModelGateway, type ModelGateway } from '../gateway/gateway'
import { createReadingQueue, type ReadingQueue } from '../readingQueue/readingQueue'
import { createStore, type Store } from '../store/store'
import { APP_TITLE, APP_URL } from './config'

export type AppServices = {
  store: Store
  gateway: ModelGateway
  /** Reads unread Pages in the background; <App> starts it on launch. */
  readingQueue: ReadingQueue
}

export type AppServicesOptions = {
  dbName?: string
  /** How the Reading Queue waits before retrying a busy model (tests make it instant). */
  wait?: (ms: number) => Promise<void>
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
  return { store, gateway, readingQueue }
}

export const ServicesContext = createContext<AppServices | null>(null)

export function useServices(): AppServices {
  const services = useContext(ServicesContext)
  if (!services) throw new Error('useServices() needs <App services={...}>')
  return services
}

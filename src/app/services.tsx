// The app's connections to the outside world, created once per launch and
// handed to <App>. Tests create them against a fake database (see
// tests/harness/renderApp.tsx); main.tsx creates the real ones.
import { createContext, useContext } from 'react'
import { createModelGateway, type ModelGateway } from '../gateway/gateway'
import { createStore, type Store } from '../store/store'
import { APP_TITLE, APP_URL } from './config'

export type AppServices = {
  store: Store
  gateway: ModelGateway
}

export function createAppServices(options: { dbName?: string } = {}): AppServices {
  const store = createStore(options.dbName)
  const gateway = createModelGateway({
    getKey: () => store.getOpenRouterKey(),
    appUrl: APP_URL,
    appTitle: APP_TITLE,
  })
  return { store, gateway }
}

export const ServicesContext = createContext<AppServices | null>(null)

export function useServices(): AppServices {
  const services = useContext(ServicesContext)
  if (!services) throw new Error('useServices() needs <App services={...}>')
  return services
}

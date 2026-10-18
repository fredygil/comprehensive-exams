// The app's connections to the outside world, created once per launch and
// handed to <App>. Tests create them against a fake database (see
// tests/harness/renderApp.tsx); main.tsx creates the real ones.
import { createContext, useContext } from 'react'
import { createStore, type Store } from '../store/store'

export type AppServices = {
  store: Store
}

export function createAppServices(options: { dbName?: string } = {}): AppServices {
  const store = createStore(options.dbName)
  return { store }
}

export const ServicesContext = createContext<AppServices | null>(null)

export function useServices(): AppServices {
  const services = useContext(ServicesContext)
  if (!services) throw new Error('useServices() needs <App services={...}>')
  return services
}

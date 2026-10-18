import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { createAppServices } from './app/services'
import './styles.css'

// The service worker (offline app shell) is registered by vite-plugin-pwa,
// see vite.config.ts.
const services = createAppServices()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
)

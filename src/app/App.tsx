import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { FirstRunScreen } from '../screens/FirstRunScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { SettingsScreen } from '../screens/settings/SettingsScreen'
import { Layout } from './Layout'
import { requestPersistentStorage } from './persistentStorage'
import { ServicesContext, useServices, type AppServices } from './services'

// Hash routing: GitHub Pages serves only index.html, so every screen lives
// after the `#` (e.g. .../comprehensive-exams/#/ajustes).
export function App({ services }: { services: AppServices }) {
  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  return (
    <ServicesContext.Provider value={services}>
      <HashRouter>
        <Screens />
      </HashRouter>
    </ServicesContext.Provider>
  )
}

function Screens() {
  const { store } = useServices()
  // undefined while loading, null when the first-run screen is still needed.
  const student = useLiveQuery(() => store.getStudent(), [store])

  if (student === undefined) return null
  if (student === null) return <FirstRunScreen />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomeScreen student={student} />} />
        <Route path="ajustes" element={<SettingsScreen student={student} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

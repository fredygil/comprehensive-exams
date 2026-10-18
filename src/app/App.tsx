import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { requestPersistentStorage } from './persistentStorage'
import { HashRouter, Route, Routes } from 'react-router'
import { FirstRunScreen } from '../screens/FirstRunScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { ServicesContext, useServices, type AppServices } from './services'

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
      <Route path="*" element={<HomeScreen student={student} />} />
    </Routes>
  )
}

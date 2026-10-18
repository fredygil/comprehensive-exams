import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { ExamScreen } from '../screens/exams/ExamScreen'
import { ExplainerScreen } from '../screens/explainers/ExplainerScreen'
import { NewExamScreen } from '../screens/exams/NewExamScreen'
import { MaterialScreen } from '../screens/material/MaterialScreen'
import { FirstRunScreen } from '../screens/FirstRunScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { PeriodScreen } from '../screens/PeriodScreen'
import { QuizScreen } from '../screens/quiz/QuizScreen'
import { SettingsScreen } from '../screens/settings/SettingsScreen'
import { SubjectsScreen } from '../screens/subjects/SubjectsScreen'
import { Layout } from './Layout'
import { requestPersistentStorage } from './persistentStorage'
import { ServicesContext, useServices, type AppServices } from './services'

// Hash routing: GitHub Pages serves only index.html, so every screen lives
// after the `#` (e.g. .../comprehensive-exams/#/ajustes).
export function App({ services }: { services: AppServices }) {
  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  // Read any Pages still unread, from this launch until the app closes, and
  // pick up again when the tablet comes back online.
  useEffect(() => {
    const { readingQueue } = services
    const resume = () => readingQueue.start()
    readingQueue.start()
    window.addEventListener('online', resume)
    return () => {
      window.removeEventListener('online', resume)
      readingQueue.stop()
    }
  }, [services])

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
        <Route path="materias" element={<SubjectsScreen />} />
        <Route path="examenes/nuevo" element={<NewExamScreen />} />
        <Route path="examenes/:examId" element={<ExamScreen />} />
        <Route path="examenes/:examId/material/:materialId" element={<MaterialScreen />} />
        <Route path="examenes/:examId/explicaciones/:explainerId" element={<ExplainerScreen />} />
        <Route path="examenes/:examId/quiz/:quizId" element={<QuizScreen />} />
        <Route path="periodos/:periodId" element={<PeriodScreen />} />
        <Route path="ajustes" element={<SettingsScreen student={student} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

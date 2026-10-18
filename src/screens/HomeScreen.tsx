import { useState } from 'react'
import { NeedsKeyNotice, useHasKey } from '../components/NeedsKey'
import type { Student } from '../store/store'
import { strings } from '../strings'

export function HomeScreen({ student }: { student: Student }) {
  const hasKey = useHasKey()
  const [hour] = useState(() => new Date().getHours())

  // Render the screen whole once loaded, so its heading means it is ready.
  if (hasKey === undefined) return null

  return (
    <main className="screen">
      <h1>{strings.home.greeting(student.name, hour)}</h1>
      {!hasKey && <NeedsKeyNotice />}
    </main>
  )
}

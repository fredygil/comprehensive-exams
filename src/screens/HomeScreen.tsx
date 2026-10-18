import type { Student } from '../store/store'
import { strings } from '../strings'

export function HomeScreen({ student }: { student: Student }) {
  return (
    <main className="screen">
      <h1>{strings.home.greeting(student.name, new Date().getHours())}</h1>
    </main>
  )
}

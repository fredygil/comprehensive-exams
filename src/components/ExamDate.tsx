import { useState } from 'react'
import { daysUntil } from '../exams/calendar'
import type { IsoDate } from '../store/store'
import { strings } from '../strings'

/** "Miércoles, 21 de octubre · en 3 días", or "Sin fecha". */
export function ExamDate({ date, className }: { date: IsoDate | null; className?: string }) {
  const [today] = useState(() => new Date())
  const text = strings.exams.date
  return (
    <span className={className}>
      {date ? `${text.day(date)} · ${text.countdown(daysUntil(date, today))}` : text.none}
    </span>
  )
}

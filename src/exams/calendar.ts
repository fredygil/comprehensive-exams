// Calendar rules for Periods and Exam Dates, in local time. "Now" always comes
// from `new Date()`, so tests drive it with the fake clock.
import type { IsoDate } from '../store/store'

/** The school year (August–June) a day falls in, by its starting year: 2027-03-10 → 2026. */
export function schoolYearOf(day: Date): number {
  const august = 7
  return day.getMonth() >= august ? day.getFullYear() : day.getFullYear() - 1
}

/** A local day as 'YYYY-MM-DD'. */
export function toIsoDate(day: Date): IsoDate {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

/** Whole calendar days from `today` until `date`: 0 today, 1 tomorrow, -1 yesterday. */
export function daysUntil(date: IsoDate, today: Date): number {
  const [year, month, day] = date.split('-').map(Number)
  const target = Date.UTC(year, month - 1, day)
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((target - start) / 86_400_000)
}

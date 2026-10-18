// Fake clock. Only `Date` is faked: timers (setTimeout etc.) stay real so
// user-event, MSW, Dexie and Testing Library's waitFor keep working without
// manual advancing. setup.ts restores the real clock after each test.
import { vi } from 'vitest'

/** Freeze "now" at the given local date-time, e.g. setClock('2026-10-18T09:00'). */
export function setClock(now: string | Date) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(typeof now === 'string' ? new Date(now) : now)
}

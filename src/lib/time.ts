import type { EntityName, TimeEntry } from '@/types/db'

// Payroll week runs Monday..Sunday in local time.
// weekStart returns Monday 00:00; weekEnd returns the following Monday 00:00
// (exclusive upper bound so range filters are simple).
export function weekStart(d = new Date()): Date {
  const start = new Date(d)
  start.setHours(0, 0, 0, 0)
  const dow = start.getDay() // 0 = Sun, 1 = Mon, ... 6 = Sat
  const offset = dow === 0 ? 6 : dow - 1 // days back to Monday
  start.setDate(start.getDate() - offset)
  return start
}

export function weekEnd(d = new Date()): Date {
  const end = weekStart(d)
  end.setDate(end.getDate() + 7)
  return end
}

export function startOfDay(d = new Date()): Date {
  const s = new Date(d)
  s.setHours(0, 0, 0, 0)
  return s
}

export function endOfDay(d = new Date()): Date {
  const e = new Date(d)
  e.setHours(23, 59, 59, 999)
  return e
}

export function entryHours(e: Pick<TimeEntry, 'clock_in' | 'clock_out' | 'break_minutes'>): number {
  if (!e.clock_out) return 0
  const ms = new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()
  const mins = Math.max(0, ms / 60000 - e.break_minutes)
  return mins / 60
}

// Hours accrued in an active (not yet clocked out) session as of `now`.
// Accounts for completed break time plus any currently-open break.
export function activeSessionHours(
  session: { clock_in: string; break_start: string | null; break_minutes: number },
  now: number = Date.now(),
): number {
  const clockInMs = new Date(session.clock_in).getTime()
  const elapsedMs = now - clockInMs
  const currentBreakMs = session.break_start
    ? Math.max(0, now - new Date(session.break_start).getTime())
    : 0
  const workedMs = elapsedMs - session.break_minutes * 60_000 - currentBreakMs
  return Math.max(0, workedMs) / 3_600_000
}

export function fmtHours(h: number): string {
  return h.toFixed(2)
}

export function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function fmtElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export function sumByEntity(entries: TimeEntry[]): Record<EntityName, number> {
  const totals: Record<EntityName, number> = { Corporate: 0, Plano: 0, Dallas: 0 }
  for (const e of entries) totals[e.entity] += entryHours(e)
  return totals
}

export function toDateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Sunday of the Mon..Sun payroll week containing `d`, formatted yyyy-mm-dd.
// Used as the canonical week_ending_date in weekly_approvals.
export function weekEndingDate(d = new Date()): string {
  const end = weekEnd(d)
  end.setDate(end.getDate() - 1)
  return toDateOnly(end)
}

// Inclusive Sunday at end of the payroll week (for display/filename use).
export function weekEndingDateObj(d = new Date()): Date {
  const end = weekEnd(d)
  end.setDate(end.getDate() - 1)
  return end
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

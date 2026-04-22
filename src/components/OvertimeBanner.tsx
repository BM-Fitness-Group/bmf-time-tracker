import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { activeSessionHours, fmtHours, sumByEntity } from '@/lib/time'
import type { ActiveSession, TimeEntry } from '@/types/db'

const OVERTIME_THRESHOLD = 40
const APPROACHING_THRESHOLD = 38

type Props = {
  entries: TimeEntry[]
  activeSession: ActiveSession | null
}

export default function OvertimeBanner({ entries, activeSession }: Props) {
  const [now, setNow] = useState(Date.now())

  // Tick once a minute — overtime changes slowly. No ticker when idle.
  useEffect(() => {
    if (!activeSession) return
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [activeSession])

  const totalHours = useMemo(() => {
    const byEntity = sumByEntity(entries)
    const completed = byEntity.Corporate + byEntity.Plano + byEntity.Dallas
    const active = activeSession ? activeSessionHours(activeSession, now) : 0
    return completed + active
  }, [entries, activeSession, now])

  if (totalHours < APPROACHING_THRESHOLD) return null

  const over = totalHours >= OVERTIME_THRESHOLD

  return (
    <div
      className={`mb-4 border rounded-lg p-3 text-xs flex items-start gap-2 ${
        over
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : 'border-zinc-200 bg-zinc-50 text-zinc-700'
      }`}
      role={over ? 'alert' : undefined}
    >
      <AlertTriangle
        className={`w-4 h-4 shrink-0 mt-0.5 ${over ? 'text-amber-600' : 'text-zinc-500'}`}
      />
      <div>
        <div className="font-bold">
          {over
            ? "You've hit overtime this week"
            : 'Approaching overtime this week'}
        </div>
        <div className="text-[11px] opacity-80 mt-0.5">
          {fmtHours(totalHours)}h accrued · {over ? 'over' : 'approaching'} the{' '}
          {OVERTIME_THRESHOLD}h threshold
        </div>
      </div>
    </div>
  )
}

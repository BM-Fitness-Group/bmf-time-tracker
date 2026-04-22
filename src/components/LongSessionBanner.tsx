import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import type { ActiveSession } from '@/types/db'

const WARN_HOURS = 10
const CAP_HOURS = 14

type Props = { session: ActiveSession | null }

export default function LongSessionBanner({ session }: Props) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!session) return
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [session])

  if (!session) return null

  const elapsedHours =
    (now - new Date(session.clock_in).getTime()) / 3_600_000
  if (elapsedHours < WARN_HOURS) return null

  const nearCap = elapsedHours >= CAP_HOURS - 1

  return (
    <div
      className={`mb-4 border rounded-lg p-3 text-xs flex items-start gap-2 ${
        nearCap
          ? 'border-red-300 bg-red-50 text-red-900'
          : 'border-amber-300 bg-amber-50 text-amber-900'
      }`}
      role="alert"
    >
      <AlertCircle
        className={`w-4 h-4 shrink-0 mt-0.5 ${
          nearCap ? 'text-red-700' : 'text-amber-600'
        }`}
      />
      <div>
        <div className="font-bold">
          {nearCap ? 'Session will auto-close soon' : 'Did you forget to clock out?'}
        </div>
        <div className="text-[11px] opacity-80 mt-0.5">
          Clocked in {elapsedHours.toFixed(1)}h ago. The system auto-closes
          sessions at {CAP_HOURS}h and flags them for admin review.
        </div>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Activity } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtClock, fmtElapsed } from '@/lib/time'
import type { ActiveSession, EntityName } from '@/types/db'

type Row = ActiveSession & {
  employee: { id: string; full_name: string; email: string }
}

const ENTITY_DOT: Record<EntityName, string> = {
  Corporate: 'bg-zinc-600',
  Plano: 'bg-orange-500',
  Dallas: 'bg-sky-600',
}

export default function Live() {
  const [rows, setRows] = useState<Row[]>([])
  const [now, setNow] = useState(Date.now())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('active_sessions')
      .select('*, employee:employees(id, full_name, email)')
    if (!error && data) setRows(data as unknown as Row[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const ch = supabase
      .channel('admin-active-sessions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_sessions' },
        () => void load(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [load])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-black tracking-tighter">On The Clock</h2>
          <div className="text-xs text-zinc-500 mt-1">
            Realtime view — updates as employees clock in/out
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.3em] text-zinc-500">
          <Activity className="w-3 h-3" />
          {rows.length} ACTIVE
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-zinc-500 text-sm shadow-sm">
          Nobody is clocked in right now.
        </div>
      ) : (
        <ul className="grid gap-2">
          {rows.map(r => {
            const clockedInMs = now - new Date(r.clock_in).getTime()
            const onBreak = !!r.break_start
            const currentBreakMs = onBreak
              ? now - new Date(r.break_start!).getTime()
              : 0
            const workedMs = clockedInMs - r.break_minutes * 60_000 - currentBreakMs
            return (
              <li
                key={r.employee_id}
                className="bg-white border border-zinc-200 rounded-xl p-4 flex items-center gap-4 shadow-sm"
              >
                <div
                  className={`w-3 h-3 rounded-full ${ENTITY_DOT[r.entity]} shrink-0`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{r.employee?.full_name}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    {r.entity} · Clocked in {fmtClock(r.clock_in)}
                    {onBreak && ' · ON BREAK'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black tabular-nums">
                    {fmtElapsed(Math.max(0, workedMs))}
                  </div>
                  {onBreak ? (
                    <div className="text-[10px] font-bold tracking-[0.2em] text-amber-600 tabular-nums">
                      BREAK {fmtElapsed(currentBreakMs)}
                    </div>
                  ) : r.break_minutes > 0 ? (
                    <div className="text-[10px] tracking-widest text-zinc-500">
                      {r.break_minutes}m break
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

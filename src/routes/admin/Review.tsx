import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Lock, Trash2, Undo2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthContext'
import {
  entryHours,
  fmtClock,
  fmtDate,
  fmtHours,
  sumByEntity,
  toDateOnly,
  weekEnd,
  weekStart,
} from '@/lib/time'
import type { Employee, EntityName, TimeEntry } from '@/types/db'

const ENTITIES: EntityName[] = ['Corporate', 'Plano', 'Dallas']

const ENTITY_DOT: Record<EntityName, string> = {
  Corporate: 'bg-zinc-600',
  Plano: 'bg-orange-500',
  Dallas: 'bg-sky-600',
}

export default function Review() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [weekDate, setWeekDate] = useState(new Date())
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [approvedAt, setApprovedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const { employee: me } = useAuth()

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
      const list = data ?? []
      setEmployees(list)
      if (list.length > 0 && !selectedId) setSelectedId(list[0].id)
    }
    void load()
  }, [selectedId])

  const weekEndIso = useMemo(() => toDateOnly(weekEndSunday(weekDate)), [weekDate])
  const weekStartDate = useMemo(() => weekStart(weekDate), [weekDate])
  const weekEndDate = useMemo(() => weekEnd(weekDate), [weekDate])

  const loadWeek = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    setErr(null)
    const [entRes, appRes] = await Promise.all([
      supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', selectedId)
        .gte('clock_in', weekStartDate.toISOString())
        .lt('clock_in', weekEndDate.toISOString())
        .order('clock_in', { ascending: true }),
      supabase
        .from('weekly_approvals')
        .select('approved_at')
        .eq('employee_id', selectedId)
        .eq('week_ending_date', weekEndIso)
        .maybeSingle(),
    ])
    if (entRes.error) setErr(entRes.error.message)
    else setEntries(entRes.data ?? [])
    setApprovedAt(appRes.data?.approved_at ?? null)
    setLoading(false)
  }, [selectedId, weekStartDate, weekEndDate, weekEndIso])

  useEffect(() => {
    void loadWeek()
  }, [loadWeek])

  const totals = useMemo(() => sumByEntity(entries), [entries])
  const grandTotal = totals.Corporate + totals.Plano + totals.Dallas

  const updateEntry = async (
    id: string,
    patch: Partial<Pick<TimeEntry, 'entity' | 'clock_in' | 'clock_out' | 'break_minutes' | 'notes'>>,
  ) => {
    const before = entries.find(e => e.id === id)
    if (!before) return
    const { data, error } = await supabase
      .from('time_entries')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) {
      setErr(error.message)
      return
    }
    setEntries(prev => prev.map(e => (e.id === id ? data : e)))
    await logAudit(me?.id, 'update_entry', id, { before, after: data })
  }

  const deleteEntry = async (id: string) => {
    const target = entries.find(e => e.id === id)
    if (!target) return
    const { error } = await supabase.from('time_entries').delete().eq('id', id)
    if (error) {
      setErr(error.message)
      return
    }
    setEntries(prev => prev.filter(e => e.id !== id))
    await logAudit(me?.id, 'delete_entry', id, target)
  }

  const approveWeek = async () => {
    if (!selectedId || !me) return
    const breakdown: Record<EntityName, number> = {
      Corporate: totals.Corporate,
      Plano: totals.Plano,
      Dallas: totals.Dallas,
    }
    // Lock entries first, then record the approval row.
    const { error: lockErr } = await supabase
      .from('time_entries')
      .update({ is_approved: true })
      .eq('employee_id', selectedId)
      .gte('clock_in', weekStartDate.toISOString())
      .lt('clock_in', weekEndDate.toISOString())
    if (lockErr) {
      setErr(lockErr.message)
      return
    }
    const { error: appErr } = await supabase.from('weekly_approvals').upsert(
      {
        employee_id: selectedId,
        week_ending_date: weekEndIso,
        approved_by: me.id,
        approved_at: new Date().toISOString(),
        total_hours: Number(grandTotal.toFixed(2)),
        entity_breakdown: breakdown,
      },
      { onConflict: 'employee_id,week_ending_date' },
    )
    if (appErr) {
      setErr(appErr.message)
      return
    }
    await logAudit(me.id, 'approve_week', selectedId, {
      week_ending: weekEndIso,
      total_hours: grandTotal,
    })
    await loadWeek()
  }

  const revertWeek = async () => {
    if (!selectedId || !me) return
    const { error: unlockErr } = await supabase
      .from('time_entries')
      .update({ is_approved: false })
      .eq('employee_id', selectedId)
      .gte('clock_in', weekStartDate.toISOString())
      .lt('clock_in', weekEndDate.toISOString())
    if (unlockErr) {
      setErr(unlockErr.message)
      return
    }
    const { error: delErr } = await supabase
      .from('weekly_approvals')
      .delete()
      .eq('employee_id', selectedId)
      .eq('week_ending_date', weekEndIso)
    if (delErr) {
      setErr(delErr.message)
      return
    }
    await logAudit(me.id, 'revert_approval', selectedId, { week_ending: weekEndIso })
    await loadWeek()
  }

  const shiftWeek = (delta: number) => {
    setWeekDate(prev => {
      const next = new Date(prev)
      next.setDate(next.getDate() + delta * 7)
      return next
    })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-black tracking-tighter">Weekly Review</h2>
          <div className="text-xs text-zinc-500 mt-1">
            Edit entries and approve the week
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedId ?? ''}
            onChange={e => setSelectedId(e.target.value || null)}
            className="bg-white border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
          >
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button
              onClick={() => shiftWeek(-1)}
              className="p-2 border border-zinc-300 rounded hover:border-zinc-500 hover:bg-zinc-50"
              aria-label="previous week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-xs tracking-widest text-zinc-600 px-2 tabular-nums">
              {fmtDate(weekStartDate.toISOString())} – {fmtDate(
                new Date(weekEndDate.getTime() - 1).toISOString(),
              )}
            </div>
            <button
              onClick={() => shiftWeek(1)}
              className="p-2 border border-zinc-300 rounded hover:border-zinc-500 hover:bg-zinc-50"
              aria-label="next week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {err && (
        <div className="mb-4 border border-red-300 bg-red-50 rounded-lg p-3 text-xs text-red-800">
          {err}
        </div>
      )}

      <div className="bg-white border border-zinc-200 shadow-sm rounded-xl overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-[10px] font-bold tracking-[0.3em] text-zinc-500">
            <tr>
              <th className="text-left p-3">DAY</th>
              <th className="text-left p-3">ENTITY</th>
              <th className="text-left p-3">IN</th>
              <th className="text-left p-3">OUT</th>
              <th className="text-left p-3">BREAK</th>
              <th className="text-right p-3">HRS</th>
              <th className="text-left p-3 hidden md:table-cell">NOTES</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="p-4 text-zinc-500 text-center text-sm">
                  Loading…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-zinc-500 text-center text-sm">
                  No entries for this week.
                </td>
              </tr>
            ) : (
              entries.map(e => (
                <EntryEditRow
                  key={e.id}
                  entry={e}
                  locked={!!approvedAt}
                  onUpdate={updateEntry}
                  onDelete={deleteEntry}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-zinc-200 shadow-sm rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-500">
            TOTALS
          </div>
          <div className="text-2xl font-black tabular-nums">
            {fmtHours(grandTotal)}h
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {ENTITIES.map(name => (
            <div key={name} className="bg-zinc-50 border border-zinc-200 rounded p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${ENTITY_DOT[name]}`} />
                <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-500">
                  {name.toUpperCase()}
                </span>
              </div>
              <div className="text-lg font-black tabular-nums">
                {fmtHours(totals[name])}h
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        {approvedAt ? (
          <>
            <div className="flex items-center gap-2 text-xs text-green-700">
              <Lock className="w-3 h-3" />
              APPROVED {new Date(approvedAt).toLocaleString()}
            </div>
            <button
              onClick={revertWeek}
              className="border border-zinc-300 rounded-lg px-4 py-2 text-xs font-bold tracking-widest hover:border-zinc-500 hover:bg-zinc-50 flex items-center gap-2"
            >
              <Undo2 className="w-3 h-3" />
              REVERT APPROVAL
            </button>
          </>
        ) : (
          <>
            <div className="text-xs text-zinc-500">
              Approving locks these entries for the employee.
            </div>
            <button
              onClick={approveWeek}
              disabled={entries.length === 0}
              className="bg-red-800 hover:bg-red-900 text-white font-black px-4 py-3 rounded-lg text-xs tracking-widest flex items-center gap-2 disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              <Check className="w-4 h-4" />
              APPROVE WEEK
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function EntryEditRow({
  entry,
  locked,
  onUpdate,
  onDelete,
}: {
  entry: TimeEntry
  locked: boolean
  onUpdate: (id: string, patch: Partial<TimeEntry>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    entity: entry.entity,
    clock_in: toLocalInput(entry.clock_in),
    clock_out: entry.clock_out ? toLocalInput(entry.clock_out) : '',
    break_minutes: entry.break_minutes,
    notes: entry.notes,
  })

  const dayLabel = new Date(entry.clock_in).toLocaleDateString([], {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
  })

  const save = async () => {
    const ci = new Date(form.clock_in)
    const co = form.clock_out ? new Date(form.clock_out) : null
    if (co && co.getTime() <= ci.getTime()) return
    await onUpdate(entry.id, {
      entity: form.entity,
      clock_in: ci.toISOString(),
      clock_out: co ? co.toISOString() : null,
      break_minutes: form.break_minutes,
      notes: form.notes,
    })
    setEditing(false)
  }

  const hrs = entryHours(entry)

  if (editing && !locked) {
    return (
      <tr className="border-t border-zinc-200 bg-red-50/40">
        <td className="p-2 text-xs text-zinc-500">{dayLabel}</td>
        <td className="p-2">
          <select
            value={form.entity}
            onChange={e => setForm(f => ({ ...f, entity: e.target.value as EntityName }))}
            className="bg-white border border-zinc-300 rounded px-2 py-1 text-xs"
          >
            {ENTITIES.map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </td>
        <td className="p-2">
          <input
            type="datetime-local"
            value={form.clock_in}
            onChange={e => setForm(f => ({ ...f, clock_in: e.target.value }))}
            className="bg-white border border-zinc-300 rounded px-2 py-1 text-xs w-[155px]"
          />
        </td>
        <td className="p-2">
          <input
            type="datetime-local"
            value={form.clock_out}
            onChange={e => setForm(f => ({ ...f, clock_out: e.target.value }))}
            className="bg-white border border-zinc-300 rounded px-2 py-1 text-xs w-[155px]"
          />
        </td>
        <td className="p-2">
          <input
            type="number"
            min={0}
            value={form.break_minutes}
            onChange={e =>
              setForm(f => ({ ...f, break_minutes: parseInt(e.target.value || '0', 10) }))
            }
            className="bg-white border border-zinc-300 rounded px-2 py-1 text-xs w-16"
          />
        </td>
        <td className="p-2 text-right text-xs text-zinc-500 tabular-nums">—</td>
        <td className="p-2 hidden md:table-cell">
          <input
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="bg-white border border-zinc-300 rounded px-2 py-1 text-xs w-full"
          />
        </td>
        <td className="p-2 whitespace-nowrap">
          <button
            onClick={() => setEditing(false)}
            className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 hover:text-red-800 mr-2"
          >
            CANCEL
          </button>
          <button
            onClick={save}
            className="text-[10px] font-bold tracking-[0.2em] text-red-800 hover:text-red-900"
          >
            SAVE
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-t border-zinc-200">
      <td className="p-3 text-xs text-zinc-600 whitespace-nowrap">{dayLabel}</td>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${ENTITY_DOT[entry.entity]}`} />
          <span className="text-xs">{entry.entity}</span>
          {entry.is_manual && (
            <span className="text-[9px] tracking-widest text-zinc-600">M</span>
          )}
        </div>
      </td>
      <td className="p-3 text-xs tabular-nums">{fmtClock(entry.clock_in)}</td>
      <td className="p-3 text-xs tabular-nums">
        {entry.clock_out ? fmtClock(entry.clock_out) : '—'}
      </td>
      <td className="p-3 text-xs tabular-nums">{entry.break_minutes}m</td>
      <td className="p-3 text-right text-sm font-black tabular-nums">
        {fmtHours(hrs)}
      </td>
      <td className="p-3 text-xs text-zinc-500 hidden md:table-cell truncate max-w-[180px]">
        {entry.notes || '—'}
      </td>
      <td className="p-3 whitespace-nowrap text-right">
        {locked ? (
          <Lock className="w-3 h-3 text-green-700 inline" />
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 hover:text-red-800 mr-3"
            >
              EDIT
            </button>
            <button
              onClick={() => onDelete(entry.id)}
              className="text-zinc-500 hover:text-red-700"
              aria-label="delete entry"
            >
              <Trash2 className="w-3 h-3 inline" />
            </button>
          </>
        )}
      </td>
    </tr>
  )
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

function weekEndSunday(d: Date): Date {
  const start = weekStart(d)
  const sun = new Date(start)
  sun.setDate(sun.getDate() + 6)
  return sun
}

async function logAudit(
  actorId: string | undefined,
  action: string,
  targetId: string,
  details: unknown,
) {
  if (!actorId) return
  await supabase.from('audit_log').insert({
    actor_id: actorId,
    action,
    target_type: 'time_entry',
    target_id: targetId,
    details: details as Record<string, unknown>,
  })
}

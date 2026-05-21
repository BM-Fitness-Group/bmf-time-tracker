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
import { categoryNamesFor } from '@/lib/categories'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { Employee, EntityName, TimeEntry } from '@/types/db'

const ENTITIES: EntityName[] = ['Corporate', 'Plano', 'Dallas']

const ENTITY_DOT: Record<EntityName, string> = {
  Corporate: 'bg-zinc-600',
  Plano: 'bg-orange-500',
  Dallas: 'bg-sky-600',
}

// Sentinel for the "Everyone" option in the employee dropdown.
const ALL = '__all__'

export default function Review() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedId, setSelectedId] = useState<string>(ALL)
  const [weekDate, setWeekDate] = useState(new Date())
  const [entries, setEntries] = useState<TimeEntry[]>([])
  // employee_id -> approved_at, only for approved weeks.
  const [approvals, setApprovals] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<TimeEntry | null>(null)
  const { employee: me } = useAuth()

  const isEveryone = selectedId === ALL

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
      setEmployees(data ?? [])
    }
    void load()
  }, [])

  const employeesById = useMemo(() => {
    const m: Record<string, Employee> = {}
    for (const e of employees) m[e.id] = e
    return m
  }, [employees])

  const weekEndIso = useMemo(() => toDateOnly(weekEndSunday(weekDate)), [weekDate])
  const weekStartDate = useMemo(() => weekStart(weekDate), [weekDate])
  const weekEndDate = useMemo(() => weekEnd(weekDate), [weekDate])

  const loadWeek = useCallback(async () => {
    setLoading(true)
    setErr(null)
    let entryQuery = supabase
      .from('time_entries')
      .select('*')
      .is('deleted_at', null)
      .gte('clock_in', weekStartDate.toISOString())
      .lt('clock_in', weekEndDate.toISOString())
      .order('clock_in', { ascending: true })
    let approvalQuery = supabase
      .from('weekly_approvals')
      .select('employee_id, approved_at')
      .eq('week_ending_date', weekEndIso)

    if (selectedId !== ALL) {
      entryQuery = entryQuery.eq('employee_id', selectedId)
      approvalQuery = approvalQuery.eq('employee_id', selectedId)
    }

    const [entRes, appRes] = await Promise.all([entryQuery, approvalQuery])
    if (entRes.error) setErr(entRes.error.message)
    else setEntries(entRes.data ?? [])

    const appMap: Record<string, string> = {}
    for (const row of appRes.data ?? []) {
      if (row.approved_at) appMap[row.employee_id] = row.approved_at
    }
    setApprovals(appMap)
    setLoading(false)
  }, [selectedId, weekStartDate, weekEndDate, weekEndIso])

  useEffect(() => {
    void loadWeek()
  }, [loadWeek])

  // Entries grouped by employee — used for per-employee approval rollups.
  const entriesByEmployee = useMemo(() => {
    const m = new Map<string, TimeEntry[]>()
    for (const e of entries) {
      const list = m.get(e.employee_id) ?? []
      list.push(e)
      m.set(e.employee_id, list)
    }
    return m
  }, [entries])

  // Sort for display: in Everyone mode by employee name then time;
  // single mode just by time (already sorted from the query).
  const sortedEntries = useMemo(() => {
    if (!isEveryone) return entries
    return [...entries].sort((a, b) => {
      const an = employeesById[a.employee_id]?.full_name ?? ''
      const bn = employeesById[b.employee_id]?.full_name ?? ''
      if (an !== bn) return an.localeCompare(bn)
      return new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime()
    })
  }, [entries, isEveryone, employeesById])

  const totals = useMemo(() => sumByEntity(entries), [entries])
  const grandTotal = totals.Corporate + totals.Plano + totals.Dallas

  // Approval status across the loaded set.
  const employeesWithEntries = useMemo(
    () => Array.from(entriesByEmployee.keys()),
    [entriesByEmployee],
  )
  const approvedCount = employeesWithEntries.filter(id => approvals[id]).length
  const pendingCount = employeesWithEntries.length - approvedCount

  const updateEntry = async (
    id: string,
    patch: Partial<
      Pick<TimeEntry, 'entity' | 'category' | 'clock_in' | 'clock_out' | 'break_minutes' | 'notes'>
    >,
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

  // Soft delete — stamp deleted_at. Recoverable from the admin Trash page.
  const deleteEntry = async (id: string) => {
    const target = entries.find(e => e.id === id)
    if (!target) return
    const { error } = await supabase
      .from('time_entries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      setErr(error.message)
      return
    }
    setEntries(prev => prev.filter(e => e.id !== id))
    await logAudit(me?.id, 'delete_entry', id, { ...target, soft_delete: true })
  }

  // Approve a single employee's week. Returns an error string or null.
  const approveOne = async (employeeId: string): Promise<string | null> => {
    if (!me) return 'Not signed in'
    const empEntries = entriesByEmployee.get(employeeId) ?? []
    if (empEntries.length === 0) return null
    const t = sumByEntity(empEntries)
    const grand = t.Corporate + t.Plano + t.Dallas
    const { error: lockErr } = await supabase
      .from('time_entries')
      .update({ is_approved: true })
      .eq('employee_id', employeeId)
      .gte('clock_in', weekStartDate.toISOString())
      .lt('clock_in', weekEndDate.toISOString())
    if (lockErr) return lockErr.message
    const { error: appErr } = await supabase.from('weekly_approvals').upsert(
      {
        employee_id: employeeId,
        week_ending_date: weekEndIso,
        approved_by: me.id,
        approved_at: new Date().toISOString(),
        total_hours: Number(grand.toFixed(2)),
        entity_breakdown: {
          Corporate: t.Corporate,
          Plano: t.Plano,
          Dallas: t.Dallas,
        },
      },
      { onConflict: 'employee_id,week_ending_date' },
    )
    if (appErr) return appErr.message
    await logAudit(me.id, 'approve_week', employeeId, {
      week_ending: weekEndIso,
      total_hours: grand,
    })
    return null
  }

  const revertOne = async (employeeId: string): Promise<string | null> => {
    if (!me) return 'Not signed in'
    const { error: unlockErr } = await supabase
      .from('time_entries')
      .update({ is_approved: false })
      .eq('employee_id', employeeId)
      .gte('clock_in', weekStartDate.toISOString())
      .lt('clock_in', weekEndDate.toISOString())
    if (unlockErr) return unlockErr.message
    const { error: delErr } = await supabase
      .from('weekly_approvals')
      .delete()
      .eq('employee_id', employeeId)
      .eq('week_ending_date', weekEndIso)
    if (delErr) return delErr.message
    await logAudit(me.id, 'revert_approval', employeeId, { week_ending: weekEndIso })
    return null
  }

  const approveAll = async () => {
    setBusy(true)
    setErr(null)
    for (const id of employeesWithEntries) {
      if (approvals[id]) continue // already approved, skip
      const error = await approveOne(id)
      if (error) {
        setErr(error)
        break
      }
    }
    await loadWeek()
    setBusy(false)
  }

  const revertAll = async () => {
    setBusy(true)
    setErr(null)
    for (const id of employeesWithEntries) {
      if (!approvals[id]) continue
      const error = await revertOne(id)
      if (error) {
        setErr(error)
        break
      }
    }
    await loadWeek()
    setBusy(false)
  }

  const approveSingle = async () => {
    setBusy(true)
    setErr(null)
    const error = await approveOne(selectedId)
    if (error) setErr(error)
    await loadWeek()
    setBusy(false)
  }

  const revertSingle = async () => {
    setBusy(true)
    setErr(null)
    const error = await revertOne(selectedId)
    if (error) setErr(error)
    await loadWeek()
    setBusy(false)
  }

  const shiftWeek = (delta: number) => {
    setWeekDate(prev => {
      const next = new Date(prev)
      next.setDate(next.getDate() + delta * 7)
      return next
    })
  }

  const colCount = isEveryone ? 10 : 9

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
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="bg-white border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
          >
            <option value={ALL}>Everyone</option>
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

      <div className="bg-white border border-zinc-200 shadow-sm rounded-xl overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-[10px] font-bold tracking-[0.3em] text-zinc-500">
            <tr>
              {isEveryone && <th className="text-left p-3">NAME</th>}
              <th className="text-left p-3">DATE</th>
              <th className="text-left p-3">ENTITY</th>
              <th className="text-left p-3">PROJECT</th>
              <th className="text-left p-3">IN</th>
              <th className="text-left p-3">OUT</th>
              <th className="text-left p-3">BREAK</th>
              <th className="text-right p-3">HRS</th>
              <th className="text-left p-3 hidden md:table-cell">NOTES</th>
              <th className="sticky right-0 bg-zinc-50" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colCount} className="p-4 text-zinc-500 text-center text-sm">
                  Loading…
                </td>
              </tr>
            ) : sortedEntries.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="p-6 text-zinc-500 text-center text-sm">
                  No entries for this week.
                </td>
              </tr>
            ) : (
              sortedEntries.map(e => (
                <EntryEditRow
                  key={e.id}
                  entry={e}
                  employeeName={
                    isEveryone
                      ? employeesById[e.employee_id]?.full_name ?? '—'
                      : null
                  }
                  locked={!!approvals[e.employee_id]}
                  onUpdate={updateEntry}
                  onRequestDelete={setPendingDelete}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-zinc-200 shadow-sm rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-500">
            {isEveryone ? 'TOTALS — ALL EMPLOYEES' : 'TOTALS'}
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

      {isEveryone ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">
            {employeesWithEntries.length === 0
              ? 'No employees have entries this week.'
              : `${approvedCount} of ${employeesWithEntries.length} weeks approved` +
                (pendingCount > 0 ? ` · ${pendingCount} pending` : '')}
          </div>
          <div className="flex items-center gap-2">
            {approvedCount > 0 && (
              <button
                onClick={revertAll}
                disabled={busy}
                className="border border-zinc-300 rounded-lg px-4 py-2 text-xs font-bold tracking-widest hover:border-zinc-500 hover:bg-zinc-50 flex items-center gap-2 disabled:opacity-50"
              >
                <Undo2 className="w-3 h-3" />
                REVERT ALL
              </button>
            )}
            <button
              onClick={approveAll}
              disabled={busy || pendingCount === 0}
              className="bg-red-800 hover:bg-red-900 text-white font-black px-4 py-3 rounded-lg text-xs tracking-widest flex items-center gap-2 disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              <Check className="w-4 h-4" />
              {busy
                ? 'APPROVING…'
                : pendingCount > 0
                  ? `APPROVE ALL (${pendingCount})`
                  : 'ALL APPROVED'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          {approvals[selectedId] ? (
            <>
              <div className="flex items-center gap-2 text-xs text-green-700">
                <Lock className="w-3 h-3" />
                APPROVED {new Date(approvals[selectedId]).toLocaleString()}
              </div>
              <button
                onClick={revertSingle}
                disabled={busy}
                className="border border-zinc-300 rounded-lg px-4 py-2 text-xs font-bold tracking-widest hover:border-zinc-500 hover:bg-zinc-50 flex items-center gap-2 disabled:opacity-50"
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
                onClick={approveSingle}
                disabled={busy || entries.length === 0}
                className="bg-red-800 hover:bg-red-900 text-white font-black px-4 py-3 rounded-lg text-xs tracking-widest flex items-center gap-2 disabled:bg-zinc-200 disabled:text-zinc-400"
              >
                <Check className="w-4 h-4" />
                {busy ? 'APPROVING…' : 'APPROVE WEEK'}
              </button>
            </>
          )}
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          danger
          title="Delete time entry?"
          message={
            `This will permanently remove the ${pendingDelete.entity}` +
            `${pendingDelete.category ? ` · ${pendingDelete.category}` : ''} entry from ` +
            `${new Date(pendingDelete.clock_in).toLocaleDateString([], {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })} (${fmtHours(entryHours(pendingDelete))}h). ` +
            `It is logged in the audit trail and can be recreated, but not undone with one click.`
          }
          confirmLabel="DELETE ENTRY"
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            const target = pendingDelete
            setPendingDelete(null)
            await deleteEntry(target.id)
          }}
        />
      )}
    </div>
  )
}

function EntryEditRow({
  entry,
  employeeName,
  locked,
  onUpdate,
  onRequestDelete,
}: {
  entry: TimeEntry
  // Non-null only in "Everyone" mode — renders a leading NAME cell.
  employeeName: string | null
  locked: boolean
  onUpdate: (id: string, patch: Partial<TimeEntry>) => Promise<void>
  onRequestDelete: (entry: TimeEntry) => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    entity: entry.entity,
    category: entry.category ?? categoryNamesFor(entry.entity)[0],
    clock_in: toLocalInput(entry.clock_in),
    clock_out: entry.clock_out ? toLocalInput(entry.clock_out) : '',
    break_minutes: entry.break_minutes,
    notes: entry.notes,
  })

  useEffect(() => {
    if (!editing) return
    const valid = categoryNamesFor(form.entity)
    if (!valid.includes(form.category)) {
      setForm(f => ({ ...f, category: valid[0] }))
    }
  }, [form.entity, form.category, editing])

  // Full date, e.g. "Friday, May 17, 2025".
  const dayLabel = new Date(entry.clock_in).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const save = async () => {
    const ci = new Date(form.clock_in)
    const co = form.clock_out ? new Date(form.clock_out) : null
    if (co && co.getTime() <= ci.getTime()) return
    await onUpdate(entry.id, {
      entity: form.entity,
      category: form.category,
      clock_in: ci.toISOString(),
      clock_out: co ? co.toISOString() : null,
      break_minutes: form.break_minutes,
      notes: form.notes,
    })
    setEditing(false)
  }

  const hrs = entryHours(entry)
  const showName = employeeName !== null

  if (editing && !locked) {
    return (
      <tr className="border-t border-zinc-200 bg-red-50/40">
        {showName && (
          <td className="p-2 text-xs font-bold whitespace-nowrap">{employeeName}</td>
        )}
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
          <select
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="bg-white border border-zinc-300 rounded px-2 py-1 text-xs max-w-[140px]"
          >
            {categoryNamesFor(form.entity).map(c => (
              <option key={c} value={c}>
                {c}
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
        <td className="p-2 whitespace-nowrap sticky right-0 bg-red-50 border-l border-zinc-200">
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
      {showName && (
        <td className="p-3 text-xs font-bold whitespace-nowrap">{employeeName}</td>
      )}
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
      <td className="p-3 text-xs">
        {entry.category ?? <span className="text-zinc-400">—</span>}
      </td>
      <td className="p-3 text-xs tabular-nums">{fmtClock(entry.clock_in)}</td>
      <td className="p-3 text-xs tabular-nums">
        {entry.clock_out ? fmtClock(entry.clock_out) : '—'}
      </td>
      <td className="p-3 text-xs tabular-nums">{entry.break_minutes}m</td>
      <td className="p-3 text-right text-sm font-black tabular-nums">
        {fmtHours(hrs)}
      </td>
      <td className="p-3 text-xs text-zinc-500 hidden md:table-cell align-top">
        <div className="w-[260px] whitespace-pre-wrap break-words">
          {entry.notes || '—'}
        </div>
      </td>
      <td className="p-3 whitespace-nowrap text-right sticky right-0 bg-white border-l border-zinc-200">
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
              onClick={() => onRequestDelete(entry)}
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

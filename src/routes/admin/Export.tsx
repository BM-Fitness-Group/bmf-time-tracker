import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  fmtDate,
  fmtHours,
  sumByEntity,
  toDateOnly,
  weekEnd,
  weekStart,
} from '@/lib/time'
import { buildPayrollWorkbook, payrollFilename } from '@/lib/export'
import type { Employee, TimeEntry } from '@/types/db'

type Row = {
  employee: Employee
  entries: TimeEntry[]
  approved: boolean
}

export default function Export() {
  const [weekDate, setWeekDate] = useState(new Date())
  const [rows, setRows] = useState<Row[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const weekStartDate = useMemo(() => weekStart(weekDate), [weekDate])
  const weekEndDate = useMemo(() => weekEnd(weekDate), [weekDate])
  const weekEndingSunday = useMemo(() => {
    const d = new Date(weekEndDate)
    d.setDate(d.getDate() - 1)
    return d
  }, [weekEndDate])
  const weekEndIso = useMemo(() => toDateOnly(weekEndingSunday), [weekEndingSunday])

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    const [empRes, entRes, appRes] = await Promise.all([
      supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('full_name', { ascending: true }),
      supabase
        .from('time_entries')
        .select('*')
        .is('deleted_at', null)
        .gte('clock_in', weekStartDate.toISOString())
        .lt('clock_in', weekEndDate.toISOString()),
      supabase
        .from('weekly_approvals')
        .select('employee_id')
        .eq('week_ending_date', weekEndIso),
    ])
    if (empRes.error || entRes.error || appRes.error) {
      setErr(
        empRes.error?.message ??
          entRes.error?.message ??
          appRes.error?.message ??
          null,
      )
      setLoading(false)
      return
    }
    const employees = empRes.data ?? []
    const entries = (entRes.data ?? []) as TimeEntry[]
    const approvedIds = new Set((appRes.data ?? []).map(a => a.employee_id))
    const byEmployee = new Map<string, TimeEntry[]>()
    for (const e of entries) {
      const list = byEmployee.get(e.employee_id) ?? []
      list.push(e)
      byEmployee.set(e.employee_id, list)
    }
    const combined: Row[] = employees.map(emp => ({
      employee: emp,
      entries: byEmployee.get(emp.id) ?? [],
      approved: approvedIds.has(emp.id),
    }))
    setRows(combined)
    setSelected(new Set(combined.filter(r => r.approved).map(r => r.employee.id)))
    setLoading(false)
  }, [weekStartDate, weekEndDate, weekEndIso])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(rows.map(r => r.employee.id)))
  const selectApproved = () =>
    setSelected(new Set(rows.filter(r => r.approved).map(r => r.employee.id)))
  const selectNone = () => setSelected(new Set())

  const shiftWeek = (delta: number) => {
    setWeekDate(prev => {
      const next = new Date(prev)
      next.setDate(next.getDate() + delta * 7)
      return next
    })
  }

  const generate = async () => {
    if (selected.size === 0) return
    setGenerating(true)
    setErr(null)
    try {
      const included = rows.filter(r => selected.has(r.employee.id))
      const buffer = await buildPayrollWorkbook(weekEndingSunday, included)
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = payrollFilename(weekEndingSunday)
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const anyUnapproved = rows.some(r => selected.has(r.employee.id) && !r.approved)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-black tracking-tighter">Weekly Export</h2>
          <div className="text-xs text-zinc-500 mt-1">
            Generate payroll XLSX for the selected week
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shiftWeek(-1)}
            className="p-2 border border-zinc-300 rounded hover:border-zinc-500 hover:bg-zinc-50"
            aria-label="previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-xs tracking-widest text-zinc-600 px-2 tabular-nums">
            {fmtDate(weekStartDate.toISOString())} – {fmtDate(weekEndingSunday.toISOString())}
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

      {err && (
        <div className="mb-4 border border-red-300 bg-red-50 rounded-lg p-3 text-xs text-red-800">
          {err}
        </div>
      )}

      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden mb-4 shadow-sm">
        <div className="flex items-center justify-between bg-zinc-50 px-3 py-2 border-b border-zinc-200 text-[10px] font-bold tracking-[0.3em] text-zinc-500">
          <div>EMPLOYEES</div>
          <div className="flex gap-3">
            <button onClick={selectApproved} className="hover:text-red-800">
              APPROVED
            </button>
            <button onClick={selectAll} className="hover:text-red-800">
              ALL
            </button>
            <button onClick={selectNone} className="hover:text-red-800">
              NONE
            </button>
          </div>
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm text-zinc-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            No active employees.
          </div>
        ) : (
          <ul>
            {rows.map(r => {
              const totals = sumByEntity(r.entries)
              const total = totals.Corporate + totals.Plano + totals.Dallas
              const isSelected = selected.has(r.employee.id)
              return (
                <li
                  key={r.employee.id}
                  className="border-t border-zinc-200 first:border-t-0 px-3 py-2 flex items-center gap-3 text-sm hover:bg-zinc-50"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(r.employee.id)}
                    className="accent-red-800"
                  />
                  <div className="flex-1 font-bold">{r.employee.full_name}</div>
                  <div className="text-xs text-zinc-500 tabular-nums">
                    {r.entries.length} entries
                  </div>
                  <div className="text-right w-20 tabular-nums font-black">
                    {fmtHours(total)}h
                  </div>
                  <div className="w-20 text-right">
                    {r.approved ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[0.2em] text-green-700">
                        <Lock className="w-3 h-3" />
                        APPR
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400">
                        PENDING
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {anyUnapproved && (
        <div className="mb-4 border border-amber-300 bg-amber-50 rounded-lg p-3 text-xs text-amber-800">
          Some selected employees have not had this week approved yet. The
          export will still include them, but review first if you want locked
          numbers.
        </div>
      )}

      <button
        onClick={generate}
        disabled={selected.size === 0 || generating}
        className="w-full sm:w-auto bg-red-800 hover:bg-red-900 text-white font-black px-5 py-3 rounded-lg text-xs tracking-widest flex items-center justify-center gap-2 disabled:bg-zinc-200 disabled:text-zinc-400"
      >
        <Download className="w-4 h-4" />
        {generating ? 'GENERATING…' : `DOWNLOAD XLSX (${selected.size})`}
      </button>
    </div>
  )
}


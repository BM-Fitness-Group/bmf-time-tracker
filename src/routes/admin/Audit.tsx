import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtDateTime } from '@/lib/time'
import type { AuditLog, Employee } from '@/types/db'

type Row = AuditLog & { actor: Pick<Employee, 'id' | 'full_name'> | null }

export default function Audit() {
  const [rows, setRows] = useState<Row[]>([])
  const [actors, setActors] = useState<Employee[]>([])
  const [filterActor, setFilterActor] = useState<string>('')
  const [filterAction, setFilterAction] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadActors = async () => {
      const { data } = await supabase
        .from('employees')
        .select('*')
        .order('full_name', { ascending: true })
      setActors(data ?? [])
    }
    void loadActors()
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('audit_log')
      .select('*, actor:employees(id, full_name)')
      .order('created_at', { ascending: false })
      .limit(200)
    if (filterActor) q = q.eq('actor_id', filterActor)
    if (filterAction) q = q.eq('action', filterAction)
    const { data } = await q
    setRows((data ?? []) as unknown as Row[])
    setLoading(false)
  }, [filterActor, filterAction])

  useEffect(() => {
    void load()
  }, [load])

  const actionOptions = useMemo(() => {
    const set = new Set<string>(rows.map(r => r.action))
    return Array.from(set).sort()
  }, [rows])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-black tracking-tighter">Audit Log</h2>
          <div className="text-xs text-zinc-500 mt-1">
            Most recent 200 actions
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterActor}
            onChange={e => setFilterActor(e.target.value)}
            className="bg-white border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20"
          >
            <option value="">All actors</option>
            {actors.map(a => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </select>
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="bg-white border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20"
          >
            <option value="">All actions</option>
            {actionOptions.map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-[10px] font-bold tracking-[0.3em] text-zinc-500">
            <tr>
              <th className="text-left p-3">WHEN</th>
              <th className="text-left p-3">WHO</th>
              <th className="text-left p-3">ACTION</th>
              <th className="text-left p-3 hidden md:table-cell">TARGET</th>
              <th className="text-left p-3 hidden lg:table-cell">DETAILS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-4 text-zinc-500 text-center text-sm">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-zinc-500 text-center text-sm">
                  No audit entries.
                </td>
              </tr>
            ) : (
              rows.map(r => (
                <tr key={r.id} className="border-t border-zinc-200 align-top">
                  <td className="p-3 text-xs text-zinc-600 whitespace-nowrap">
                    {fmtDateTime(r.created_at)}
                  </td>
                  <td className="p-3 text-xs">{r.actor?.full_name ?? '—'}</td>
                  <td className="p-3 text-xs font-bold tracking-widest">
                    {r.action.toUpperCase()}
                  </td>
                  <td className="p-3 text-[11px] text-zinc-500 hidden md:table-cell">
                    {r.target_type}
                  </td>
                  <td className="p-3 text-[11px] text-zinc-500 hidden lg:table-cell font-mono truncate max-w-[360px]">
                    {r.details ? JSON.stringify(r.details) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

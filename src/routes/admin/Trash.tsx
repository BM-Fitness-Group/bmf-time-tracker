import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthContext'
import { loadErrorMessage, withQueryTimeout } from '@/lib/query'
import { entryHours, fmtClock, fmtDateTime, fmtHours } from '@/lib/time'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { EntityName, TimeEntry } from '@/types/db'

type Row = TimeEntry & {
  employee: { id: string; full_name: string } | null
}

const ENTITY_DOT: Record<EntityName, string> = {
  Corporate: 'bg-zinc-600',
  Plano: 'bg-orange-500',
  Dallas: 'bg-sky-600',
}

export default function Trash() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pendingPurge, setPendingPurge] = useState<Row | null>(null)
  const { employee: me } = useAuth()

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const { data, error } = await withQueryTimeout(signal =>
        supabase
          .from('time_entries')
          .select('*, employee:employees(id, full_name)')
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false })
          .limit(200)
          .abortSignal(signal),
      )
      if (error) setErr(error.message)
      else setRows((data ?? []) as unknown as Row[])
    } catch (e) {
      setErr(loadErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const restore = async (row: Row) => {
    setBusy(true)
    setErr(null)
    const { error } = await supabase
      .from('time_entries')
      .update({ deleted_at: null })
      .eq('id', row.id)
    if (error) {
      setErr(error.message)
      setBusy(false)
      return
    }
    await logAudit(me?.id, 'restore_entry', row.id, {
      entity: row.entity,
      category: row.category,
      clock_in: row.clock_in,
    })
    setRows(prev => prev.filter(r => r.id !== row.id))
    setBusy(false)
  }

  const purge = async (row: Row) => {
    setBusy(true)
    setErr(null)
    const { error } = await supabase.from('time_entries').delete().eq('id', row.id)
    if (error) {
      setErr(error.message)
      setBusy(false)
      return
    }
    await logAudit(me?.id, 'purge_entry', row.id, {
      entity: row.entity,
      category: row.category,
      clock_in: row.clock_in,
      employee_id: row.employee_id,
    })
    setRows(prev => prev.filter(r => r.id !== row.id))
    setBusy(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-black tracking-tighter">Trash</h2>
          <div className="text-xs text-zinc-500 mt-1">
            Deleted time entries — restore them, or remove permanently
          </div>
        </div>
      </div>

      {err && (
        <div className="mb-4 border border-red-300 bg-brand-soft rounded-lg p-3 text-xs text-brand">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-zinc-500 text-sm shadow-sm">
          Trash is empty. Deleted entries will appear here.
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-[10px] font-bold tracking-[0.3em] text-zinc-500">
              <tr>
                <th className="text-left p-3">EMPLOYEE</th>
                <th className="text-left p-3">ENTITY</th>
                <th className="text-left p-3">PROJECT</th>
                <th className="text-left p-3">WORKED</th>
                <th className="text-right p-3">HRS</th>
                <th className="text-left p-3 hidden md:table-cell">DELETED</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-zinc-200">
                  <td className="p-3 text-xs font-bold whitespace-nowrap">
                    {r.employee?.full_name ?? '—'}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${ENTITY_DOT[r.entity]}`} />
                      <span className="text-xs">{r.entity}</span>
                    </div>
                  </td>
                  <td className="p-3 text-xs">
                    {r.category ?? <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="p-3 text-xs text-zinc-600 whitespace-nowrap tabular-nums">
                    {new Date(r.clock_in).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    {fmtClock(r.clock_in)}
                    {r.clock_out && ` – ${fmtClock(r.clock_out)}`}
                  </td>
                  <td className="p-3 text-right text-sm font-black tabular-nums">
                    {fmtHours(entryHours(r))}
                  </td>
                  <td className="p-3 text-[11px] text-zinc-500 hidden md:table-cell whitespace-nowrap">
                    {r.deleted_at ? fmtDateTime(r.deleted_at) : '—'}
                  </td>
                  <td className="p-3 whitespace-nowrap text-right">
                    <button
                      onClick={() => restore(r)}
                      disabled={busy}
                      className="text-[10px] font-bold tracking-[0.2em] text-zinc-600 hover:text-brand mr-3 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      RESTORE
                    </button>
                    <button
                      onClick={() => setPendingPurge(r)}
                      disabled={busy}
                      className="text-zinc-400 hover:text-brand disabled:opacity-50"
                      aria-label="delete permanently"
                      title="Delete permanently"
                    >
                      <Trash2 className="w-3 h-3 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pendingPurge && (
        <ConfirmDialog
          danger
          title="Permanently delete?"
          message={
            `This will permanently remove ${pendingPurge.employee?.full_name ?? 'this employee'}'s ` +
            `${pendingPurge.entity}${pendingPurge.category ? ` · ${pendingPurge.category}` : ''} entry ` +
            `(${fmtHours(entryHours(pendingPurge))}h). Once purged it cannot be restored — it leaves the ` +
            `database entirely. Use Restore instead if there's any chance you'll need it.`
          }
          confirmLabel="PERMANENTLY DELETE"
          onCancel={() => setPendingPurge(null)}
          onConfirm={async () => {
            const target = pendingPurge
            setPendingPurge(null)
            await purge(target)
          }}
        />
      )}
    </div>
  )
}

async function logAudit(
  actorId: string | undefined,
  action: string,
  targetId: string,
  details: Record<string, unknown>,
) {
  if (!actorId) return
  await supabase.from('audit_log').insert({
    actor_id: actorId,
    action,
    target_type: 'time_entry',
    target_id: targetId,
    details,
  })
}

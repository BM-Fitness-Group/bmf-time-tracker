import { useCallback, useEffect, useState } from 'react'
import { Plus, X, Power, Shield, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthContext'
import type { Employee, Role } from '@/types/db'

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('full_name', { ascending: true })
    if (error) setErr(error.message)
    else setEmployees(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-black tracking-tighter">Employees</h2>
          <div className="text-xs text-zinc-500 mt-1">
            Add, deactivate, and manage roles
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="bg-red-800 hover:bg-red-900 text-white font-black px-4 py-2 rounded-lg text-xs tracking-widest flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          ADD
        </button>
      </div>

      {err && (
        <div className="mb-4 border border-red-300 bg-red-50 rounded-lg p-3 text-xs text-red-800">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading…</div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-[10px] font-bold tracking-[0.3em] text-zinc-500">
              <tr>
                <th className="text-left p-3">NAME</th>
                <th className="text-left p-3 hidden sm:table-cell">EMAIL</th>
                <th className="text-left p-3">ROLE</th>
                <th className="text-left p-3">STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {employees.map(e => (
                <EmployeeRow key={e.id} employee={e} onChanged={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <AddEmployeeModal
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false)
            void load()
          }}
        />
      )}
    </div>
  )
}

function EmployeeRow({
  employee,
  onChanged,
}: {
  employee: Employee
  onChanged: () => void
}) {
  const { employee: me } = useAuth()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(employee.full_name)
  const [role, setRole] = useState<Role>(employee.role)
  const [busy, setBusy] = useState(false)
  const isSelf = me?.id === employee.id

  const save = async () => {
    setBusy(true)
    const { error } = await supabase
      .from('employees')
      .update({ full_name: name, role })
      .eq('id', employee.id)
    setBusy(false)
    if (!error) {
      await logAudit(me?.id, 'update_employee', employee.id, {
        before: { full_name: employee.full_name, role: employee.role },
        after: { full_name: name, role },
      })
      setEditing(false)
      onChanged()
    }
  }

  const toggleActive = async () => {
    if (isSelf) return
    setBusy(true)
    const { error } = await supabase
      .from('employees')
      .update({ is_active: !employee.is_active })
      .eq('id', employee.id)
    setBusy(false)
    if (!error) {
      await logAudit(
        me?.id,
        employee.is_active ? 'deactivate_employee' : 'reactivate_employee',
        employee.id,
        { email: employee.email },
      )
      onChanged()
    }
  }

  return (
    <tr className="border-t border-zinc-200 align-middle">
      <td className="p-3">
        {editing ? (
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-white border border-zinc-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20 w-full"
          />
        ) : (
          <div className="flex items-center gap-2">
            {employee.role === 'admin' ? (
              <Shield className="w-3 h-3 text-red-700" />
            ) : (
              <User className="w-3 h-3 text-zinc-500" />
            )}
            <span className="font-bold">{employee.full_name}</span>
          </div>
        )}
      </td>
      <td className="p-3 text-zinc-600 hidden sm:table-cell">{employee.email}</td>
      <td className="p-3">
        {editing ? (
          <select
            value={role}
            onChange={e => setRole(e.target.value as Role)}
            disabled={isSelf}
            className="bg-white border border-zinc-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20"
          >
            <option value="employee">employee</option>
            <option value="admin">admin</option>
          </select>
        ) : (
          <span className="text-xs tracking-widest text-zinc-600">
            {employee.role.toUpperCase()}
          </span>
        )}
      </td>
      <td className="p-3">
        <span
          className={`text-[10px] font-bold tracking-[0.2em] ${
            employee.is_active ? 'text-green-700' : 'text-zinc-400'
          }`}
        >
          {employee.is_active ? 'ACTIVE' : 'INACTIVE'}
        </span>
      </td>
      <td className="p-3 text-right">
        {editing ? (
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setEditing(false)
                setName(employee.full_name)
                setRole(employee.role)
              }}
              className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 hover:text-zinc-900"
            >
              CANCEL
            </button>
            <button
              disabled={busy}
              onClick={save}
              className="text-[10px] font-bold tracking-[0.2em] text-red-800 hover:text-red-900 disabled:opacity-50"
            >
              SAVE
            </button>
          </div>
        ) : (
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setEditing(true)}
              className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 hover:text-red-800"
            >
              EDIT
            </button>
            {!isSelf && (
              <button
                onClick={toggleActive}
                disabled={busy}
                className="text-zinc-400 hover:text-red-700 disabled:opacity-50"
                title={employee.is_active ? 'Deactivate' : 'Reactivate'}
              >
                <Power className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

function AddEmployeeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const { employee: me } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('employee')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    const { data, error } = await supabase
      .from('employees')
      .insert({
        email: email.trim().toLowerCase(),
        full_name: name.trim(),
        role,
        is_active: true,
        auth_user_id: null,
      })
      .select('id')
      .single()
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    await logAudit(me?.id, 'add_employee', data.id, {
      email: email.trim().toLowerCase(),
      role,
    })
    onCreated()
  }

  return (
    <div
      className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center p-5 z-50"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="bg-white border border-zinc-200 rounded-xl p-5 w-full max-w-sm shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-500">
            ADD EMPLOYEE
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-900">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block mb-3">
          <span className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 block mb-1">
            NAME
          </span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full bg-white border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20"
          />
        </label>

        <label className="block mb-3">
          <span className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 block mb-1">
            EMAIL
          </span>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="name@bodymachinefitness.com"
            className="w-full bg-white border border-zinc-300 rounded px-3 py-2 text-sm placeholder-zinc-400 focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20"
          />
        </label>

        <label className="block mb-4">
          <span className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 block mb-1">
            ROLE
          </span>
          <select
            value={role}
            onChange={e => setRole(e.target.value as Role)}
            className="w-full bg-white border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20"
          >
            <option value="employee">employee</option>
            <option value="admin">admin</option>
          </select>
        </label>

        {err && <div className="text-xs text-red-700 mb-3">{err}</div>}

        <div className="text-[11px] text-zinc-500 mb-4 leading-relaxed">
          The employee can sign in at any time using this email — the system
          links their auth account on first magic-link login. No invite email is
          sent automatically.
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-red-800 hover:bg-red-900 text-white font-black py-3 rounded-lg tracking-wider disabled:bg-zinc-200 disabled:text-zinc-400"
        >
          {busy ? 'SAVING…' : 'ADD EMPLOYEE'}
        </button>
      </form>
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
    target_type: 'employee',
    target_id: targetId,
    details,
  })
}

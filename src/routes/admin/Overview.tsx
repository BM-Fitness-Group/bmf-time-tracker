import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Users, CheckSquare, ScrollText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  weekStart,
  weekEnd,
  sumByEntity,
  fmtHours,
  weekEndingDate,
} from '@/lib/time'
import type { TimeEntry } from '@/types/db'

type Stats = {
  activeCount: number
  employeeCount: number
  weekHours: number
  pendingWeeks: number
}

export default function Overview() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    const load = async () => {
      const ws = weekStart().toISOString()
      const we = weekEnd().toISOString()
      const [sess, emps, entries, approvals] = await Promise.all([
        supabase.from('active_sessions').select('employee_id'),
        supabase.from('employees').select('id').eq('is_active', true),
        supabase
          .from('time_entries')
          .select('*')
          .is('deleted_at', null)
          .gte('clock_in', ws)
          .lt('clock_in', we),
        supabase
          .from('weekly_approvals')
          .select('employee_id')
          .eq('week_ending_date', weekEndingDate()),
      ])
      const entriesData = (entries.data ?? []) as TimeEntry[]
      const totals = sumByEntity(entriesData)
      const weekHours = totals.Corporate + totals.Plano + totals.Dallas
      const activeEmployees = emps.data?.length ?? 0
      const approvedEmployees = new Set(approvals.data?.map(a => a.employee_id) ?? [])
      const pendingWeeks = Math.max(0, activeEmployees - approvedEmployees.size)
      setStats({
        activeCount: sess.data?.length ?? 0,
        employeeCount: activeEmployees,
        weekHours,
        pendingWeeks,
      })
    }
    void load()
  }, [])

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          label="ON THE CLOCK"
          value={stats ? String(stats.activeCount) : '—'}
          icon={<Activity className="w-4 h-4" />}
          to="/admin/live"
        />
        <StatCard
          label="ACTIVE EMPLOYEES"
          value={stats ? String(stats.employeeCount) : '—'}
          icon={<Users className="w-4 h-4" />}
          to="/admin/employees"
        />
        <StatCard
          label="HOURS THIS WEEK"
          value={stats ? `${fmtHours(stats.weekHours)}h` : '—'}
          icon={<CheckSquare className="w-4 h-4" />}
          to="/admin/review"
        />
        <StatCard
          label="AWAITING APPROVAL"
          value={stats ? String(stats.pendingWeeks) : '—'}
          icon={<ScrollText className="w-4 h-4" />}
          to="/admin/review"
        />
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
        <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 mb-2">
          QUICK ACTIONS
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <Link to="/admin/live" className="text-zinc-600 hover:text-red-800">
            See who's on the clock now →
          </Link>
          <Link to="/admin/review" className="text-zinc-600 hover:text-red-800">
            Review & approve this week's hours →
          </Link>
          <Link to="/admin/employees" className="text-zinc-600 hover:text-red-800">
            Add or manage employees →
          </Link>
          <Link to="/admin/audit" className="text-zinc-600 hover:text-red-800">
            View audit log →
          </Link>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  to,
}: {
  label: string
  value: string
  icon: React.ReactNode
  to: string
}) {
  return (
    <Link
      to={to}
      className="bg-white border border-zinc-200 rounded-xl p-4 hover:border-red-300 hover:shadow-sm transition shadow-sm block"
    >
      <div className="flex items-center gap-2 text-zinc-500 mb-2">
        {icon}
        <span className="text-[10px] font-bold tracking-[0.3em]">{label}</span>
      </div>
      <div className="text-2xl font-black tabular-nums text-zinc-900">{value}</div>
    </Link>
  )
}

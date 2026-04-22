import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { LogOut } from 'lucide-react'

const NAV = [
  { to: '/admin', label: 'OVERVIEW', end: true },
  { to: '/admin/live', label: 'LIVE', end: false },
  { to: '/admin/employees', label: 'EMPLOYEES', end: false },
  { to: '/admin/review', label: 'REVIEW', end: false },
  { to: '/admin/export', label: 'EXPORT', end: false },
  { to: '/admin/audit', label: 'AUDIT', end: false },
]

export default function AdminLayout() {
  const { employee, signOut } = useAuth()
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200 px-5 py-4 bg-white">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tighter leading-none text-red-800">
              BMF
            </h1>
            <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 mt-1">
              ADMIN CONSOLE
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-zinc-600">{employee?.full_name}</div>
              <NavLink
                to="/app"
                className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 hover:text-red-800"
              >
                EMPLOYEE VIEW →
              </NavLink>
            </div>
            <button
              onClick={signOut}
              className="text-zinc-500 hover:text-red-800"
              aria-label="sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <nav className="border-b border-zinc-200 px-5 bg-white">
        <div className="max-w-6xl mx-auto flex gap-6 overflow-x-auto">
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `py-3 text-[10px] font-bold tracking-[0.3em] whitespace-nowrap transition border-b-2 ${
                  isActive
                    ? 'text-red-800 border-red-700'
                    : 'text-zinc-500 border-transparent hover:text-zinc-900'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-5 py-5 bg-zinc-50/40 min-h-[calc(100vh-117px)]">
        <Outlet />
      </main>
    </div>
  )
}

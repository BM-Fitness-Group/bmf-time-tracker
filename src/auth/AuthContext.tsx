import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Employee } from '@/types/db'

interface AuthState {
  session: Session | null
  employee: Employee | null
  loading: boolean
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshEmployee: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)

  type FetchResult =
    | { kind: 'ok'; employee: Employee | null }
    | { kind: 'error'; error: string }

  const fetchEmployeeOnce = async (authUserId: string): Promise<FetchResult> => {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('auth_user_id', authUserId)
      .eq('is_active', true)
      .maybeSingle()
    if (error) {
      console.warn('fetchEmployee error', error)
      return { kind: 'error', error: error.message }
    }
    return { kind: 'ok', employee: data ?? null }
  }

  // Retry the employees lookup on transient errors (network blip, supabase
  // briefly unavailable, RLS-context race during cold start). Only fall
  // through to "null" after we've actually confirmed an empty result —
  // never on a query failure.
  const fetchEmployee = async (authUserId: string): Promise<Employee | null> => {
    const delays = [0, 400, 1200, 3000]
    let lastError: string | null = null
    for (const delay of delays) {
      if (delay > 0) await new Promise(r => setTimeout(r, delay))
      const res = await fetchEmployeeOnce(authUserId)
      if (res.kind === 'ok') return res.employee
      lastError = res.error
    }
    console.error('fetchEmployee gave up after retries:', lastError)
    return null
  }

  useEffect(() => {
    let active = true

    // Guards against a stuck Supabase auth lock (happens when another tab
    // crashed holding the cross-tab lease) leaving us in LOADING forever.
    // Only applies if getSession itself never resolved within 6s.
    let sessionSettled = false
    const watchdog = setTimeout(() => {
      if (!sessionSettled && active) {
        console.warn('AuthContext watchdog: getSession timed out, proceeding unauthenticated')
        setLoading(false)
      }
    }, 6000)

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        sessionSettled = true
        if (!active) return
        setSession(data.session)
        if (data.session) {
          const emp = await fetchEmployee(data.session.user.id)
          if (!active) return
          setEmployee(emp)
        }
      } catch (err) {
        console.error('AuthContext init failed', err)
      } finally {
        if (active) setLoading(false)
      }
    }
    void init()

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next)
      if (next) {
        const emp = await fetchEmployee(next.user.id)
        setEmployee(emp)
      } else {
        setEmployee(null)
      }
    })

    return () => {
      active = false
      clearTimeout(watchdog)
      sub.subscription.unsubscribe()
    }
  }, [])

  const signInWithMagicLink = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const refreshEmployee = async () => {
    if (!session) return
    const emp = await fetchEmployee(session.user.id)
    setEmployee(emp)
  }

  const value: AuthState = {
    session,
    employee,
    loading,
    signInWithMagicLink,
    signOut,
    refreshEmployee,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

function AuthLoading() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 flex items-center justify-center font-mono text-xs tracking-widest text-zinc-500">
      LOADING...
    </div>
  )
}

export function RequireAuth() {
  const { session, employee, loading } = useAuth()
  const location = useLocation()
  if (loading) return <AuthLoading />
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  if (!employee)
    return <Navigate to="/login" replace state={{ error: 'unauthorized' }} />
  return <Outlet />
}

export function RequireAdmin() {
  const { employee, loading } = useAuth()
  if (loading) return <AuthLoading />
  if (!employee || employee.role !== 'admin')
    return <Navigate to="/app" replace />
  return <Outlet />
}

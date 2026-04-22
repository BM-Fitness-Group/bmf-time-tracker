import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'

export default function AuthCallback() {
  const { session, employee, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (!session) {
      navigate('/login', { replace: true })
      return
    }
    if (!employee) {
      navigate('/login', { replace: true, state: { error: 'unauthorized' } })
      return
    }
    navigate(employee.role === 'admin' ? '/admin' : '/app', { replace: true })
  }, [loading, session, employee, navigate])

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex items-center justify-center font-mono text-xs tracking-widest text-zinc-500">
      SIGNING IN...
    </div>
  )
}

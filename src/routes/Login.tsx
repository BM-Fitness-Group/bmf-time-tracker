import { useState } from 'react'
import { useLocation, Navigate } from 'react-router-dom'
import { Mail, LogIn } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'

export default function Login() {
  const { session, employee, signInWithMagicLink, loading } = useAuth()
  const location = useLocation()
  const state = location.state as { error?: string } | null
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (loading) return null
  if (session && employee) {
    const target = employee.role === 'admin' ? '/admin' : '/app'
    return <Navigate to={target} replace />
  }

  const unauthorized = state?.error === 'unauthorized'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setSending(true)
    setErr(null)
    const { error } = await signInWithMagicLink(email.trim())
    setSending(false)
    if (error) setErr(error)
    else setSent(true)
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black tracking-tighter leading-none text-red-800">
            BMF
          </h1>
          <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 mt-1">
            TIME TRACKER
          </div>
        </div>

        {unauthorized && (
          <div className="mb-5 border border-red-300 bg-red-50 rounded-lg p-3 text-xs text-red-800">
            Your email isn&apos;t registered. Contact your admin to be added.
          </div>
        )}

        {sent ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-5 text-center shadow-sm">
            <Mail className="w-8 h-8 text-green-600 mx-auto mb-3" />
            <div className="text-lg font-black mb-1">CHECK YOUR EMAIL</div>
            <div className="text-xs text-zinc-500">
              Magic link sent to <span className="text-zinc-900">{email}</span>. Click
              it to sign in.
            </div>
            <button
              onClick={() => {
                setSent(false)
                setEmail('')
              }}
              className="mt-4 text-[10px] font-bold tracking-[0.3em] text-zinc-500 hover:text-red-800"
            >
              USE DIFFERENT EMAIL
            </button>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm"
          >
            <label className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 block mb-2">
              EMAIL
            </label>
            <input
              type="email"
              autoFocus
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@bodymachinefitness.com"
              className="w-full bg-white border border-zinc-300 rounded-lg px-4 py-3 mb-4 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20"
            />
            {err && <div className="text-xs text-red-700 mb-3">{err}</div>}
            <button
              type="submit"
              disabled={sending || !email}
              className="w-full bg-red-800 hover:bg-red-900 text-white font-black py-4 rounded-lg transition flex items-center justify-center gap-2 tracking-wider disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              <LogIn className="w-4 h-4" />
              {sending ? 'SENDING...' : 'SEND MAGIC LINK'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

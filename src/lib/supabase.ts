import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Create .env.local.',
  )
}

// No-op lock: Supabase's default cross-tab lock (navigator.locks + localStorage
// leasing) can deadlock when a previous tab crashes holding the lease, freezing
// session init for ~10s and cascading into errors mid-request. We don't need
// cross-tab session sync — each user has one browser — so we bypass it.
const passthroughLock = async <R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> => fn()

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'bmf-time-tracker-auth',
    lock: passthroughLock,
  },
})

export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL ?? ''

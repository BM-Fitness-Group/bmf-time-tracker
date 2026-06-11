// Hardening for page data loads.
//
// A Supabase request that never settles — a token-refresh stall, a dropped
// connection, a hung fetch — would otherwise leave a page stuck on "Loading…"
// forever, because the line that resets the loading flag only runs after the
// await resolves. withQueryTimeout aborts the request after `ms` so the
// caller's catch/finally always runs and the UI never freezes.

export const LOAD_TIMEOUT_MS = 15000

// Runs `run`, handing it an AbortSignal to attach to Supabase queries via
// .abortSignal(signal). Aborts (and rejects with an AbortError) if the work
// hasn't settled within `ms`. Accepts PromiseLike so a bare PostgREST builder
// or a Promise.all of builders can be returned directly.
export async function withQueryTimeout<T>(
  run: (signal: AbortSignal) => PromiseLike<T>,
  ms = LOAD_TIMEOUT_MS,
): Promise<T> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    return await run(ac.signal)
  } finally {
    clearTimeout(timer)
  }
}

// Human-readable message for a failed load, distinguishing a timeout from
// other errors so the user knows it's worth retrying.
export function loadErrorMessage(e: unknown): string {
  if ((e as { name?: string })?.name === 'AbortError') {
    return 'Loading timed out. Check your connection and try again.'
  }
  return e instanceof Error ? e.message : 'Something went wrong while loading.'
}

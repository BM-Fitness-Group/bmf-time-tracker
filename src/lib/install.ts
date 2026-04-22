import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'bmf-install-dismissed-at'
const DISMISS_DAYS = 14

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS-specific property
  return (navigator as unknown as { standalone?: boolean }).standalone === true
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOSDevice = /iPad|iPhone|iPod/.test(ua)
  // iPadOS 13+ reports as Mac; detect via touch support.
  const iPadOS = ua.includes('Mac') && 'ontouchend' in document
  return iOSDevice || iPadOS
}

function recentlyDismissed(): boolean {
  const raw = localStorage.getItem(DISMISSED_KEY)
  if (!raw) return false
  const ts = Number(raw)
  if (!Number.isFinite(ts)) return false
  const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24)
  return ageDays < DISMISS_DAYS
}

type InstallState =
  | { kind: 'hidden' }
  | { kind: 'prompt'; trigger: () => Promise<'accepted' | 'dismissed'> }
  | { kind: 'ios-hint' }

export function useInstallPrompt(): {
  state: InstallState
  dismiss: () => void
} {
  const [state, setState] = useState<InstallState>({ kind: 'hidden' })

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return

    // Android / Chrome desktop path: browser fires beforeinstallprompt when
    // installability criteria are met.
    const onPrompt = (e: Event) => {
      e.preventDefault()
      const evt = e as BeforeInstallPromptEvent
      setState({
        kind: 'prompt',
        trigger: async () => {
          await evt.prompt()
          const { outcome } = await evt.userChoice
          if (outcome === 'dismissed') {
            localStorage.setItem(DISMISSED_KEY, String(Date.now()))
          }
          setState({ kind: 'hidden' })
          return outcome
        },
      })
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // iOS has no programmatic install prompt — show hint if running in Safari
    // and not yet installed. Delay so the banner doesn't race with auth/login.
    let iosTimer: number | undefined
    if (isIOS()) {
      iosTimer = window.setTimeout(() => {
        setState(prev => (prev.kind === 'hidden' ? { kind: 'ios-hint' } : prev))
      }, 1500)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      if (iosTimer) window.clearTimeout(iosTimer)
    }
  }, [])

  return {
    state,
    dismiss: () => {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()))
      setState({ kind: 'hidden' })
    },
  }
}

'use client'

/**
 * NetworkGuard — global client-side safety net.
 *
 * The user-visible goal: "1000+ manush website-e thakleo jeno website
 * kichui na hoi" — a transient network hiccup (server restart, dev-server
 * recompile, proxy blip, or even a browser extension wrapping window.fetch)
 * must NEVER crash the app with a raw "Runtime TypeError: Failed to fetch"
 * overlay.
 *
 * What it does:
 *  - Listens for UNHANDLED promise rejections globally.
 *  - Network-class failures (TypeError: Failed to fetch / Load failed /
 *    NetworkError / AbortError) are swallowed: no crash overlay — instead a
 *    single friendly bilingual toast (throttled to 1 / 8s, so a burst of
 *    failures can't spam the user).
 *  - Every other rejection (real bugs) is left untouched so errors still
 *    surface in dev — this is a safety net for the network, not a mute
 *    button for bugs.
 *
 * All in-app requests already retry with backoff via src/lib/api-client.ts
 * (fetchWithRetry) and every view catches its own load errors — this guard
 * is the last line of defense for paths outside that system (extensions,
 * third-party scripts, long-lived pages crossing a server restart).
 */
import { useEffect } from 'react'
import { toast } from 'sonner'

const NETWORK_MSG =
  'ইন্টারনেট সংযোগে সমস্যা হয়েছিল — পেজটি এখনো ঠিক আছে; যা করতে চেয়েছিলেন আবার চেষ্টা করুন।'
const NETWORK_MSG_EN =
  'A network hiccup occurred — the page is still usable; please retry what you were doing.'

function isNetworkish(reason: unknown): boolean {
  if (reason instanceof DOMException) {
    return reason.name === 'AbortError' || reason.name === 'TimeoutError'
  }
  if (reason instanceof TypeError) return true // "Failed to fetch" / "Load failed" / extension-wrapped fetch
  if (reason instanceof Error) {
    return /failed to fetch|networkerror|load failed|fetch failed|network request failed|internet disconnected/i.test(
      reason.message
    )
  }
  if (typeof reason === 'string') {
    return /failed to fetch|networkerror|load failed|fetch failed/i.test(reason)
  }
  return false
}

export function NetworkGuard() {
  useEffect(() => {
    let lastToastAt = 0

    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      if (!isNetworkish(e.reason)) return // real bugs still surface normally
      e.preventDefault() // no crash overlay — the site stays usable
      const now = Date.now()
      if (now - lastToastAt > 8_000) {
        lastToastAt = now
        const lang =
          typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'bn'
        toast.error(lang === 'en' ? NETWORK_MSG_EN : NETWORK_MSG)
      }
    }

    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }, [])

  return null
}

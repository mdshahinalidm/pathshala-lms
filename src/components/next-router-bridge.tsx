'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { setNextRouter } from '@/store/ui-store'

/**
 * Hands the App Router instance to the ui-store so `go()` (called from
 * zustand stores and event handlers outside React) performs real
 * client-side navigation. Rendered once inside <Providers/>.
 *
 * router.push is wrapped so every programmatic navigation also announces
 * itself (`ps:navigate`) — RouteProgress listens for it to show the instant
 * top progress bar.
 */
export function NextRouterBridge() {
  const router = useRouter()
  useEffect(() => {
    const wrapped = {
      push: (url: string, options?: { scroll?: boolean }) => {
        try {
          window.dispatchEvent(new CustomEvent('ps:navigate', { detail: url }))
        } catch {
          /* noop */
        }
        router.push(url, options)
      },
      replace: (url: string, options?: { scroll?: boolean }) => router.replace(url, options),
      refresh: () => router.refresh(),
    }
    setNextRouter(wrapped)
    return () => setNextRouter(null)
  }, [router])
  return null
}

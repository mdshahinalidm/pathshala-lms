'use client'

/**
 * Route hook — REAL PATH-BASED routing (App Router).
 *
 * Previously this read window.location.hash (#/courses). The app now uses
 * real URLs (/courses, /dashboard, /admin/...), so this hook is a thin
 * adapter over next/navigation's usePathname + useSearchParams.
 * The exported interface (path/segments/query/raw) is unchanged, so every
 * existing view keeps working without modification.
 */

import { useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export interface HashRoute {
  /** e.g. "/courses/abc?x=1" → path: "/courses/abc" */
  path: string
  segments: string[]
  query: URLSearchParams
  raw: string
}

const SERVER_ROUTE: HashRoute = {
  path: '/',
  segments: [],
  query: new URLSearchParams(),
  raw: '/',
}

/**
 * Path router hook (useSyncExternalStore was needed for hash changes;
 * next/navigation already provides an external store, so a memo is enough).
 * SSR-safe: server snapshot is the root route.
 */
export function useHashRoute(): HashRoute {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return useMemo<HashRoute>(() => {
    if (!pathname) return SERVER_ROUTE
    const qs = searchParams?.toString() ?? ''
    return {
      path: pathname,
      segments: pathname.split('/').filter(Boolean),
      query: new URLSearchParams(qs),
      raw: qs ? `${pathname}?${qs}` : pathname,
    }
  }, [pathname, searchParams])
}

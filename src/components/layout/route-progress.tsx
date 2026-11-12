'use client'

/**
 * RouteProgress — permanent fix for "click korle sathe sathe asche na".
 *
 * In dev (and slow networks) a route click triggers an on-demand compile /
 * fetch with ZERO visual feedback, so users click again and again. This bar
 * gives INSTANT feedback the moment any navigation starts, and completes the
 * moment the URL actually changes.
 *
 * Triggers:
 *   1. any same-origin anchor click (capture phase — header, footer, cards)
 *   2. programmatic `go()` navigations (ui-store dispatches `ps:navigate`
 *      via the NextRouterBridge-wrapped router.push)
 *
 * Completion: polled URL change (also covers server redirects), plus a 6s
 * failsafe so the bar can never hang.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toPath } from '@/store/ui-store'

export function RouteProgress() {
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const tick = useRef<ReturnType<typeof setInterval> | null>(null)
  const failsafe = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startUrl = useRef('')
  const finish = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (tick.current) clearInterval(tick.current)
    if (failsafe.current) clearTimeout(failsafe.current)
    tick.current = null
    failsafe.current = null
  }, [])

  const complete = useCallback(() => {
    clearTimers()
    setProgress(100)
    if (finish.current) clearTimeout(finish.current)
    finish.current = setTimeout(() => {
      setVisible(false)
      setTimeout(() => setProgress(0), 300)
    }, 260)
  }, [clearTimers])

  const begin = useCallback(
    (target: string) => {
      if (typeof window === 'undefined') return
      const t = toPath(target)
      const current = window.location.pathname + window.location.search
      if (!t || t === current) return // same-page click → nothing to show
      startUrl.current = current
      if (finish.current) clearTimeout(finish.current)
      setVisible(true)
      setProgress(14)
      if (tick.current) clearInterval(tick.current)
      tick.current = setInterval(() => {
        setProgress((p) => (p < 88 ? p + Math.max(1.5, (90 - p) * 0.09) : p))
      }, 180)
      if (failsafe.current) clearTimeout(failsafe.current)
      failsafe.current = setTimeout(complete, 6000)
    },
    [complete]
  )

  /* 1. anchor clicks (capture — catches every Link on the site) */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.('a')
      if (!a) return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('#') || a.hasAttribute('download') || a.target === '_blank') return
      try {
        const u = new URL(a.href, window.location.origin)
        if (u.origin !== window.location.origin) return
        begin(u.pathname + u.search)
      } catch {
        /* ignore malformed hrefs */
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [begin])

  /* 2. programmatic go() / router.push (dispatched by the bridge) */
  useEffect(() => {
    const onStart = (e: Event) => begin((e as CustomEvent<string>).detail)
    window.addEventListener('ps:navigate', onStart)
    return () => window.removeEventListener('ps:navigate', onStart)
  }, [begin])

  /* completion — URL changed (covers redirects like /dashboard → /login) */
  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => {
      const now = window.location.pathname + window.location.search
      if (now !== startUrl.current) complete()
    }, 90)
    return () => clearInterval(id)
  }, [visible, complete])

  /* cleanup on unmount */
  useEffect(
    () => () => {
      if (tick.current) clearInterval(tick.current)
      if (failsafe.current) clearTimeout(failsafe.current)
      if (finish.current) clearTimeout(finish.current)
    },
    []
  )

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className="grad-brand h-full shadow-[0_0_10px_rgba(16,185,129,0.65)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}

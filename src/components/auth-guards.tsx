'use client'

/**
 * Client-side route guards used by the dashboard/admin layouts.
 * (Edge proxy + server gates already block unauthenticated page requests;
 *  these cover client navigations and role mismatches with proper UX.)
 *
 * ── BOUNCE-GUARD (permanent anti-ping-pong guarantee) ────────────────────
 * Every automatic redirect performed here is recorded per-target in
 * sessionStorage. If the SAME guard is about to auto-redirect to the SAME
 * target again within 5 seconds (i.e. something upstream bounced us right
 * back), the guard STOPS redirecting and shows a "session expired" screen
 * with a manual button instead. An automatic redirect loop is therefore
 * structurally impossible — for ANY future auth-rule change upstream.
 */

import { useEffect, useState } from 'react'
import { GraduationCap, LogIn, ShieldAlert, ShieldX } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/store/auth-store'
import { useUI, go } from '@/store/ui-store'
import { isPanelRole } from '@/lib/roles'

const BOUNCE_WINDOW_MS = 5000

/** Record a redirect attempt; false when it would ping-pong back & forth. */
function mayAutoRedirect(target: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    const key = 'ps-bounce:' + target
    const last = Number(window.sessionStorage.getItem(key) || 0)
    if (Date.now() - last < BOUNCE_WINDOW_MS) return false
    window.sessionStorage.setItem(key, String(Date.now()))
    return true
  } catch {
    return true
  }
}

function FullScreenLoader() {
  const { t } = useUI()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground"
      >
        <GraduationCap className="h-7 w-7" />
      </motion.span>
      <p className="text-sm text-muted-foreground">{t('loading')}</p>
    </div>
  )
}

/** Shown instead of auto-redirecting when a bounce is detected. */
function SessionExpired({ adminArea }: { adminArea?: boolean }) {
  const { tx } = useUI()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
        <ShieldAlert className="h-8 w-8" />
      </span>
      <h1 className="text-2xl font-bold">{tx('সেশনের মেয়াদ শেষ', 'Session expired')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {tx(
          'নিরাপত্তার জন্য অনুগ্রহ করে আবার লগইন করুন।',
          'For security, please log in again.'
        )}
      </p>
      <Button onClick={() => go(adminArea ? '/admin' : '/login')}>
        <LogIn className="h-4 w-4" />
        {tx('লগইন করুন', 'Go to Login')}
      </Button>
    </div>
  )
}

function AccessDenied() {
  const { tx } = useUI()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <ShieldX className="h-8 w-8" />
      </span>
      <h1 className="text-2xl font-bold">{tx('অ্যাডমিন অ্যাক্সেস প্রয়োজন', 'Admin access required')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {tx(
          'এই পেজটি দেখতে আপনার সংশ্লিষ্ট অনুমতি নেই। অনুগ্রহ করে সঠিক একাউন্ট দিয়ে লগইন করুন।',
          'You do not have permission to view this page. Please log in with the appropriate account.'
        )}
      </p>
      <Button onClick={() => go('/login')}>{tx('লগইন করুন', 'Go to Login')}</Button>
    </div>
  )
}

/** Requires any authenticated user (student or admin). */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth()
  const [bounced, setBounced] = useState(false)

  useEffect(() => {
    if (status !== 'unauthenticated') return
    const target = '/login?next=' + encodeURIComponent(window.location.pathname)
    if (mayAutoRedirect(target)) {
      go(target)
    } else {
      // Defer so the flag is set outside the synchronous effect pass.
      queueMicrotask(() => setBounced(true))
    }
  }, [status])

  if (status === 'unauthenticated') return bounced ? <SessionExpired /> : <FullScreenLoader />
  if (status === 'loading' || !user) return <FullScreenLoader />
  return <>{children}</>
}

/** Requires an ADMIN session. Unauthenticated users land on the /admin login gate. */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth()
  const [bounced, setBounced] = useState(false)

  useEffect(() => {
    if (status !== 'unauthenticated') return
    const target = '/admin?next=' + encodeURIComponent(window.location.pathname)
    if (mayAutoRedirect(target)) {
      go(target)
    } else {
      // Defer so the flag is set outside the synchronous effect pass.
      queueMicrotask(() => setBounced(true))
    }
  }, [status])

  if (status === 'unauthenticated') return bounced ? <SessionExpired adminArea /> : <FullScreenLoader />
  if (status === 'loading' || !user) return <FullScreenLoader />
  if (!isPanelRole(user.role)) return <AccessDenied />
  return <>{children}</>
}

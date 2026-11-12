import { Suspense } from 'react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AUTH_COOKIE } from '@/lib/auth-jwt'
import { resolveSessionUser } from '@/lib/auth-session'
import { isPanelRole } from '@/lib/roles'
import AdminLoginView from '@/components/views/admin/admin-login-view'

export const metadata: Metadata = {
  title: 'অ্যাডমিন লগইন | Admin Login',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * /admin — THE ADMIN GATE.
 *  - No session           → dedicated Admin Login screen (this URL).
 *  - ADMIN/MANAGER/MODERATOR session → straight into the panel dashboard.
 *  - STUDENT session      → bounced to the student dashboard.
 *
 * ── ROOT-CAUSE FIX (infinite load/redirect loop) ─────────────────────────
 * This gate used to trust the JWT signature only, while the APIs enforce
 * the full DB-backed rule (device-session limiting via activeSessionId).
 * When they disagreed (stale sid after a newer login elsewhere), the gate
 * redirected to /admin/dashboard, the client guard bounced back here, and
 * the two kept ping-ponging forever. resolveSessionUser applies the SAME
 * full rule as every API, so: invalid/stale session → SHOW THE LOGIN
 * SCREEN (never redirect) — a redirect loop is structurally impossible.
 */
export default async function AdminGatePage() {
  const store = await cookies()
  const token = store.get(AUTH_COOKIE)?.value
  const user = await resolveSessionUser(token)

  if (user) {
    // Every panel role (ADMIN / MANAGER / MODERATOR) enters the panel;
    // students bounce to their own dashboard.
    redirect(isPanelRole(user.role) ? '/admin/dashboard' : '/dashboard')
  }

  return (
    <Suspense fallback={null}>
      <AdminLoginView />
    </Suspense>
  )
}

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'অ্যাডমিন লগইন | Admin Login',
  robots: { index: false, follow: false },
}

/**
 * /admin/login — legacy/typed-in alias for the admin gate.
 *
 * ROOT-CAUSE FIX (post-login 404):
 * The edge guard funnels every unauthenticated /admin/* request to the
 * login screen at /admin while remembering the original path as ?next=….
 * When someone landed on /admin/login that way, a successful login then
 * redirected them back to /admin/login — a route that never existed —
 * and they hit the 404 page right after signing in.
 *
 * This alias closes that trap: it simply forwards to /admin, which is the
 * real gate (login screen when signed out, dashboard when signed in).
 * The middleware still guards it for anonymous visitors, so this page is
 * only ever rendered for authenticated users mid-redirect.
 */
export default function AdminLoginAliasPage() {
  redirect('/admin')
}

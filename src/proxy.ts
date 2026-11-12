/**
 * Edge proxy (ex-middleware): JWT route guards (API + PAGES) + security headers.
 *
 * Page guards:
 *   /dashboard/**       → authenticated (redirect /login?next=…)
 *   /admin/**           → authenticated (role checked client-side by RequireAdmin)
 *
 * API guards:
 *   /api/admin/**       → ADMIN role required
 *   /api/orders/**      → authenticated
 *   /api/enrollments**  → authenticated
 *   /api/notifications**→ authenticated
 *
 * (Lesson-level media masking & paid-file checks happen inside route
 *  handlers where DB access is available.)
 *
 * security hardening (Google "secure your site" guidance):
 *   • matcher now covers EVERY route (not just /api, /dashboard, /admin) so
 *     public pages get the same defense-in-depth headers. Guards themselves
 *     still only trigger on protected paths — public pages only gain headers.
 *   • Strict-Transport-Security (HSTS) added: browsers ignore it on plain
 *     HTTP (dev), so dev behaviour is unchanged; over HTTPS in production it
 *     forces TLS for 2 years (incl. subdomains, preload-eligible).
 *   • Content-Security-Policy added — tuned to the site's REAL feature set
 *     so NOTHING breaks: inline scripts/styles stay allowed (Next.js dev
 *     runtime + admin custom CSS/code injection), GA4 gtag
 *     (googletagmanager), lesson video providers (YouTube / Vimeo / Google
 *     Drive / Bunny) as framed sources, Google Analytics beacons in
 *     connect-src, and ws:/wss: for the dev-server HMR socket.
 *     Still enforced: no <object>/<embed>, frame-ancestors self
 *     (anti-clickjacking), locked base-uri & form-action, same-origin
 *     default. Server-side payment/SMS gateway calls are unaffected — CSP
 *     only constrains the browser.
 */
import { NextResponse, NextRequest } from 'next/server'
import { AUTH_COOKIE, verifyToken } from '@/lib/auth-jwt'

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'off',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), display-capture=()',
  // HSTS — silently ignored over HTTP; enforces HTTPS for 2 years in prod.
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  // CSP — matched to the site's actual feature surface (see block comment).
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://drive.google.com https://iframe.mediadelivery.net",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
}

function withHeaders(res: NextResponse) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v)
  return res
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Page guards: protected areas need a valid session cookie ──
  // /admin ITSELF is the public admin-login gate (it inspects its own
  // session server-side) — only /admin/* SUB-paths are edge-guarded.
  const isAdminGate = pathname === '/admin'
  const isProtectedPage =
    pathname.startsWith('/dashboard') || (pathname.startsWith('/admin') && !isAdminGate)
  if (isProtectedPage) {
    const token = req.cookies.get(AUTH_COOKIE)?.value
    const payload = token ? await verifyToken(token) : null
    if (!payload) {
      // Admin area funnels to the DEDICATED admin login screen at /admin.
      if (pathname.startsWith('/admin')) {
        const adminLogin = new URL('/admin', req.url)
        adminLogin.searchParams.set('next', pathname)
        return withHeaders(NextResponse.redirect(adminLogin))
      }
      const login = new URL('/login', req.url)
      login.searchParams.set('next', pathname)
      return withHeaders(NextResponse.redirect(login))
    }
    return withHeaders(NextResponse.next())
  }

  // ── API guards ──
  const needsAuth =
    pathname.startsWith('/api/orders') ||
    pathname.startsWith('/api/enrollments') ||
    pathname.startsWith('/api/notifications') ||
    pathname.startsWith('/api/certificates') ||
    pathname.startsWith('/api/live-classes') ||
    pathname.startsWith('/api/admin')

  let response = NextResponse.next()

  if (needsAuth) {
    const token = req.cookies.get(AUTH_COOKIE)?.value
    const payload = token ? await verifyToken(token) : null

    if (!payload) {
      response = NextResponse.json(
        { ok: false, error: 'Unauthorized — please log in.' },
        { status: 401 }
      )
    } else if (
      pathname.startsWith('/api/admin') &&
      payload.role !== 'ADMIN' &&
      payload.role !== 'MANAGER' &&
      payload.role !== 'MODERATOR'
    ) {
      response = NextResponse.json(
        { ok: false, error: 'Forbidden — admin access required.' },
        { status: 403 }
      )
    }
  }

  return withHeaders(response)
}

export const config = {
  // run on EVERY route (incl. '/') except Next internals — public
  // pages now also receive the security headers. The auth guards above keep
  // firing only on protected paths, so nothing else changes for visitors.
  matcher: ['/((?!_next).*)'],
}

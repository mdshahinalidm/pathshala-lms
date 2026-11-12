/**
 * THE single source of truth for resolving a session from a JWT token
 * (Node/server runtime — DB-backed).
 *
 * ── ROOT-CAUSE FIX: admin panel infinite load/redirect loop ──────────────
 * Previously the /admin gate (and proxy) validated the JWT SIGNATURE only,
 * while every API (via getAuthUser) ADDITIONALLY enforced device-session
 * limiting (User.activeSessionId vs jwt.sid). When the two rules disagreed
 * — e.g. the cookie's sid went stale after a newer login on another
 * device/browser — the gate kept bouncing the user into /admin/dashboard
 * while the client guard kept bouncing them back to the login gate: an
 * infinite reload loop (page constantly "loading"/flickering).
 *
 * EVERY server-side session check MUST go through resolveSessionUser so
 * the gate and the APIs can never disagree again. The rule set:
 *   1. JWT signature / expiry / issuer valid
 *   2. user exists in DB and is not blocked
 *   3. device-session limiting: when both the user record and the token
 *      carry a session id, they must match (latest login wins)
 *
 * NOTE: src/proxy.ts (edge) intentionally stays a cheap JWT-only FIRST
 * FILTER (no DB access at the edge) — it can never cause a loop because
 * the /admin gate below now renders the login screen instead of bouncing
 * whenever the full DB-backed check fails.
 */
import { db } from '@/lib/db'
import { verifyToken } from '@/lib/auth-jwt'
import type { AuthUser } from '@/lib/api-helpers'

export async function resolveSessionUser(
  token: string | null | undefined
): Promise<AuthUser | null> {
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null

  const user = await db.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isVerified: true,
      isBlocked: true,
      activeSessionId: true,
      avatarUrl: true,
      studentClass: true,
      institution: true,
    },
  })
  if (!user || user.isBlocked) return null

  // ── Device limiting: if the user logged in elsewhere afterwards, this
  // session's sid no longer matches → force re-auth (account sharing block).
  if (user.activeSessionId && payload.sid && payload.sid !== user.activeSessionId) return null

  const { activeSessionId: _ignored, ...safe } = user
  return safe
}

/**
 * POST /api/auth/login
 * identifier (email OR phone) + password.
 *  - wrong credentials → 401
 *  - blocked account   → 403
 *  - unverified        → fresh OTP issued through the REAL channel (needsOtp;
 *                        devOtp only in demo mode when no provider configured)
 *  - verified          → JWT auth cookie set (auto-login), {user} returned
 */
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db'
import { AUTH_COOKIE, authCookieOptions, signToken } from '@/lib/auth-jwt'
import { fail, isResponse, ok, parseBody, rateLimit } from '@/lib/api-helpers'
import { issueOtp } from '@/lib/otp'

/**
 * Normalize a login identifier: lower-case emails; BD mobile numbers typed
 * as +8801XXXXXXXXX / 8801XXXXXXXXX / 017 1234 5678 become 01XXXXXXXXX.
 */
function normalizeIdentifier(raw: string): string {
  const v = raw.trim().toLowerCase()
  if (v.includes('@')) return v
  const digits = v.replace(/[\s-]/g, '').replace(/^\+?88/, '')
  return /^01[3-9]\d{8}$/.test(digits) ? digits : v
}

const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Email or phone required').max(120),
  password: z.string().min(1, 'Password required').max(72),
})

export async function POST(req: Request) {
  try {
    const limited = rateLimit(req, 'auth-login', 8, 60_000)
    if (limited) return limited

    const parsed = await parseBody(req, loginSchema)
    if (isResponse(parsed)) return parsed

    const identifier = normalizeIdentifier(parsed.identifier)
    const user = await db.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    })
    if (!user) return fail('Incorrect credentials', 401)

    const passwordOk = await bcrypt.compare(parsed.password, user.passwordHash)
    if (!passwordOk) return fail('Incorrect credentials', 401)

    if (user.isBlocked) return fail('Account blocked', 403)

    if (!user.isVerified) {
      // Issue a fresh OTP through the real channel; the client transitions to
      // the verification step.
      const otpIdentifier = user.email ?? (user.phone as string)
      const issued = await issueOtp(otpIdentifier, user.name)
      return ok({ needsOtp: true, identifier: otpIdentifier, delivered: issued.delivered, devOtp: issued.devCode })
    }

    // ── Device limiting: a fresh login invalidates every older session ──
    // The sid is embedded in the JWT and checked against User.activeSessionId
    // on every authenticated request (see getAuthUser in api-helpers).
    const sid = crypto.randomUUID()
    await db.user.update({ where: { id: user.id }, data: { activeSessionId: sid } })

    const jwt = await signToken({
      sub: user.id,
      // Real role (STUDENT | ADMIN | MANAGER | MODERATOR) — proxy/APIs authorize on it.
      role: user.role === 'ADMIN' || user.role === 'MANAGER' || user.role === 'MODERATOR' ? user.role : 'STUDENT',
      name: user.name,
      sid,
    })
    const res = ok({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
        avatarUrl: user.avatarUrl,
        studentClass: user.studentClass,
        institution: user.institution,
      },
    })
    res.cookies.set(AUTH_COOKIE, jwt, authCookieOptions())
    return res
  } catch (err) {
    console.error('[POST /api/auth/login]', err)
    return fail('Server error', 500)
  }
}

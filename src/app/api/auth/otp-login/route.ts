/**
 * POST /api/auth/otp-login — passwordless login with a 6-digit OTP.
 *
 * Flow (login page → "OTP লগইন" tab):
 *   1. {identifier: phone-or-email}          → OTP issued through the REAL
 *      channel (SMS for BD phones / SMTP email for addresses); devOtp only
 *      in demo mode when no provider is configured.
 *   2. {identifier, code} → verified against OtpToken → JWT cookie set.
 *
 * Only EXISTING accounts can OTP-login (registration keeps its own flow).
 * Rate limits: 5 requests/min per IP; 5 wrong attempts kill the token.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { AUTH_COOKIE, authCookieOptions, signToken } from '@/lib/auth-jwt'
import { fail, isResponse, ok, rateLimit } from '@/lib/api-helpers'
import { issueOtp, MAX_OTP_ATTEMPTS } from '@/lib/otp'

/** Same normalization as the login route (emails lower-cased, +880 stripped). */
function normalizeIdentifier(raw: string): string {
  const v = raw.trim().toLowerCase()
  if (v.includes('@')) return v
  const digits = v.replace(/[\s-]/g, '').replace(/^\+?88/, '')
  return /^01[3-9]\d{8}$/.test(digits) ? digits : v
}

const verifySchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  code: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
})

export async function POST(req: Request) {
  try {
    const limited = rateLimit(req, 'auth-otp-login', 5, 60_000)
    if (limited) return limited

    // the admin can switch the "OTP দিয়ে লগইন" option off from
    // Settings — the API enforces the toggle too (UI hiding is not enough).
    const site = await db.siteSetting.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    })
    if (!site.otpLoginEnabled) {
      return fail(
        'OTP লগইন অপশনটি এখন বন্ধ আছে — পাসওয়ার্ড দিয়ে লগইন করুন। (OTP login is currently disabled — please log in with your password.)',
        403,
      )
    }

    const body = (await req.json().catch(() => null)) as { identifier?: string; code?: string } | null
    if (!body || typeof body.identifier !== 'string') {
      return fail('Email or phone required', 400)
    }

    const identifier = normalizeIdentifier(body.identifier)
    const user = await db.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    })
    if (!user) {
      return fail(
        'এই ইমেইল/নম্বরে কোনো অ্যাকাউন্ট নেই — আগে রেজিস্ট্রেশন করুন। (No account with this email/number — please register first.)',
        404,
      )
    }
    if (user.isBlocked) return fail('Account blocked', 403)

    // ── Step 2: code verification → login ──
    if (typeof body.code === 'string' && body.code) {
      const parsed = verifySchema.safeParse({ identifier, code: body.code })
      if (!parsed.success) return fail('OTP must be exactly 6 digits', 400)

      const otp = await db.otpToken.findFirst({
        where: { identifier, consumed: false },
        orderBy: { createdAt: 'desc' },
      })
      if (!otp) return fail('কোনো সক্রিয় OTP নেই — নতুন কোড নিন। (No active OTP — request a new one.)', 400)
      if (otp.expiresAt.getTime() <= Date.now()) {
        return fail('OTP-র মেয়াদ শেষ — নতুন কোড নিন। (OTP expired — request a new one.)', 400)
      }
      if (otp.attempts >= MAX_OTP_ATTEMPTS) {
        await db.otpToken.update({ where: { id: otp.id }, data: { consumed: true } })
        return fail('অনেকবার ভুল কোড — নতুন OTP নিন। (Too many wrong attempts — request a new OTP.)', 429)
      }
      if (otp.code !== parsed.data.code) {
        const updated = await db.otpToken.update({ where: { id: otp.id }, data: { attempts: otp.attempts + 1 } })
        const left = Math.max(0, MAX_OTP_ATTEMPTS - updated.attempts)
        return fail(
          left > 0
            ? `ভুল OTP — আবার চেষ্টা করুন (বাকি ${left} বার)। (Invalid OTP — ${left} attempt${left === 1 ? '' : 's'} left.)`
            : 'অনেকবার ভুল কোড — নতুন OTP নিন। (Too many wrong attempts — request a new OTP.)',
          400,
        )
      }
      await db.otpToken.update({ where: { id: otp.id }, data: { consumed: true } })

      // OTP login also proves channel ownership → unverified accounts get verified.
      await db.user.update({ where: { id: user.id }, data: { isVerified: true } })

      // ── Device limiting: a real login → rotate the session ──
      const sid = crypto.randomUUID()
      await db.user.update({ where: { id: user.id }, data: { activeSessionId: sid } })

      const jwt = await signToken({
        sub: user.id,
        // Panel roles keep their real role (fixes MANAGER/MODERATOR downcast).
        role:
          user.role === 'ADMIN' || user.role === 'MANAGER' || user.role === 'MODERATOR'
            ? user.role
            : 'STUDENT',
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
          isVerified: true,
        },
      })
      res.cookies.set(AUTH_COOKIE, jwt, authCookieOptions())
      return res
    }

    // ── Step 1: request an OTP ──
    const issued = await issueOtp(identifier, user.name)
    return ok({ needsOtp: true, identifier, delivered: issued.delivered, devOtp: issued.devCode })
  } catch (err) {
    console.error('[POST /api/auth/otp-login]', err)
    return fail('Server error', 500)
  }
}

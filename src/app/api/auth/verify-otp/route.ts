/**
 * POST /api/auth/verify-otp
 * Verifies the 6-digit OTP, marks the user verified, creates a welcome
 * notification (FIRST verification only) and AUTO-LOGS the user in.
 *
 * Security:
 *  - wrong code  → increments the token's attempt counter; after 5 wrong
 *                  attempts the token is consumed (dead) — request a new one
 *  - expired     → distinct "OTP expired" message, request a new one
 *  - rate limit  → 10 requests / minute / IP (plus per-route attempt cap)
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { AUTH_COOKIE, authCookieOptions, signToken } from '@/lib/auth-jwt'
import { fail, isResponse, ok, parseBody, rateLimit } from '@/lib/api-helpers'
import { MAX_OTP_ATTEMPTS } from '@/lib/otp'

const verifySchema = z.object({
  identifier: z.string().trim().min(3, 'Identifier required').max(120),
  code: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
})

export async function POST(req: Request) {
  try {
    const limited = rateLimit(req, 'auth-verify-otp', 10, 60_000)
    if (limited) return limited

    const parsed = await parseBody(req, verifySchema)
    if (isResponse(parsed)) return parsed

    const identifier = parsed.identifier.toLowerCase() // no-op for phone numbers

    const otp = await db.otpToken.findFirst({
      where: { identifier, consumed: false },
      orderBy: { createdAt: 'desc' },
    })
    if (!otp) return fail('কোনো সক্রিয় OTP নেই — নতুন কোড নিন। (No active OTP — request a new one.)', 400)
    if (otp.expiresAt.getTime() <= Date.now()) {
      return fail('OTP-র মেয়াদ শেষ হয়ে গেছে — নতুন কোড নিন। (OTP expired — request a new one.)', 400)
    }
    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      await db.otpToken.update({ where: { id: otp.id }, data: { consumed: true } })
      return fail('অনেকবার ভুল কোড দেওয়া হয়েছে — নতুন OTP নিন। (Too many wrong attempts — request a new OTP.)', 429)
    }
    if (otp.code !== parsed.code) {
      const attempts = otp.attempts + 1
      await db.otpToken.update({ where: { id: otp.id }, data: { attempts } })
      const left = MAX_OTP_ATTEMPTS - attempts
      return fail(
        left > 0
          ? `ভুল OTP — আবার চেষ্টা করুন (বাকি ${left} বার)। (Invalid OTP — try again, ${left} attempt${left === 1 ? '' : 's'} left.)`
          : 'অনেকবার ভুল কোড দেওয়া হয়েছে — নতুন OTP নিন। (Too many wrong attempts — request a new OTP.)',
        400,
      )
    }

    await db.otpToken.update({ where: { id: otp.id }, data: { consumed: true } })

    const user = await db.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    })
    if (!user) return fail('Account not found. Please register again.', 404)
    if (user.isBlocked) return fail('Account blocked', 403)

    const firstVerification = !user.isVerified
    await db.user.update({ where: { id: user.id }, data: { isVerified: true } })

    if (firstVerification) {
      await db.notification.create({
        data: {
          userId: user.id,
          type: 'GENERAL',
          title: `🎉 স্বাগতম, ${user.name}!`,
          body: 'আপনার অ্যাকাউন্ট সফলভাবে যাচাই হয়েছে। PathShala-তে শেখার যাত্রা আজই শুরু করুন!',
          link: '/',
        },
      })
    }

    // ── Device limiting: OTP login is a real login → rotate the session ──
    const sid = crypto.randomUUID()
    await db.user.update({ where: { id: user.id }, data: { activeSessionId: sid } })

    const jwt = await signToken({
      sub: user.id,
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
        isVerified: true,
        avatarUrl: user.avatarUrl,
        studentClass: user.studentClass,
        institution: user.institution,
      },
    })
    res.cookies.set(AUTH_COOKIE, jwt, authCookieOptions())
    return res
  } catch (err) {
    console.error('[POST /api/auth/verify-otp]', err)
    return fail('Server error', 500)
  }
}

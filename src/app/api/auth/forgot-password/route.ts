/**
 * POST /api/auth/forgot-password — OTP-verified password reset ("Forgot password?").
 *
 * Flow (login page → "পাসওয়ার্ড ভুলে গেছেন?"):
 *   Step 1  {identifier}
 *             → account is looked up by email/phone (same normalization as
 *               login) and a 6-digit OTP is issued through the REAL channel
 *               (SMS gateway for BD phones / SMTP email for addresses);
 *               `devOtp` is only returned in demo mode when no provider is
 *               configured. Previous unconsumed tokens are invalidated.
 *   Step 2  {identifier, code, newPassword}
 *             → OTP verified against OtpToken (5 wrong attempts kill the
 *               token, 10-minute TTL), the new password is re-hashed with
 *               bcrypt (same cost as register) and every previous session is
 *               revoked by rotating activeSessionId.
 *
 * Rate limits: 5 requests/min per IP (plus the OTP attempt cap).
 */
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { fail, ok, rateLimit } from '@/lib/api-helpers'
import { issueOtp, MAX_OTP_ATTEMPTS } from '@/lib/otp'

/** Same normalization as the login/otp-login routes (emails lower-cased, +880 stripped). */
function normalizeIdentifier(raw: string): string {
  const v = raw.trim().toLowerCase()
  if (v.includes('@')) return v
  const digits = v.replace(/[\s-]/g, '').replace(/^\+?88/, '')
  return /^01[3-9]\d{8}$/.test(digits) ? digits : v
}

const resetSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  code: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters with a letter and a digit')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[A-Za-z]/, 'Password must be at least 8 characters with a letter and a digit')
    .regex(/\d/, 'Password must be at least 8 characters with a letter and a digit'),
})

export async function POST(req: Request) {
  try {
    const limited = rateLimit(req, 'auth-forgot-password', 5, 60_000)
    if (limited) return limited

    const body = (await req.json().catch(() => null)) as
      | { identifier?: string; code?: string; newPassword?: string }
      | null
    if (!body || typeof body.identifier !== 'string') {
      return fail('Email or phone required', 400)
    }

    const identifier = normalizeIdentifier(body.identifier)
    const user = await db.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    })
    if (!user) {
      return fail(
        'এই ইমেইল/নম্বরে কোনো অ্যাকাউন্ট নেই। (No account found with this email/number.)',
        404,
      )
    }
    if (user.isBlocked) return fail('Account blocked', 403)

    // ── Step 2: verify OTP + reset the password ──
    if (typeof body.code === 'string' && body.code) {
      const parsed = resetSchema.safeParse({
        identifier,
        code: body.code,
        newPassword: typeof body.newPassword === 'string' ? body.newPassword : '',
      })
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? 'Invalid data', 400)
      }

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

      // The OTP proved channel ownership → store the bcrypt-hashed new
      // password and rotate the session id so every previous login is revoked.
      const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10)
      await db.user.update({
        where: { id: user.id },
        data: { passwordHash, activeSessionId: crypto.randomUUID() },
      })

      return ok({ reset: true })
    }

    // ── Step 1: request an OTP ──
    const issued = await issueOtp(identifier, user.name)
    return ok({ needsOtp: true, identifier, delivered: issued.delivered, devOtp: issued.devCode })
  } catch (err) {
    console.error('[POST /api/auth/forgot-password]', err)
    return fail('Server error', 500)
  }
}

/**
 * POST /api/auth/otp-request
 * Sends a REAL 6-digit OTP to an EXISTING account's email (SMTP) or
 * phone (SMS gateway). Powers both "Login with OTP" and registration
 * resend.
 *
 * DESIGN NOTE — delivery failures return HTTP 200 with { sent:false, reason }
 * instead of 4xx/5xx: a misconfigured SMTP/SMS gateway is an admin-side
 * condition, not a client error. The auth screen renders `reason` verbatim
 * in a destructive alert so the exact provider error is visible and the
 * flow stays recoverable via the resend button.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, rateLimit } from '@/lib/api-helpers'
import { issueOtp, isEmail } from '@/lib/otp'

const schema = z.object({
  identifier: z.string().trim().min(3, 'Email or phone required').max(120),
})

export async function POST(req: Request) {
  try {
    const limited = rateLimit(req, 'auth-otp-req', 5, 60_000)
    if (limited) return limited

    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    const identifier = parsed.identifier.trim()
    if (!identifier) {
      return fail('সঠিক ইমেইল বা মোবাইল নম্বর দিন (Enter a valid email or mobile number)', 422)
    }

    const user = await db.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    })
    if (!user) {
      return fail(
        'এই ইমেইল/নম্বরে অ্যাকাউন্ট নেই — আগে রেজিস্ট্রেশন করুন ' +
          '(No account found for this email/number — please register first)',
        404
      )
    }
    if (user.isBlocked) return fail('এই অ্যাকাউন্ট ব্লক করা হয়েছে (This account is blocked)', 403)

    // Use the account's primary identifier so verify-otp's lookup matches.
    const otpIdentifier = user.email ?? (user.phone as string)

    try {
      const issued = await issueOtp(otpIdentifier, user.name)
      return ok({ sent: true, channel: isEmail(otpIdentifier) ? 'email' : 'sms', identifier: otpIdentifier, devOtp: issued.devCode })
    } catch (err) {
      console.error('[POST /api/auth/otp-request] delivery failed:', err)
      return ok({
        sent: false,
        channel: isEmail(otpIdentifier) ? 'email' : 'sms',
        identifier: otpIdentifier,
        reason: err instanceof Error ? err.message : 'OTP পাঠানো যায়নি (Delivery failed)',
      })
    }
  } catch (err) {
    console.error('[POST /api/auth/otp-request]', err)
    return fail('Server error', 500)
  }
}

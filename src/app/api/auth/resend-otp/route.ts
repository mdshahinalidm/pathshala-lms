/**
 * POST /api/auth/resend-otp — clean OTP resend for BOTH flows.
 * {identifier, flow: 'register'|'login'} → fresh OTP through the real channel.
 * The register flow re-sends for the UNREGISTERED-but-created account
 * (the account already exists after step 1); login flow re-sends for any
 * existing user. Rate-limited 3/min, tokens older ones are invalidated.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, rateLimit } from '@/lib/api-helpers'
import { issueOtp } from '@/lib/otp'

const resendSchema = z.object({
  identifier: z.string().trim().min(3, 'Identifier required').max(120),
  flow: z.enum(['register', 'login', 'otp-login']).default('register'),
})

export async function POST(req: Request) {
  try {
    const limited = rateLimit(req, 'auth-resend-otp', 3, 60_000)
    if (limited) return limited

    const parsed = await parseBody(req, resendSchema)
    if (isResponse(parsed)) return parsed

    const identifier = parsed.identifier.toLowerCase()
    const user = await db.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    })

    // register flow: the account row already exists (created in step 1) —
    // but be tolerant if it does not (e.g. server restart between steps).
    if (parsed.flow === 'register' && !user) {
      const issued = await issueOtp(identifier)
      return ok({ needsOtp: true, identifier, delivered: issued.delivered, devOtp: issued.devCode })
    }

    if (!user) return fail('Account not found', 404)
    if (user.isBlocked) return fail('Account blocked', 403)

    const issued = await issueOtp(identifier, user.name)
    return ok({ needsOtp: true, identifier, delivered: issued.delivered, devOtp: issued.devCode })
  } catch (err) {
    console.error('[POST /api/auth/resend-otp]', err)
    return fail('Server error', 500)
  }
}

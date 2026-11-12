/**
 * POST /api/auth/register-otp passwordless PHONE-OTP registration.
 *
 * Lets a student open an account with just their phone number + a 6-digit OTP
 * (no password needed at signup). Admin can switch the whole option off from
 * Settings → "ফোন OTP দিয়ে অ্যাকাউন্ট খুলুন" (otpRegisterEnabled) — the API
 * enforces the toggle too, hiding the UI is not enough.
 *
 * Two steps on one endpoint (mirrors /api/auth/otp-login):
 *   1. {name, phone, studentClass, email?} → validates the data, checks the
 *      phone/email are free, issues an OTP to the phone. The pending
 *      registration payload is persisted server-side on the OtpToken row
 *      (meta JSON) so it CANNOT be tampered with between the steps.
 *   2. {phone, code} → verifies the OTP, creates the verified STUDENT
 *      account and auto-logs in (JWT cookie), same as /verify-otp.
 *
 * Demo mode: when no SMS gateway is configured the response carries `devOtp`
 * so the sandbox UI can complete the flow.
 */
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db'
import { AUTH_COOKIE, authCookieOptions, signToken } from '@/lib/auth-jwt'
import { fail, ok, rateLimit, sanitize } from '@/lib/api-helpers'
import { issueOtp, MAX_OTP_ATTEMPTS } from '@/lib/otp'
import { isValidClass } from '@/lib/student-classes'

/** Normalize a BD mobile to 01XXXXXXXXX (null when it cannot be one). */
function normalizeBdPhone(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const digits = v.replace(/[\s-]/g, '').replace(/^\+?88/, '')
  return /^01[3-9]\d{8}$/.test(digits) ? digits : null
}

function emptyToUndefined(v: unknown): unknown {
  return typeof v === 'string' && v.trim() === '' ? undefined : v
}

const requestSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name too long'),
  phone: z.preprocess(
    (v) => {
      const u = emptyToUndefined(v)
      if (u === undefined) return undefined
      return normalizeBdPhone(u) ?? u // keep raw so zod prints its message
    },
    z.string().regex(
      /^01[3-9]\d{8}$/,
      'সঠিক মোবাইল নম্বর দিন (যেমন 01712345678 — +880/880 ফরম্যাটও চলবে) | Invalid Bangladeshi mobile number',
    ),
  ),
  studentClass: z.string().refine(isValidClass, 'শ্রেণি/বর্ষ নির্বাচন করুন | Select your class'),
  email: z.preprocess(
    emptyToUndefined,
    z.string().trim().toLowerCase().email('Invalid email address').max(120).optional(),
  ),
})

const verifySchema = z.object({
  phone: z.string().trim().min(3).max(120),
  code: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
})

/** Pending-registration payload persisted on the OtpToken row. */
interface PendingMeta {
  flow: 'register-otp'
  name: string
  email?: string
  studentClass?: string
}

export async function POST(req: Request) {
  try {
    const limited = rateLimit(req, 'auth-register-otp', 5, 60_000)
    if (limited) return limited

    // the admin can switch this option off from Settings.
    const site = await db.siteSetting.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    })
    if (!site.otpRegisterEnabled) {
      return fail(
        'এই অপশনটি এখন বন্ধ আছে — সাধারণ রেজিস্ট্রেশন ব্যবহার করুন। (This option is currently disabled — please use the standard registration.)',
        403,
      )
    }

    // Read the body ONCE (a Request body can only be consumed a single time).
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null

    // ── Step 2: verify the code → create the account → auto-login ──
    if (body && typeof body.phone === 'string' && typeof body.code === 'string' && body.code) {
      const parsed = verifySchema.safeParse({ phone: body.phone, code: body.code })
      if (!parsed.success) return fail('OTP must be exactly 6 digits', 400)

      const phone = normalizeBdPhone(parsed.data.phone) ?? parsed.data.phone
      const otp = await db.otpToken.findFirst({
        where: { identifier: phone, consumed: false },
        orderBy: { createdAt: 'desc' },
      })
      if (!otp || !otp.meta) {
        return fail('কোনো সক্রিয় OTP নেই — আবার চেষ্টা করুন। (No active OTP — please start again.)', 400)
      }
      if (otp.expiresAt.getTime() <= Date.now()) {
        return fail('OTP-র মেয়াদ শেষ — নতুন কোড নিন। (OTP expired — request a new one.)', 400)
      }
      if (otp.attempts >= MAX_OTP_ATTEMPTS) {
        await db.otpToken.update({ where: { id: otp.id }, data: { consumed: true } })
        return fail('অনেকবার ভুল কোড — নতুন OTP নিন। (Too many wrong attempts — request a new OTP.)', 429)
      }
      if (otp.code !== parsed.data.code) {
        const updated = await db.otpToken.update({
          where: { id: otp.id },
          data: { attempts: otp.attempts + 1 },
        })
        const left = Math.max(0, MAX_OTP_ATTEMPTS - updated.attempts)
        return fail(
          left > 0
            ? `ভুল OTP — আবার চেষ্টা করুন (বাকি ${left} বার)। (Invalid OTP — ${left} attempt${left === 1 ? '' : 's'} left.)`
            : 'অনেকবার ভুল কোড — নতুন OTP নিন। (Too many wrong attempts — request a new OTP.)',
          400,
        )
      }

      // Restore the server-side pending payload (never trust the client).
      let meta: PendingMeta
      try {
        const parsedMeta = JSON.parse(otp.meta) as PendingMeta
        if (parsedMeta?.flow !== 'register-otp' || !parsedMeta?.name) throw new Error('bad meta')
        meta = parsedMeta
      } catch {
        return fail('রেজিস্ট্রেশন ডেটা পাওয়া যায়নি — আবার শুরু করুন। (Registration data missing — please start again.)', 400)
      }

      // Re-check uniqueness right before the create (race-safe 409s).
      const clashFilters: { email?: string; phone?: string }[] = [{ phone }]
      if (meta.email) clashFilters.push({ email: meta.email })
      const clash = await db.user.findFirst({ where: { OR: clashFilters }, select: { email: true, phone: true } })
      if (clash) {
        if (clash.phone === phone) {
          return fail('এই নম্বরে অ্যাকাউন্ট আছে — লগইন করুন। (Phone already registered — please log in.)', 409)
        }
        return fail('এই ইমেইল দিয়ে অ্যাকাউন্ট আছে — লগইন করুন। (Email already registered — please log in.)', 409)
      }

      // Passwordless account: a random unusable hash fills the required
      // column; the student can set a real password later via Forgot password.
      const passwordHash = await bcrypt.hash(
        `ps-otp-${crypto.randomUUID()}-${Date.now()}`,
        10,
      )

      const user = await db.user.create({
        data: {
          name: meta.name,
          phone,
          email: meta.email ?? null,
          passwordHash,
          role: 'STUDENT',
          isVerified: true, // the OTP proved phone ownership
          studentClass: meta.studentClass ?? null,
        },
      })

      await db.otpToken.update({ where: { id: otp.id }, data: { consumed: true } })

      await db.notification.create({
        data: {
          userId: user.id,
          type: 'GENERAL',
          title: `🎉 স্বাগতম, ${user.name}!`,
          body: 'আপনার অ্যাকাউন্ট সফলভাবে তৈরি ও যাচাই হয়েছে। PathShala-তে শেখার যাত্রা আজই শুরু করুন!',
          link: '/',
        },
      })

      // ── Device limiting: a real login → rotate the session ──
      const sid = crypto.randomUUID()
      await db.user.update({ where: { id: user.id }, data: { activeSessionId: sid } })

      const jwt = await signToken({ sub: user.id, role: 'STUDENT', name: user.name, sid })
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
    }

    // ── Step 1: validate the details → issue an OTP to the phone ──
    // The body was already parsed above — validate it directly (calling
    // req.json() twice would throw "Invalid JSON body").
    const parsed = requestSchema.safeParse(body ?? {})
    if (!parsed.success) {
      const first = parsed.error.issues?.[0]
      return fail(
        first
          ? `${first.path.join('.') || 'input'}: ${first.message}`
          : 'Invalid input',
        422,
      )
    }

    const name = sanitize(parsed.data.name, 80)
    if (name.length < 2) return fail('Name must be at least 2 characters', 422)

    const phone = parsed.data.phone
    const email = parsed.data.email ?? null

    const clash = await db.user.findFirst({
      where: { OR: email ? [{ phone }, { email }] : [{ phone }] },
      select: { email: true, phone: true },
    })
    if (clash) {
      if (clash.phone === phone) {
        return fail('এই নম্বরে অ্যাকাউন্ট আছে — লগইন করুন। (Phone already registered — please log in.)', 409)
      }
      return fail('এই ইমেইল দিয়ে অ্যাকাউন্ট আছে — লগইন করুন। (Email already registered — please log in.)', 409)
    }

    const meta: PendingMeta = {
      flow: 'register-otp',
      name,
      ...(email ? { email } : {}),
      ...(parsed.data.studentClass ? { studentClass: parsed.data.studentClass } : {}),
    }
    const issued = await issueOtp(phone, name, JSON.stringify(meta))
    return ok({ needsOtp: true, identifier: phone, delivered: issued.delivered, devOtp: issued.devCode })
  } catch (err) {
    console.error('[POST /api/auth/register-otp]', err)
    return fail('Server error', 500)
  }
}

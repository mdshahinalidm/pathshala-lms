/**
 * POST /api/auth/register
 * Creates an unverified STUDENT account and issues a 6-digit OTP.
 *
 * OTP delivery is REAL when the admin configured the provider:
 *   • email registration → SMTP email (admin Email Setup / SMTP env)
 *   • phone registration → HTTP SMS gateway (admin SMS Setup / SMS env)
 * Only when NO provider is configured does the response include `devOtp`
 * (demo mode) so the sandbox UI can complete verification.
 */
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, rateLimit, sanitize } from '@/lib/api-helpers'
import { issueOtp } from '@/lib/otp'
import { isValidClass } from '@/lib/student-classes'

function emptyToUndefined(v: unknown): unknown {
  return typeof v === 'string' && v.trim() === '' ? undefined : v
}

/**
 * Normalize Bangladeshi mobile numbers to 01XXXXXXXXX.
 * Accepts: 01712345678 · +8801712345678 · 8801712345678 · 01712-345678 · 017 1234 5678
 * Returns null when the input cannot be a valid BD mobile number.
 */
function normalizeBdPhone(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const digits = v.replace(/[\s-]/g, '').replace(/^\+?88/, '')
  return /^01[3-9]\d{8}$/.test(digits) ? digits : null
}

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name too long'),
    email: z.preprocess(
      emptyToUndefined,
      z.string().trim().toLowerCase().email('Invalid email address').max(120).optional(),
    ),
    phone: z.preprocess(
      (v) => {
        const u = emptyToUndefined(v)
        if (u === undefined) return undefined
        return normalizeBdPhone(u) ?? u // keep raw so zod prints its message
      },
      z
        .string()
        .regex(/^01[3-9]\d{8}$/, 'সঠিক মোবাইল নম্বর দিন (যেমন 01712345678 — +880/880 ফরম্যাটও চলবে) | Invalid Bangladeshi mobile number')
        .optional(),
    ),
    password: z
      .string()
      .min(8, 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে | Password must be at least 8 characters')
      .max(72, 'পাসওয়ার্ড খুব লম্বা | Password too long')
      .regex(/[A-Za-z]/, 'পাসওয়ার্ডে অন্তত একটি অক্ষর থাকতে হবে | At least one letter required')
      .regex(/\d/, 'পাসওয়ার্ডে অন্তত একটি সংখ্যা থাকতে হবে | At least one digit required'),
    studentClass: z
      .string()
      .refine(isValidClass, 'শ্রেণি/বর্ষ নির্বাচন করুন | Select your class')
      .optional(),
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: 'Email or phone number is required',
    path: ['email'],
  })

export async function POST(req: Request) {
  try {
    const limited = rateLimit(req, 'auth-register', 5, 60_000)
    if (limited) return limited

    const parsed = await parseBody(req, registerSchema)
    if (isResponse(parsed)) return parsed

    const name = sanitize(parsed.name, 80)
    if (name.length < 2) return fail('Name must be at least 2 characters', 422)

    const email = parsed.email ?? null
    const phone = parsed.phone ?? null
    if (!email && !phone) return fail('Email or phone number is required', 422)

    // Friendly 409 instead of a raw Prisma P2002 unique-constraint error.
    const clashFilters: { email?: string; phone?: string }[] = []
    if (email) clashFilters.push({ email })
    if (phone) clashFilters.push({ phone })
    const clash = await db.user.findFirst({ where: { OR: clashFilters }, select: { email: true, phone: true } })
    if (clash) {
      if (email && clash.email === email) {
        return fail('এই ইমেইল দিয়ে অ্যাকাউন্ট আছে — লগইন করুন। (Email already registered — please log in.)', 409)
      }
      if (phone && clash.phone === phone) {
        return fail('এই নম্বরে অ্যাকাউন্ট আছে — লগইন করুন। (Phone already registered — please log in.)', 409)
      }
      return fail('An account with these details already exists.', 409)
    }

    const passwordHash = await bcrypt.hash(parsed.password, 10)
    await db.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        role: 'STUDENT',
        isVerified: false,
        studentClass: parsed.studentClass ?? null,
      },
    })

    const identifier = email ?? (phone as string)
    const issued = await issueOtp(identifier, name)

    // devOtp is ONLY present in demo mode (no provider configured).
    return ok({ needsOtp: true, identifier, delivered: issued.delivered, devOtp: issued.devCode })
  } catch (err) {
    console.error('[POST /api/auth/register]', err)
    return fail('Server error', 500)
  }
}

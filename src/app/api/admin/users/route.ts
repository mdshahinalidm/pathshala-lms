/**
 * /api/admin/users — staff (panel) account list + staff account creation.
 *
 * GET  (ADMIN/MANAGER/MODERATOR) ?q=<term> [&staff=1] → latest 200 users
 *      with enrollment/order counts, searching name / email / phone
 *      (contains). staff=1 returns ONLY panel accounts (ADMIN | MANAGER |
 *      MODERATOR) — the Admin Control section is the staff management hub;
 *      student accounts live in the Students section.
 * POST (OWNER/ADMIN only) create a staff account:
 *      { name, email, password, role: 'ADMIN' | 'MANAGER' | 'MODERATOR' } —
 *      the owner adds moderators/managers/admins with their own user+pass;
 *      the account is created verified so they can log in through /admin.
 */
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, requireAdmin, requireOwner, isResponse, parseBody, sanitize } from '@/lib/api-helpers'

/** GET /api/admin/users (panel roles) */
export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const url = new URL(req.url)
    const q = url.searchParams.get('q')?.trim()
    const staffOnly = url.searchParams.get('staff') === '1'

    const where = {
      ...(staffOnly ? { role: { in: ['ADMIN', 'MANAGER', 'MODERATOR'] } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    }

    const users = await db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        isBlocked: true,
        createdAt: true,
        _count: { select: { enrollments: true, orders: true } },
      },
    })

    return ok(users)
  } catch (err) {
    console.error('[GET /api/admin/users]', err)
    return fail('Server error', 500)
  }
}

const createStaffSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Valid email required').max(120),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72)
    .regex(/[A-Za-z]/, 'At least one letter required')
    .regex(/\d/, 'At least one digit required'),
  role: z.enum(['ADMIN', 'MANAGER', 'MODERATOR']),
})

/** POST /api/admin/users (owner) — create a moderator / manager / admin account. */
export async function POST(req: Request) {
  try {
    const owner = await requireOwner(req)
    if (isResponse(owner)) return owner

    const parsed = await parseBody(req, createStaffSchema)
    if (isResponse(parsed)) return parsed

    const name = sanitize(parsed.name, 80)
    if (name.length < 2) return fail('Name must be at least 2 characters', 422)

    const clash = await db.user.findUnique({ where: { email: parsed.email }, select: { id: true } })
    if (clash) return fail('এই ইমেইলে ইতিমধ্যে একটি অ্যাকাউন্ট আছে। (Email already registered.)', 409)

    const passwordHash = await bcrypt.hash(parsed.password, 10)
    const user = await db.user.create({
      data: {
        name,
        email: parsed.email,
        passwordHash,
        role: parsed.role,
        isVerified: true, // staff accounts skip OTP — the owner vouches for them
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isVerified: true,
        isBlocked: true,
        createdAt: true,
      },
    })

    return ok(user, 201)
  } catch (err) {
    console.error('[POST /api/admin/users]', err)
    return fail('Server error', 500)
  }
}

/**
 * GET  /api/admin/coupons — list coupons (latest 200). Optional ?q= searches code.
 * POST /api/admin/coupons — create a coupon.
 *   code is uppercased + regex-validated; PERCENT value must be 1..100,
 *   FIXED value > 0; expiresAt is an optional ISO date.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, rateLimit, requireAdmin, requireOwner } from '@/lib/api-helpers'
import { normalizeCouponScopes } from '@/lib/coupon'

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (isResponse(auth)) return auth

    const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
    const coupons = await db.coupon.findMany({
      where: q ? { code: { contains: q.toUpperCase() } } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return ok(coupons)
  } catch (err) {
    console.error('[GET /api/admin/coupons]', err)
    return fail('Server error', 500)
  }
}

const COUPON_CODE_RE = /^[A-Z0-9_-]{2,24}$/

const couponCreateSchema = z
  .object({
    code: z
      .string()
      .min(2, 'Code must be at least 2 characters')
      .max(24)
      .transform((s) => s.trim().toUpperCase()),
    type: z.enum(['PERCENT', 'FIXED']),
    value: z.number().positive('Value must be greater than 0').max(1_000_000),
    minAmount: z.number().min(0).max(1_000_000).default(0),
    maxUses: z.number().int().min(1).max(1_000_000).optional().nullable(),
    expiresAt: z.coerce.date().optional().nullable(),
    isActive: z.boolean().default(true),
    // which purchase types the coupon applies to. Empty or all three
    // selected → "ALL"; otherwise a CSV of the picked types.
    scopes: z.array(z.enum(['COURSE', 'EXAM', 'SUGGESTION'])).max(3).optional(),
  })
  .refine((d) => d.type !== 'PERCENT' || d.value <= 100, {
    message: 'PERCENT value must be between 1 and 100',
    path: ['value'],
  })
  .refine((d) => COUPON_CODE_RE.test(d.code), {
    message: 'Code may only contain A-Z, 0-9, hyphen and underscore (2–24 chars)',
    path: ['code'],
  })

export async function POST(req: Request) {
  try {
    const auth = await requireOwner(req)
    if (isResponse(auth)) return auth

    const limited = rateLimit(req, 'coupons-create', 30, 60_000)
    if (limited) return limited

    const parsed = await parseBody(req, couponCreateSchema)
    if (isResponse(parsed)) return parsed

    const exists = await db.coupon.findUnique({ where: { code: parsed.code }, select: { id: true } })
    if (exists) return fail('A coupon with this code already exists', 409)

    const coupon = await db.coupon.create({
      data: {
        code: parsed.code,
        type: parsed.type,
        value: parsed.value,
        minAmount: parsed.minAmount,
        maxUses: parsed.maxUses ?? null,
        expiresAt: parsed.expiresAt ?? null,
        isActive: parsed.isActive,
        scopes: parsed.scopes ? normalizeCouponScopes(parsed.scopes) : 'ALL',
      },
    })
    return ok(coupon, 201)
  } catch (err) {
    console.error('[POST /api/admin/coupons]', err)
    return fail('Server error', 500)
  }
}

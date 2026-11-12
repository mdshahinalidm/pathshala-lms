/**
 * PUT    /api/admin/coupons/[id] — update a coupon (full or partial, incl. isActive toggle).
 * DELETE /api/admin/coupons/[id] — delete a coupon. Orders that referenced it
 *                                   keep their amount/discount snapshot but the
 *                                   couponCode link is cleared (relation = SetNull).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAdmin, requireOwner } from '@/lib/api-helpers'
import { normalizeCouponScopes } from '@/lib/coupon'

const COUPON_CODE_RE = /^[A-Z0-9_-]{2,24}$/

const couponUpdateSchema = z
  .object({
    code: z
      .string()
      .min(2)
      .max(24)
      .transform((s) => s.trim().toUpperCase())
      .optional(),
    type: z.enum(['PERCENT', 'FIXED']).optional(),
    value: z.number().positive().max(1_000_000).optional(),
    minAmount: z.number().min(0).max(1_000_000).optional(),
    maxUses: z.number().int().min(1).max(1_000_000).optional().nullable(),
    expiresAt: z.coerce.date().optional().nullable(),
    isActive: z.boolean().optional(),
    // scope selection — empty/all → "ALL", else canonical CSV.
    scopes: z.array(z.enum(['COURSE', 'EXAM', 'SUGGESTION'])).max(3).optional(),
  })
  .refine((d) => d.type !== 'PERCENT' || d.value === undefined || d.value <= 100, {
    message: 'PERCENT value must be between 1 and 100',
    path: ['value'],
  })
  .refine((d) => d.code === undefined || COUPON_CODE_RE.test(d.code), {
    message: 'Code may only contain A-Z, 0-9, hyphen and underscore (2–24 chars)',
    path: ['code'],
  })

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOwner(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const parsed = await parseBody(req, couponUpdateSchema)
    if (isResponse(parsed)) return parsed

    const existing = await db.coupon.findUnique({ where: { id } })
    if (!existing) return fail('Coupon not found', 404)

    if (parsed.code && parsed.code !== existing.code) {
      const clash = await db.coupon.findUnique({ where: { code: parsed.code }, select: { id: true } })
      if (clash) return fail('A coupon with this code already exists', 409)
    }

    const coupon = await db.coupon.update({
      where: { id },
      data: {
        ...(parsed.code !== undefined ? { code: parsed.code } : {}),
        ...(parsed.type !== undefined ? { type: parsed.type } : {}),
        ...(parsed.value !== undefined ? { value: parsed.value } : {}),
        ...(parsed.minAmount !== undefined ? { minAmount: parsed.minAmount } : {}),
        ...(parsed.maxUses !== undefined ? { maxUses: parsed.maxUses } : {}),
        ...(parsed.expiresAt !== undefined ? { expiresAt: parsed.expiresAt } : {}),
        ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
        ...(parsed.scopes !== undefined ? { scopes: normalizeCouponScopes(parsed.scopes) } : {}),
      },
    })
    return ok(coupon)
  } catch (err) {
    console.error('[PUT /api/admin/coupons/[id]]', err)
    return fail('Server error', 500)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOwner(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const existing = await db.coupon.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return fail('Coupon not found', 404)

    await db.coupon.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/coupons/[id]]', err)
    return fail('Server error', 500)
  }
}

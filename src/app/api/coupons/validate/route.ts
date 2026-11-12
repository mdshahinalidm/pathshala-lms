/**
 * POST /api/coupons/validate — live coupon preview for the checkout pages
 * Body: { code, amount }. Authenticated users can check a coupon
 * against an amount BEFORE paying — the exact same rules the purchase
 * endpoints enforce (active, unexpired, under max uses, minAmount ≤ amount).
 * Returns { valid, code, type, value, discount, finalAmount } or 422 with a
 * bilingual error message. Server-side revalidation still happens at
 * purchase time — this endpoint is only a friendly preview.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, rateLimit, requireAuth } from '@/lib/api-helpers'
import { normalizeCouponCode, validateCouponForAmount, type CouponScope } from '@/lib/coupon'

export const runtime = 'nodejs'

const schema = z.object({
  code: z.string().min(1).max(40),
  amount: z.number().min(0).max(10_000_000),
  // which purchase type the checkout is for — scoped coupons only
  // validate for their allowed types.
  scope: z.enum(['COURSE', 'EXAM', 'SUGGESTION']).optional(),
})

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    if (rateLimit(req, 'coupon-validate', 20, 60_000)) {
      return fail('Too many requests — please slow down.', 429)
    }

    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    const code = normalizeCouponCode(parsed.code)
    if (!code) return fail('কুপন কোড লিখুন (Enter a coupon code)', 422)

    // The coupon row itself is returned so the UI can show the type/value.
    const exists = await db.coupon.findUnique({
      where: { code },
      select: {
        code: true,
        type: true,
        value: true,
        minAmount: true,
        maxUses: true,
        usedCount: true,
        expiresAt: true,
        isActive: true,
      },
    })
    if (!exists) return fail('Invalid or inactive coupon code (কুপন কোড সঠিক নয় বা নিষ্ক্রিয়)', 422)

    const result = await validateCouponForAmount(code, parsed.amount, parsed.scope as CouponScope | undefined)
    if (!result.ok) return fail(result.message, 422)

    return ok({
      valid: true,
      code: result.coupon.code,
      type: result.coupon.type,
      value: result.coupon.value,
      discount: result.discount,
      finalAmount: result.finalAmount,
    })
  } catch (err) {
    console.error('[POST /api/coupons/validate]', err)
    return fail('Server error', 500)
  }
}

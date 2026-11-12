/**
 * POST /api/suggestions/[id]/purchase — buy a PAID study material.
 *
 * Flow mirrors course orders:
 *  • profile must be 100% complete (enforced server-side)
 *  • gateway must exist and be enabled; SANDBOX → client confirms via
 *    /api/purchases/[id]/confirm; MANUAL → invoice upfront, client submits
 *    proof via /api/purchases/[id]/submit, admin approves in the panel;
 *    LIVE → official gateway redirect via /api/payments/initiate and the
 *    callback marks SUCCESS instantly (auto-unlock in My Suggestions)
 *  • duplicate ownership is a 409
 *
 * Returns { purchase } (PENDING; SUCCESS only happens on confirm/review).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  fail,
  isResponse,
  makeTrxId,
  ok,
  parseBody,
  rateLimit,
  requireAuth,
} from '@/lib/api-helpers'
import { nextInvoiceNo } from '@/lib/invoice'
import { isProfileComplete } from '@/lib/student-classes'
import { validateCouponForAmount } from '@/lib/coupon'

export const runtime = 'nodejs'

const schema = z.object({
  method: z.string().min(2).max(40),
  couponCode: z.string().max(40).optional().nullable(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    if (rateLimit(req, 'purchase-suggestion', 8, 60_000)) {
      return fail('Too many requests — please slow down.', 429)
    }

    const { id } = await params
    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    // ── 100% profile completion is required to buy ──
    if (!isProfileComplete(auth)) {
      return fail(
        'প্রোফাইল ১০০% সম্পূর্ণ করুন — তারপর কিনতে পারবেন। (Complete your profile to 100% first.)',
        422
      )
    }

    const material = await db.suggestion.findUnique({
      where: { id },
      select: { id: true, title: true, isFree: true, price: true },
    })
    if (!material) return fail('Material not found', 404)
    if (material.isFree) return fail('This material is free — download it directly.', 400)

    const listAmount = Number(material.price ?? 0)
    if (!(listAmount > 0)) return fail('This material has no price set.', 400)

    // Already owned?
    const existing = await db.suggestionPurchase.findFirst({
      where: { userId: auth.id, suggestionId: id, status: 'SUCCESS' },
      select: { id: true },
    })
    if (existing) return fail('আপনি ইতিমধ্যে এই সাজেশনটি কিনেছেন। (Already purchased.)', 409)

    // Method must be an ENABLED gateway.
    const gateway = await db.paymentGateway.findUnique({ where: { code: parsed.method } })
    if (!gateway || !gateway.enabled) return fail('এই পেমেন্ট মেথডটি এখন সক্রিয় নয়।', 400)

    // ── Coupon validation & discount snapshot (same rules as course orders) ──
    let discount = 0
    let appliedCouponCode: string | null = null
    if (parsed.couponCode?.trim()) {
      const result = await validateCouponForAmount(parsed.couponCode, listAmount, 'SUGGESTION')
      if (!result.ok) return fail(result.message, 422)
      discount = result.discount
      appliedCouponCode = result.coupon.code
    }
    const amount = Math.max(0, listAmount - discount)

    const invoiceNo = await nextInvoiceNo()
    const purchase = await db.suggestionPurchase.create({
      data: {
        userId: auth.id,
        suggestionId: id,
        amount,
        listAmount,
        discount,
        couponCode: appliedCouponCode,
        method: gateway.code,
        status: 'PENDING',
        trxId: makeTrxId('PS'),
        invoiceNo,
      },
      select: {
        id: true,
        amount: true,
        listAmount: true,
        discount: true,
        couponCode: true,
        method: true,
        status: true,
        trxId: true,
        invoiceNo: true,
        createdAt: true,
      },
    })

    return ok({ purchase, materialTitle: material.title, listAmount, discount, finalAmount: amount, couponCode: appliedCouponCode })
  } catch (err) {
    console.error('[POST /api/suggestions/[id]/purchase]', err)
    return fail('Server error', 500)
  }
}

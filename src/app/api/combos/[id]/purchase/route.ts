/**
 * POST /api/combos/[id]/purchase — buy a combo offer.
 * Flow mirrors suggestion/exam purchases exactly:
 *  • profile 100% complete (server-enforced)
 *  • gateway must exist and be enabled; SANDBOX → client confirms via
 *    /api/combo-purchases/[id]/confirm; MANUAL → invoice upfront, proof via
 *    /api/combo-purchases/[id]/submit; LIVE → /api/payments/initiate
 *    { comboPurchaseId } → gateway callback marks SUCCESS instantly and
 *    every combo item lands in the student's dashboard.
 *  • already SUCCESS → 409; a PENDING row is resumed (checkout refresh-safe)
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, makeTrxId, ok, parseBody, rateLimit, requireAuth } from '@/lib/api-helpers'
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

    if (rateLimit(req, 'purchase-combo', 8, 60_000)) {
      return fail('Too many requests — please slow down.', 429)
    }

    const { id } = await params
    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    if (!isProfileComplete(auth)) {
      return fail(
        'প্রোফাইল ১০০% সম্পূর্ণ করুন — তারপর কিনতে পারবেন। (Complete your profile to 100% first.)',
        422
      )
    }

    const combo = await db.combo.findUnique({
      where: { id },
      select: { id: true, title: true, isActive: true, price: true },
    })
    if (!combo || !combo.isActive) return fail('Combo not found', 404)

    const listAmount = Number(combo.price ?? 0)
    if (!(listAmount > 0)) return fail('This combo has no price set.', 400)

    // Already owned?
    const owned = await db.comboPurchase.findFirst({
      where: { userId: auth.id, comboId: id, status: 'SUCCESS' },
      select: { id: true },
    })
    if (owned) return fail('আপনি ইতিমধ্যে এই কম্বোটি কিনেছেন। (Already purchased.)', 409)

    const gateway = await db.paymentGateway.findUnique({ where: { code: parsed.method } })
    if (!gateway || !gateway.enabled) return fail('এই পেমেন্ট মেথডটি এখন সক্রিয় নয়।', 400)

    // ── Coupon validation & discount snapshot. Combos are already heavily
    //    discounted bundles; any active coupon applies (no scope filter) —
    //    a combo is not one single COURSE/EXAM/SUGGESTION scope. ──
    let discount = 0
    let appliedCouponCode: string | null = null
    if (parsed.couponCode?.trim()) {
      const result = await validateCouponForAmount(parsed.couponCode, listAmount)
      if (!result.ok) return fail(result.message, 422)
      discount = result.discount
      appliedCouponCode = result.coupon.code
    }
    const amount = Math.max(0, listAmount - discount)

    const invoiceNo = await nextInvoiceNo()

    const resumeData = {
      amount,
      listAmount,
      discount,
      couponCode: appliedCouponCode,
      method: gateway.code,
      status: 'PENDING',
      payStatus: 'NONE',
      trxId: makeTrxId('PSC'),
      invoiceNo,
      senderNumber: null,
      submittedTrxId: null,
      submittedAt: null,
      adminNote: null,
    }

    const purchaseSelect = {
      id: true,
      trxId: true,
      invoiceNo: true,
      amount: true,
      listAmount: true,
      discount: true,
      couponCode: true,
      method: true,
      status: true,
      createdAt: true,
    } as const

    // Resume a PENDING row instead of stacking duplicates (refresh-safe).
    const pending = await db.comboPurchase.findFirst({
      where: { userId: auth.id, comboId: id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    })

    const purchase = pending
      ? await db.comboPurchase.update({
          where: { id: pending.id },
          data: resumeData,
          select: purchaseSelect,
        })
      : await db.comboPurchase.create({
          data: {
            userId: auth.id,
            comboId: id,
            ...resumeData,
          },
          select: purchaseSelect,
        })

    return ok({ purchase, comboTitle: combo.title, listAmount, discount, finalAmount: amount, couponCode: appliedCouponCode })
  } catch (err) {
    console.error('[POST /api/combos/[id]/purchase]', err)
    return fail('Server error', 500)
  }
}

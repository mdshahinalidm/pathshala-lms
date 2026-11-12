/**
 * POST /api/purchases/[id]/confirm — SANDBOX gateway auto-confirmation.
 * Owner-only; idempotent for already-processed purchases. Marks the
 * purchase SUCCESS and notifies the student (dashboard suggestions unlock).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAuth } from '@/lib/api-helpers'
import { incrementCouponUsedCount } from '@/lib/coupon'

export const runtime = 'nodejs'

const schema = z.object({
  status: z.enum(['SUCCESS', 'FAILED']),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    const purchase = await db.suggestionPurchase.findUnique({
      where: { id },
      include: { suggestion: { select: { title: true } } },
    })
    if (!purchase) return fail('Purchase not found.', 404)
    if (purchase.userId !== auth.id) return fail('Purchase not found.', 404)
    if (purchase.status !== 'PENDING') {
      return ok({ status: purchase.status, alreadyProcessed: true })
    }

    // Only SANDBOX gateways can self-confirm (demo mode).
    const gateway = await db.paymentGateway.findUnique({
      where: { code: purchase.method },
      select: { mode: true },
    })
    if (!gateway || gateway.mode !== 'SANDBOX') {
      return fail('এই মেথডে সরাসরি কনফার্ম করা যাবে না।', 400)
    }

    const updated = await db.suggestionPurchase.update({
      where: { id },
      data: {
        status: parsed.status,
        payStatus: parsed.status === 'SUCCESS' ? 'APPROVED' : 'REJECTED',
        adminNote: parsed.status === 'SUCCESS' ? 'Sandbox demo payment' : 'Sandbox demo failure',
      },
      select: { id: true, status: true },
    })

    if (parsed.status === 'SUCCESS') {
      await db.notification.create({
        data: {
          userId: auth.id,
          type: 'PAYMENT',
          title: '🎉 সাজেশন কেনা সম্পন্ন',
          body: `"${purchase.suggestion.title}" কেনা হয়েছে — এখন ডাউনলোড করতে পারবেন।`,
          link: '/dashboard/suggestions',
        },
      })
      // count the coupon usage once, at the SUCCESS transition.
      await incrementCouponUsedCount(purchase.couponCode)
    }

    return ok({ purchase: updated })
  } catch (err) {
    console.error('[POST /api/purchases/[id]/confirm]', err)
    return fail('Server error', 500)
  }
}

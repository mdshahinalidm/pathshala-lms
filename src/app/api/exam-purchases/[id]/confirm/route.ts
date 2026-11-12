/**
 * POST /api/exam-purchases/[id]/confirm — SANDBOX gateway auto-confirmation.
 * Owner-only; idempotent. SUCCESS → the exam unlocks in My Exams instantly.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAuth } from '@/lib/api-helpers'
import { incrementCouponUsedCount } from '@/lib/coupon'

export const runtime = 'nodejs'

const schema = z.object({ status: z.enum(['SUCCESS', 'FAILED']) })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    const purchase = await db.examPurchase.findUnique({
      where: { id },
      include: { exam: { select: { title: true } } },
    })
    if (!purchase || purchase.userId !== auth.id) return fail('Purchase not found.', 404)
    if (purchase.status !== 'PENDING') return ok({ status: purchase.status, alreadyProcessed: true })

    const gateway = await db.paymentGateway.findUnique({
      where: { code: purchase.method },
      select: { mode: true },
    })
    if (!gateway || gateway.mode !== 'SANDBOX') {
      return fail('এই মেথডে সরাসরি কনফার্ম করা যাবে না।', 400)
    }

    const updated = await db.examPurchase.update({
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
          title: '🎉 পরীক্ষা কেনা সম্পন্ন',
          body: `"${purchase.exam?.title ?? 'পরীক্ষা'}" পরীক্ষার পেমেন্ট নিশ্চিত হয়েছে — "আমার পরীক্ষা" থেকে এখনই শুরু করুন।`,
          link: '/dashboard/written-exams',
        },
      })
      // count the coupon usage once, at the SUCCESS transition.
      await incrementCouponUsedCount(purchase.couponCode)
    }
    return ok({ status: updated.status })
  } catch (err) {
    console.error('[POST /api/exam-purchases/[id]/confirm]', err)
    return fail('Server error', 500)
  }
}

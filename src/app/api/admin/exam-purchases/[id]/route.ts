/**
 * /api/admin/exam-purchases/[id] — review actions.
 *  PATCH → { action: 'APPROVE' | 'REJECT', note? } — approve unlocks the
 *          exam for the student instantly (+ notification). Reject marks
 *          FAILED. Both work on any PENDING purchase (idempotent-safe).
 *  DELETE → permanent record cleanup.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireManager } from '@/lib/api-helpers'
import { incrementCouponUsedCount } from '@/lib/coupon'

export const runtime = 'nodejs'

const schema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().max(600).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    const purchase = await db.examPurchase.findUnique({
      where: { id },
      include: { exam: { select: { title: true } } },
    })
    if (!purchase) return fail('Purchase not found.', 404)

    if (parsed.action === 'APPROVE') {
      if (purchase.status === 'SUCCESS') return ok({ status: 'SUCCESS', alreadyProcessed: true })
      if (purchase.status === 'FAILED') return fail('FAILED ক্রয় আর অনুমোদন করা যাবে না।', 409)
      await db.examPurchase.update({
        where: { id },
        data: {
          status: 'SUCCESS',
          payStatus: 'APPROVED',
          adminNote: parsed.note ? parsed.note.slice(0, 600) : purchase.adminNote,
        },
      })
      await db.notification.create({
        data: {
          userId: purchase.userId,
          type: 'PAYMENT',
          title: '🎉 পরীক্ষা কেনা অনুমোদিত',
          body: `"${purchase.exam?.title ?? 'পরীক্ষা'}" পরীক্ষার ম্যানুয়াল পেমেন্ট অনুমোদিত হয়েছে — "আমার পরীক্ষা" থেকে এখনই শুরু করুন।`,
          link: '/dashboard/written-exams',
        },
      })
      // count the coupon usage once, at the SUCCESS transition.
      await incrementCouponUsedCount(purchase.couponCode)
      return ok({ status: 'SUCCESS' })
    }

    // REJECT
    if (purchase.status === 'FAILED') return ok({ status: 'FAILED', alreadyProcessed: true })
    await db.examPurchase.update({
      where: { id },
      data: {
        status: 'FAILED',
        payStatus: 'REJECTED',
        adminNote: parsed.note ? parsed.note.slice(0, 600) : purchase.adminNote,
      },
    })
    return ok({ status: 'FAILED' })
  } catch (err) {
    console.error('[PATCH /api/admin/exam-purchases/[id]]', err)
    return fail('Server error', 500)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth
    const { id } = await params
    const purchase = await db.examPurchase.findUnique({ where: { id }, select: { id: true } })
    if (!purchase) return fail('Purchase not found.', 404)
    await db.examPurchase.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/exam-purchases/[id]]', err)
    return fail('Server error', 500)
  }
}

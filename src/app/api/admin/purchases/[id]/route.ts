/**
 * PATCH  /api/admin/purchases/[id] — review a suggestion purchase (panel).
 *          Body: { status: 'SUCCESS' | 'FAILED', adminNote? } — mirrors the
 *          orders review. SUCCESS unlocks the download (one-time notify).
 * DELETE /api/admin/purchases/[id] — permanently remove a purchase record
 *          (ADMIN/MANAGER cleanup of wrong/duplicate test payments). The
 *          student is not notified; deleting a SUCCESS record revokes access.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAdmin, sanitize } from '@/lib/api-helpers'
import { incrementCouponUsedCount } from '@/lib/coupon'

export const runtime = 'nodejs'

const schema = z.object({
  status: z.enum(['SUCCESS', 'FAILED']),
  adminNote: z.string().max(500).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    const purchase = await db.suggestionPurchase.findUnique({
      where: { id },
      include: {
        suggestion: { select: { title: true } },
        user: { select: { id: true, name: true } },
      },
    })
    if (!purchase) return fail('Purchase not found', 404)

    const wasSuccess = purchase.status === 'SUCCESS'

    const updated = await db.suggestionPurchase.update({
      where: { id },
      data: {
        status: parsed.status,
        payStatus: parsed.status === 'SUCCESS' ? 'APPROVED' : 'REJECTED',
        ...(parsed.adminNote !== undefined
          ? { adminNote: sanitize(parsed.adminNote, 500) }
          : {}),
      },
    })

    if (parsed.status === 'SUCCESS' && !wasSuccess) {
      await db.notification.create({
        data: {
          userId: purchase.userId,
          type: 'PAYMENT',
          title: '✅ পেমেন্ট যাচাই সম্পন্ন!',
          body: `"${purchase.suggestion.title}" সাজেশনের পেমেন্ট অনুমোদিত হয়েছে — এখন ডাউনলোড করতে পারবেন।`,
          link: '/dashboard/suggestions',
        },
      })
      // count the coupon usage once, at the SUCCESS transition.
      await incrementCouponUsedCount(purchase.couponCode)
    }

    return ok(updated)
  } catch (err) {
    console.error('[PATCH /api/admin/purchases/[id]]', err)
    return fail('Server error', 500)
  }
}

/** DELETE — permanently remove a purchase record (admin cleanup). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const purchase = await db.suggestionPurchase.findUnique({
      where: { id },
      select: { id: true, status: true },
    })
    if (!purchase) return fail('Purchase not found', 404)

    await db.suggestionPurchase.delete({ where: { id } })
    return ok({ deleted: true, hadStatus: purchase.status })
  } catch (err) {
    console.error('[DELETE /api/admin/purchases/[id]]', err)
    return fail('Server error', 500)
  }
}

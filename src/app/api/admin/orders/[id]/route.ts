/**
 * /api/admin/orders/[id] — admin order status override.
 *
 * PATCH { status: PENDING | SUCCESS | FAILED }
 * When an order transitions to SUCCESS and the user is not yet enrolled,
 * an enrollment is created (same flow as the payment-confirm webhook) and
 * a PAYMENT notification is sent.
 *
 * DELETE — permanently remove an order record (owner-only cleanup of
 * wrong/duplicate/test payments). Order has no dependent child rows
 * (Enrollment links user+course, not orderId), so a plain delete is safe;
 * Prisma cascade handles the parent relations.
 */
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  ok,
  fail,
  requireAdmin,
  requireOwner,
  isResponse,
  parseBody,
  rateLimit,
} from '@/lib/api-helpers'
import { incrementCouponUsedCount } from '@/lib/coupon'

export const runtime = 'nodejs'

const orderPatchSchema = z.object({
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED']),
})

/** cuid-like document id: 1–64 alphanumeric chars. */
const orderIdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9]+$/, 'Invalid id')

/** PATCH /api/admin/orders/[id] (admin) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const order = await db.order.findUnique({ where: { id } })
    if (!order) return fail('Order not found', 404)

    const body = await parseBody(req, orderPatchSchema)
    if (isResponse(body)) return body

    const wasSuccess = order.status === 'SUCCESS'

    const updated = await db.order.update({
      where: { id },
      data: { status: body.status },
    })

    // Transitioned to SUCCESS → guarantee enrollment + notify (once).
    if (body.status === 'SUCCESS' && !wasSuccess) {
      // count the coupon usage once, at the SUCCESS transition
      // (covers manual invoices approved from the panel).
      await incrementCouponUsedCount(order.couponCode)
      const existing = await db.enrollment.findUnique({
        where: {
          userId_courseId: { userId: order.userId, courseId: order.courseId },
        },
      })
      if (!existing) {
        const courseValidity = await db.course.findUnique({
          where: { id: order.courseId },
          select: { isLifetime: true, validityMonths: true },
        })
        const { enrollmentExpiryFor } = await import('@/lib/enrollment')
        await db.enrollment.create({
          data: {
            userId: order.userId,
            courseId: order.courseId,
            expiresAt: courseValidity ? enrollmentExpiryFor(courseValidity) : null,
          },
        })
        const course = await db.course.findUnique({
          where: { id: order.courseId },
          select: { title: true },
        })
        await db.notification.create({
          data: {
            userId: order.userId,
            type: 'PAYMENT',
            title: '✅ পেমেন্ট সফল!',
            body: `"${course?.title ?? 'কোর্স'}" কোর্সে আপনার ভর্তি সম্পন্ন হয়েছে। এখন classroom থেকে শেখা শুরু করুন।`,
            link: '/dashboard',
          },
        })
      }
    }

    return ok(updated)
  } catch (err) {
    console.error('[PATCH /api/admin/orders/[id]]', err)
    return fail('Server error', 500)
  }
}

/** DELETE — permanently remove a single order record (owner-only cleanup). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const owner = await requireOwner(req)
    if (isResponse(owner)) return owner
    if (rateLimit(req, 'admin-order-delete', 20, 60_000)) {
      return fail('Too many requests — please slow down.', 429)
    }

    const parsedId = orderIdSchema.safeParse(id)
    if (!parsedId.success) return fail('Invalid order id.', 422)

    try {
      await db.order.delete({ where: { id } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return fail('Order not found.', 404)
      }
      throw e
    }

    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/orders/[id]]', err)
    return fail('Server error', 500)
  }
}

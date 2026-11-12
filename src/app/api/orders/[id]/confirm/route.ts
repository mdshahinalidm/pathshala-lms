/**
 * POST /api/orders/[id]/confirm — sandbox payment confirmation.
 * Body: {status: 'SUCCESS' | 'FAILED'}. The order must belong to the caller
 * (ADMINs may confirm any). Idempotent: already-processed orders return their
 * current state untouched. SUCCESS creates the Enrollment (if missing), assigns
 * an invoice number (idempotent — only when empty), increments the used coupon
 * counter (when the order used one) and creates COURSE + PAYMENT notifications.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, rateLimit, requireAuth } from '@/lib/api-helpers'
import { enrollmentExpiryFor } from '@/lib/enrollment'
import { nextInvoiceNo } from '@/lib/invoice'

const confirmSchema = z.object({
  status: z.enum(['SUCCESS', 'FAILED']),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const parsed = await parseBody(req, confirmSchema)
    if (isResponse(parsed)) return parsed

    const order = await db.order.findUnique({
      where: { id },
      include: { course: { select: { id: true, title: true } } },
    })
    if (!order) return fail('Order not found', 404)
    if (order.userId !== auth.id && auth.role !== 'ADMIN') {
      return fail('Forbidden — this order belongs to another user.', 403)
    }

    // Idempotent: return the current state without double-processing.
    if (order.status !== 'PENDING') {
      const existing = await db.enrollment.findUnique({
        where: { userId_courseId: { userId: order.userId, courseId: order.courseId } },
        select: { id: true },
      })
      return ok({ order, enrolled: Boolean(existing) })
    }

    // Invoice number is assigned once (idempotent) — SUCCESS orders only.
    const invoiceNo = parsed.status === 'SUCCESS' ? order.invoiceNo || (await nextInvoiceNo()) : order.invoiceNo
    const updated = await db.order.update({
      where: { id: order.id },
      data: {
        status: parsed.status,
        ...(invoiceNo ? { invoiceNo } : {}),
        // Manual invoice flow: track the review outcome on the order itself.
        ...(parsed.status === 'SUCCESS'
          ? { payStatus: 'APPROVED' }
          : order.payStatus === 'SUBMITTED'
            ? { payStatus: 'REJECTED' }
            : {}),
      },
    })

    let enrolled = false
    if (parsed.status === 'SUCCESS') {
      const courseValidity = await db.course.findUnique({
        where: { id: order.courseId },
        select: { isLifetime: true, validityMonths: true },
      })
      const expiresAt = courseValidity ? enrollmentExpiryFor(courseValidity) : null
      await db.enrollment.upsert({
        where: { userId_courseId: { userId: order.userId, courseId: order.courseId } },
        update: {},
        create: { userId: order.userId, courseId: order.courseId, expiresAt },
      })
      enrolled = true

      // Coupon was used on this order → record one usage.
      if (order.couponCode) {
        try {
          await db.coupon.update({
            where: { code: order.couponCode },
            data: { usedCount: { increment: 1 } },
          })
        } catch {
          // Coupon may have been deleted meanwhile — never block the payment flow.
        }
      }

      await db.notification.create({
        data: {
          userId: order.userId,
          type: 'COURSE',
          title: '🎉 ভর্তি সফল',
          body: `অভিনন্দন! আপনি "${order.course.title}" কোর্সে সফলভাবে ভর্তি হয়েছেন। এখনই শেখা শুরু করুন।`,
          link: '/dashboard',
        },
      })
      await db.notification.create({
        data: {
          userId: order.userId,
          type: 'PAYMENT',
          title: '💳 পেমেন্ট সফল — কোর্স আনলক হয়েছে',
          body: `"${order.course.title}" কোর্সের জন্য ৳${order.amount} পেমেন্ট গ্রহণ করা হয়েছে (TrxID: ${order.trxId})। Invoice / রসিদ নম্বর: ${invoiceNo}. Payment successful — invoice ${invoiceNo}.`,
          link: '/dashboard',
        },
      })
    }

    return ok({ order: updated, enrolled })
  } catch (err) {
    console.error('[POST /api/orders/[id]/confirm]', err)
    return fail('Server error', 500)
  }
}

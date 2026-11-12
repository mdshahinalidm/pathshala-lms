/**
 * POST /api/manual-payment/submit — student submits proof of a MANUAL payment.
 * Body: { orderId, senderNumber, trxId, note? }
 * The order must belong to the caller, be PENDING and have invoiceNo.
 * Sets payStatus=SUBMITTED + stores the transaction reference for the admin
 * (Orders page → রিভিউ করে Approve করলেই কোর্স আনলক হয়).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, rateLimit, requireAuth } from '@/lib/api-helpers'

export const runtime = 'nodejs'

const schema = z.object({
  orderId: z.string().min(1),
  senderNumber: z.string().min(6).max(24),
  trxId: z.string().min(4).max(40),
  note: z.string().max(500).optional(),
})

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth
    if (rateLimit(req, 'manual-submit', 6, 10 * 60_000)) {
      return fail('Too many requests — please slow down.', 429)
    }

    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    const order = await db.order.findUnique({
      where: { id: parsed.orderId },
      include: { course: { select: { title: true } } },
    })
    if (!order || order.userId !== auth.id) return fail('Order not found.', 404)
    if (order.status !== 'PENDING') return fail('এই অর্ডারটি আর প্রসেস করা যাবে না।', 409)
    if (!order.invoiceNo) return fail('Invoice not ready for this order.', 409)

    // Same TrxID used before? block double-claiming across ALL orders.
    const clash = await db.order.findFirst({
      where: { submittedTrxId: parsed.trxId.trim(), id: { not: order.id } },
      select: { id: true },
    })
    if (clash) return fail('এই ট্রানজেকশন আইডি আগেই ব্যবহৃত হয়েছে।', 409)

    const updated = await db.order.update({
      where: { id: order.id },
      data: {
        payStatus: 'SUBMITTED',
        senderNumber: parsed.senderNumber.trim(),
        submittedTrxId: parsed.trxId.trim().toUpperCase(),
        submittedAt: new Date(),
        ...(parsed.note ? { adminNote: parsed.note } : {}),
      },
    })

    await db.notification.create({
      data: {
        userId: auth.id,
        type: 'PAYMENT',
        title: '🧾 পেমেন্ট তথ্য জমা হয়েছে',
        body: `"${order.course.title}" কোর্সের জন্য ইনভয়েস ${order.invoiceNo}-এর পেমেন্ট তথ্য (TrxID: ${parsed.trxId.toUpperCase()}) জমা হয়েছে। অ্যাডমিন যাচাই করে দ্রুত কোর্স আনলক করে দেবেন।`,
        link: '/dashboard',
      },
    })

    return ok({ order: updated, submitted: true })
  } catch (err) {
    console.error('[POST /api/manual-payment/submit]', err)
    return fail('Server error', 500)
  }
}

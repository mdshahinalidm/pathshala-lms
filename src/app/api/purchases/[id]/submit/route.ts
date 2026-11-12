/**
 * POST /api/purchases/[id]/submit — student submits proof of a MANUAL payment
 * (invoice flow, mirrors /api/manual-payment/submit for course orders).
 * Sets payStatus=SUBMITTED; the admin approves from the panel
 * (সাজেশন ক্রয় → Approve) which unlocks the download.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, rateLimit, requireAuth } from '@/lib/api-helpers'

export const runtime = 'nodejs'

const schema = z.object({
  senderNumber: z.string().min(6).max(24),
  trxId: z.string().min(4).max(40),
  note: z.string().max(500).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth
    if (rateLimit(req, 'purchase-submit', 6, 10 * 60_000)) {
      return fail('Too many requests — please slow down.', 429)
    }

    const { id } = await params
    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    const purchase = await db.suggestionPurchase.findUnique({
      where: { id },
      include: { suggestion: { select: { title: true } } },
    })
    if (!purchase || purchase.userId !== auth.id) return fail('Purchase not found.', 404)
    if (purchase.status !== 'PENDING') return fail('এই ক্রয়টি আর প্রসেস করা যাবে না।', 409)
    if (!purchase.invoiceNo) return fail('Invoice not ready for this purchase.', 409)

    const trx = parsed.trxId.trim().toUpperCase()

    // Same TrxID must not be claimed on another order OR another purchase.
    const [orderClash, purchaseClash] = await Promise.all([
      db.order.findFirst({ where: { submittedTrxId: trx }, select: { id: true } }),
      db.suggestionPurchase.findFirst({
        where: { submittedTrxId: trx, id: { not: purchase.id } },
        select: { id: true },
      }),
    ])
    if (orderClash || purchaseClash) {
      return fail('এই ট্রানজেকশন আইডি আগেই ব্যবহৃত হয়েছে।', 409)
    }

    await db.suggestionPurchase.update({
      where: { id: purchase.id },
      data: {
        payStatus: 'SUBMITTED',
        senderNumber: parsed.senderNumber.trim(),
        submittedTrxId: trx,
        submittedAt: new Date(),
        ...(parsed.note ? { adminNote: parsed.note } : {}),
      },
    })

    await db.notification.create({
      data: {
        userId: auth.id,
        type: 'PAYMENT',
        title: 'পেমেন্ট তথ্য জমা হয়েছে',
        body: `"${purchase.suggestion.title}" ক্রয়ের পেমেন্ট যাচাই চলছে — অনুমোদনের পরই ডাউনলোড খুলে যাবে।`,
        link: '/dashboard/suggestions',
      },
    })

    return ok({ submitted: true, payStatus: 'SUBMITTED' })
  } catch (err) {
    console.error('[POST /api/purchases/[id]/submit]', err)
    return fail('Server error', 500)
  }
}

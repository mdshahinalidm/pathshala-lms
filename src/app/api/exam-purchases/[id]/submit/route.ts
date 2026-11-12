/**
 * POST /api/exam-purchases/[id]/submit — MANUAL payment proof submission.
 * Owner-only; keeps payStatus=SUBMITTED until an admin approves in the panel.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, rateLimit, requireAuth } from '@/lib/api-helpers'

export const runtime = 'nodejs'

const schema = z.object({
  senderNumber: z.string().min(6).max(30),
  submittedTrxId: z.string().min(4).max(60),
  note: z.string().max(600).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    if (rateLimit(req, 'exam-purchase-submit', 8, 60_000)) {
      return fail('Too many requests — please slow down.', 429)
    }

    const { id } = await params
    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    const purchase = await db.examPurchase.findUnique({
      where: { id },
      include: { exam: { select: { title: true } } },
    })
    if (!purchase || purchase.userId !== auth.id) return fail('Purchase not found.', 404)
    if (purchase.status !== 'PENDING') return fail('এই ক্রয়টি আর প্রসেস করা যাবে না।', 409)
    if (purchase.payStatus === 'SUBMITTED') return ok({ submitted: true, alreadySubmitted: true })

    await db.examPurchase.update({
      where: { id },
      data: {
        payStatus: 'SUBMITTED',
        senderNumber: parsed.senderNumber,
        submittedTrxId: parsed.submittedTrxId,
        submittedAt: new Date(),
        adminNote: parsed.note ? parsed.note.slice(0, 600) : null,
      },
      select: { id: true },
    })
    return ok({ submitted: true })
  } catch (err) {
    console.error('[POST /api/exam-purchases/[id]/submit]', err)
    return fail('Server error', 500)
  }
}

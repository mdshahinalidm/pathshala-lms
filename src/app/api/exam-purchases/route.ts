/**
 * GET /api/exam-purchases — the caller's paid-exam purchases (latest first).
 * Powers the student dashboard "My Exams" purchase-history strip: pending /
 * under-review purchases show their live status there until the admin (or a
 * live/sandbox gateway) settles the payment.
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAuth } from '@/lib/api-helpers'

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const purchases = await db.examPurchase.findMany({
      where: { userId: auth.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        examId: true, // lets /exams map purchases → written exam ids
        quizId: true,
        amount: true,
        method: true,
        status: true,
        trxId: true,
        invoiceNo: true,
        payStatus: true,
        adminNote: true,
        expiresAt: true,
        createdAt: true,
        quiz: {
          select: { id: true, title: true, isFree: true, price: true, durationMin: true },
        },
      },
    })

    return ok({ purchases })
  } catch (err) {
    console.error('[GET /api/exam-purchases]', err)
    return fail('Server error', 500)
  }
}

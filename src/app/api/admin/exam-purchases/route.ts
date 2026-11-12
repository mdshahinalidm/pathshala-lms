/**
 * GET /api/admin/exam-purchases — paid WRITTEN EXAM purchases review.
 * ?status=PENDING (default all). Includes student + exam info.
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAdmin } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (isResponse(auth)) return auth

    const sp = new URL(req.url).searchParams
    const status = sp.get('status')
    const where: Record<string, unknown> = {}
    if (status && ['PENDING', 'SUCCESS', 'FAILED'].includes(status)) where.status = status

    const rows = await db.examPurchase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, studentClass: true } },
        exam: { select: { id: true, title: true, price: true } },
      },
    })

    return ok(
      rows.map((r) => ({
        id: r.id,
        amount: r.amount,
        method: r.method,
        status: r.status,
        trxId: r.trxId,
        invoiceNo: r.invoiceNo,
        payStatus: r.payStatus,
        senderNumber: r.senderNumber,
        submittedTrxId: r.submittedTrxId,
        submittedAt: r.submittedAt?.toISOString() ?? null,
        adminNote: r.adminNote,
        createdAt: r.createdAt.toISOString(),
        user: r.user,
        exam: r.exam,
      }))
    )
  } catch (err) {
    console.error('[GET /api/admin/exam-purchases]', err)
    return fail('Server error', 500)
  }
}

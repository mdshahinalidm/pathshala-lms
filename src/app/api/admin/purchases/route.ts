/**
 * GET /api/admin/purchases — all suggestion purchases (panel, ADMIN+MANAGER).
 * Query: ?q=<trx/invoice/student/suggestion search> · ?status=PENDING|SUCCESS|FAILED
 *        · ?payStatus=SUBMITTED|... · latest 200.
 */
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAdmin } from '@/lib/api-helpers'

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const url = new URL(req.url)
    const q = url.searchParams.get('q')?.trim()
    const status = url.searchParams.get('status')?.trim()
    const payStatus = url.searchParams.get('payStatus')?.trim()

    const where: Prisma.SuggestionPurchaseWhereInput = {
      ...(status && ['PENDING', 'SUCCESS', 'FAILED'].includes(status)
        ? { status }
        : {}),
      ...(payStatus && ['NONE', 'SUBMITTED', 'APPROVED', 'REJECTED'].includes(payStatus)
        ? { payStatus }
        : {}),
      ...(q
        ? {
            OR: [
              { trxId: { contains: q } },
              { invoiceNo: { contains: q } },
              { submittedTrxId: { contains: q } },
              { user: { is: { name: { contains: q } } } },
              { user: { is: { email: { contains: q } } } },
              { user: { is: { phone: { contains: q } } } },
              { suggestion: { is: { title: { contains: q } } } },
            ],
          }
        : {}),
    }

    const purchases = await db.suggestionPurchase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        amount: true,
        method: true,
        status: true,
        trxId: true,
        invoiceNo: true,
        payStatus: true,
        senderNumber: true,
        submittedTrxId: true,
        submittedAt: true,
        adminNote: true,
        createdAt: true,
        user: {
          select: { id: true, name: true, email: true, phone: true, studentClass: true },
        },
        suggestion: { select: { id: true, title: true, price: true, isFree: true } },
      },
    })

    return ok(purchases)
  } catch (err) {
    console.error('[GET /api/admin/purchases]', err)
    return fail('Server error', 500)
  }
}

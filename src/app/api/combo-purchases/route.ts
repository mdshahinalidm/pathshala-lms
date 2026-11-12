/**
 * GET /api/combo-purchases — the caller's combo purchases (latest first).
 * Powers the checkout status strip and the dashboard "My Combos" history.
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAuth } from '@/lib/api-helpers'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const purchases = await db.comboPurchase.findMany({
      where: { userId: auth.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        comboId: true,
        amount: true,
        listAmount: true,
        discount: true,
        couponCode: true,
        method: true,
        status: true,
        trxId: true,
        invoiceNo: true,
        payStatus: true,
        adminNote: true,
        createdAt: true,
        combo: { select: { id: true, title: true, price: true, imageUrl: true } },
      },
    })

    return ok({ purchases })
  } catch (err) {
    console.error('[GET /api/combo-purchases]', err)
    return fail('Server error', 500)
  }
}

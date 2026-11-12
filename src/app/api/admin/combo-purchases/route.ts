/**
 * GET /api/admin/combo-purchases — every combo purchase (student + combo
 * joined) for the admin review table.
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireManager } from '@/lib/api-helpers'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth

    const purchases = await db.comboPurchase.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        combo: { select: { id: true, title: true, price: true } },
      },
    })

    return ok({ purchases })
  } catch (err) {
    console.error('[GET /api/admin/combo-purchases]', err)
    return fail('Server error', 500)
  }
}

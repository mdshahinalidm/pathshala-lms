/**
 * GET /api/combos — public list of ACTIVE combo offers with live item
 * decoration (title/price/availability) + computed originalTotal/savings.
 * powers the public combos page and the checkout cross-sell cards.
 */
import { db } from '@/lib/db'
import { fail, ok } from '@/lib/api-helpers'
import { decorateCombo } from '@/lib/combo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const combos = await db.combo.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { order: 'asc' } } },
    })
    const views = await Promise.all(combos.map((c) => decorateCombo(c)))
    return ok({ combos: views })
  } catch (err) {
    console.error('[GET /api/combos]', err)
    return fail('Server error', 500)
  }
}

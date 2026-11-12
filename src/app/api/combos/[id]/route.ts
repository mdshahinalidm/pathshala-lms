/**
 * GET /api/combos/[id] — public single combo (active only) with live item
 * decoration. Used by /checkout/combo/[id] and the offer cards.
 */
import { db } from '@/lib/db'
import { fail, ok } from '@/lib/api-helpers'
import { decorateCombo } from '@/lib/combo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const combo = await db.combo.findFirst({
      where: { id, isActive: true },
      include: { items: { orderBy: { order: 'asc' } } },
    })
    if (!combo) return fail('Combo not found', 404)
    return ok({ combo: await decorateCombo(combo) })
  } catch (err) {
    console.error('[GET /api/combos/[id]]', err)
    return fail('Server error', 500)
  }
}

/**
 * GET /api/suggestion-categories — PUBLIC active categories for the
 * suggestions page filter chips. Ordered by `order` (then creation time).
 * Only isActive rows are exposed; inactive ones stay admin-only.
 */
import { db } from '@/lib/db'
import { fail, ok } from '@/lib/api-helpers'

export async function GET() {
  try {
    const categories = await db.suggestionCategory.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, nameEn: true, slug: true },
    })
    return ok(categories)
  } catch (err) {
    console.error('[GET /api/suggestion-categories]', err)
    return fail('Server error', 500)
  }
}

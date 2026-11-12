/**
 * GET /api/testimonials — PUBLIC list of active, admin-curated testimonials
 * Ordered by `order` (lower first) then newest. Used by the home
 * page's "শিক্ষার্থীদের মতামত" section when the admin has added at least one
 * testimonial; otherwise the home page falls back to real course reviews
 * (previous behavior — zero visual change for existing sites).
 */
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'

export async function GET() {
  try {
    const items = await db.testimonial.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      take: 24,
      select: {
        id: true,
        name: true,
        role: true,
        roleEn: true,
        rating: true,
        comment: true,
        photoUrl: true,
      },
    })
    return ok(items)
  } catch (err) {
    console.error('[GET /api/testimonials]', err)
    return fail('Server error', 500)
  }
}

/**
 * GET  /api/admin/testimonials — list every curated testimonial (panel roles),
 *      ordered for curation (`order` asc, then newest first). Feeds the
 *      dedicated Admin → টেস্টিমোনিয়াল page.
 * POST /api/admin/testimonials — ADMIN/MANAGER creates one. The home page's
 *      "শিক্ষার্থীদের মতামত" section shows curated rows while at least one
 *      active row exists; an empty table keeps the real student reviews.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAuth, requireManager, sanitize } from '@/lib/api-helpers'
import { isPanelRole } from '@/lib/roles'

export const runtime = 'nodejs'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80),
  role: z.string().max(120).optional(),
  roleEn: z.string().max(120).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().min(1, 'Testimonial text is required').max(600),
  photoUrl: z.string().max(500).optional(),
  order: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
})

/** GET — every panel role can view the curation list. */
export async function GET(req: Request) {
  try {
    const user = await requireAuth(req)
    if (isResponse(user)) return user
    if (!isPanelRole(user.role)) return fail('Forbidden', 403)

    const rows = await db.testimonial.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    })
    return ok(rows)
  } catch (err) {
    console.error('[GET /api/admin/testimonials]', err)
    return fail('Server error', 500)
  }
}

/** POST — ADMIN/MANAGER creates a curated testimonial. */
export async function POST(req: Request) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const parsed = await parseBody(req, createSchema)
    if (isResponse(parsed)) return parsed

    const row = await db.testimonial.create({
      data: {
        name: sanitize(parsed.name, 80),
        role: parsed.role ? sanitize(parsed.role, 120) : '',
        roleEn: parsed.roleEn ? sanitize(parsed.roleEn, 120) : '',
        rating: parsed.rating ?? 5,
        comment: sanitize(parsed.comment, 600),
        photoUrl: parsed.photoUrl ? sanitize(parsed.photoUrl, 500) : null,
        order: parsed.order ?? 0,
        isActive: parsed.isActive ?? true,
      },
    })
    return ok(row, 201)
  } catch (err) {
    console.error('[POST /api/admin/testimonials]', err)
    return fail('Server error', 500)
  }
}

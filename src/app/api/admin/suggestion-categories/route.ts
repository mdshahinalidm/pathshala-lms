/**
 * GET  /api/admin/suggestion-categories — list suggestion categories with
 *        live usage counts (suggestions referencing each name). Panel roles.
 * POST /api/admin/suggestion-categories — ADMIN/MANAGER creates a category.
 *        `name` is stored verbatim in Suggestion.category (unique).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAdmin, requireManager, sanitize } from '@/lib/api-helpers'

export const runtime = 'nodejs'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').max(60),
  nameBn: z.string().max(60).optional(),
  description: z.string().max(300).optional(),
  order: z.number().int().min(0).max(9999).optional(),
})

/** GET — panel roles; ordered list + per-category suggestion usage count. */
export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const [categories, usage] = await Promise.all([
      db.suggestionCategory.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
      db.suggestion.groupBy({ by: ['category'], _count: { _all: true } }),
    ])
    const countBy = new Map(usage.map((u) => [u.category, u._count._all]))
    return ok(categories.map((c) => ({ ...c, _count: { suggestions: countBy.get(c.name) ?? 0 } })))
  } catch (err) {
    console.error('[GET /api/admin/suggestion-categories]', err)
    return fail('Server error', 500)
  }
}

/** POST — ADMIN/MANAGER creates a category (unique name). */
export async function POST(req: Request) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const parsed = await parseBody(req, createSchema)
    if (isResponse(parsed)) return parsed

    const name = sanitize(parsed.name, 60)
    if (!name) return fail('Name is required', 422)

    const dup = await db.suggestionCategory.findUnique({ where: { name }, select: { id: true } })
    if (dup) return fail('এই নামে ক্যাটাগরি আগে থেকেই আছে। (A category with this name already exists.)', 409)

    const category = await db.suggestionCategory.create({
      data: {
        name,
        nameBn: parsed.nameBn ? sanitize(parsed.nameBn, 60) || null : null,
        description: parsed.description ? sanitize(parsed.description, 300) || null : null,
        ...(parsed.order !== undefined ? { order: parsed.order } : {}),
      },
    })
    return ok({ ...category, _count: { suggestions: 0 } })
  } catch (err) {
    console.error('[POST /api/admin/suggestion-categories]', err)
    return fail('Server error', 500)
  }
}

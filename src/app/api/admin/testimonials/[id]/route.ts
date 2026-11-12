/**
 * PATCH  /api/admin/testimonials/[id] — ADMIN/MANAGER updates a curated
 *        testimonial (fields and/or the isActive toggle — partial bodies like
 *        { isActive:false } from the row switch are fine).
 * DELETE /api/admin/testimonials/[id] — ADMIN/MANAGER removes it; the home
 *        section falls back to real reviews once the table empties.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireManager, sanitize } from '@/lib/api-helpers'

export const runtime = 'nodejs'

const updateSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    role: z.string().max(120).optional(),
    roleEn: z.string().max(120).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().min(1).max(600).optional(),
    photoUrl: z.string().max(500).nullable().optional(),
    order: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .partial()

type Ctx = { params: Promise<{ id: string }> }

/** PATCH — partial update (toggle active / edit fields / reorder). */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const { id } = await ctx.params
    const parsed = await parseBody(req, updateSchema)
    if (isResponse(parsed)) return parsed

    const existing = await db.testimonial.findUnique({ where: { id } })
    if (!existing) return fail('Testimonial not found', 404)

    const data: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (value === undefined) continue
      if (typeof value === 'string') data[key] = sanitize(value, 600)
      else data[key] = value
    }

    const row = await db.testimonial.update({ where: { id }, data })
    return ok(row)
  } catch (err) {
    console.error('[PATCH /api/admin/testimonials/[id]]', err)
    return fail('Server error', 500)
  }
}

/** DELETE — remove a curated testimonial (home syncs on next load). */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const { id } = await ctx.params
    const existing = await db.testimonial.findUnique({ where: { id } })
    if (!existing) return fail('Testimonial not found', 404)

    await db.testimonial.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/testimonials/[id]]', err)
    return fail('Server error', 500)
  }
}

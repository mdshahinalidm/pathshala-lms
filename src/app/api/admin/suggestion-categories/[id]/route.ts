/**
 * PATCH  /api/admin/suggestion-categories/[id] — update a category (ADMIN/MANAGER).
 * DELETE /api/admin/suggestion-categories/[id] — delete a category (ADMIN/MANAGER).
 *
 * Suggestion.category is a plain string (no FK), so deleting a category never
 * breaks existing rows — the response reports how many suggestions still
 * reference the name so the panel can warn the admin before confirming.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireManager, sanitize } from '@/lib/api-helpers'

export const runtime = 'nodejs'

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  nameBn: z.string().max(60).nullable().optional(),
  description: z.string().max(300).nullable().optional(),
  order: z.number().int().min(0).max(9999).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const parsed = await parseBody(req, updateSchema)
    if (isResponse(parsed)) return parsed

    const existing = await db.suggestionCategory.findUnique({ where: { id } })
    if (!existing) return fail('Category not found', 404)

    let name = existing.name
    if (parsed.name !== undefined) {
      name = sanitize(parsed.name, 60)
      if (!name) return fail('Name is required', 422)
      if (name !== existing.name) {
        const dup = await db.suggestionCategory.findUnique({ where: { name }, select: { id: true } })
        if (dup) return fail('এই নামে ক্যাটাগরি আগে থেকেই আছে। (A category with this name already exists.)', 409)
      }
    }

    const updated = await db.suggestionCategory.update({
      where: { id },
      data: {
        ...(parsed.name !== undefined ? { name } : {}),
        ...(parsed.nameBn !== undefined
          ? { nameBn: parsed.nameBn === null ? null : sanitize(parsed.nameBn, 60) || null }
          : {}),
        ...(parsed.description !== undefined
          ? { description: parsed.description === null ? null : sanitize(parsed.description, 300) || null }
          : {}),
        ...(parsed.order !== undefined ? { order: parsed.order } : {}),
      },
    })

    // Renaming a category keeps existing suggestions pointing at the old
    // name — migrate them so every suggestion stays in its category.
    if (name !== existing.name) {
      await db.suggestion.updateMany({ where: { category: existing.name }, data: { category: name } })
    }

    const usage = await db.suggestion.count({ where: { category: updated.name } })
    return ok({ ...updated, _count: { suggestions: usage } })
  } catch (err) {
    console.error('[PATCH /api/admin/suggestion-categories/[id]]', err)
    return fail('Server error', 500)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const existing = await db.suggestionCategory.findUnique({ where: { id } })
    if (!existing) return fail('Category not found', 404)

    const usage = await db.suggestion.count({ where: { category: existing.name } })
    await db.suggestionCategory.delete({ where: { id } })
    return ok({ deleted: true, inUse: usage })
  } catch (err) {
    console.error('[DELETE /api/admin/suggestion-categories/[id]]', err)
    return fail('Server error', 500)
  }
}

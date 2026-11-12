/**
 * PUT    /api/categories/[id] — ADMIN partial update (name/nameEn/icon).
 * DELETE /api/categories/[id] — ADMIN delete. Courses keep existing via
 *        Course.categoryId onDelete:SetNull.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireManager, sanitize } from '@/lib/api-helpers'

const categoryUpdateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(60).optional(),
  nameEn: z.string().max(60).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
})

// ───────────────────────────────── PUT ─────────────────────────────────

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const parsed = await parseBody(req, categoryUpdateSchema)
    if (isResponse(parsed)) return parsed

    const existing = await db.category.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return fail('Category not found', 404)

    if (parsed.name !== undefined) {
      const name = sanitize(parsed.name, 60)
      if (name.length < 2) return fail('Name must be at least 2 characters', 422)
    }

    const data: { name?: string; nameEn?: string | null; icon?: string | null } = {}
    if (parsed.name !== undefined) data.name = sanitize(parsed.name, 60)
    if (parsed.nameEn !== undefined) {
      data.nameEn = parsed.nameEn === null ? null : sanitize(parsed.nameEn, 60) || null
    }
    if (parsed.icon !== undefined) {
      data.icon = parsed.icon === null ? null : sanitize(parsed.icon, 40) || null
    }

    const category = await db.category.update({
      where: { id },
      data,
      include: { _count: { select: { courses: true } } },
    })
    return ok(category)
  } catch (err) {
    console.error('[PUT /api/categories/[id]]', err)
    return fail('Server error', 500)
  }
}

// ──────────────────────────────── DELETE ────────────────────────────────

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const existing = await db.category.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return fail('Category not found', 404)

    // Course.categoryId is onDelete:SetNull — courses survive, just uncategorized.
    await db.category.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/categories/[id]]', err)
    return fail('Server error', 500)
  }
}

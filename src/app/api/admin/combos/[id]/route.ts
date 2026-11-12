/**
 * /api/admin/combos/[id] — combo management.
 *  PATCH  → edit fields and/or replace the item list (refs re-validated).
 *  DELETE → remove the combo (items cascade; purchases are kept).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireManager } from '@/lib/api-helpers'
import { resolveComboItemRef } from '@/lib/combo'

export const runtime = 'nodejs'

const comboItemSchema = z.object({
  itemType: z.enum(['COURSE', 'EXAM', 'SUGGESTION']),
  refId: z.string().min(1).max(64),
})

const patchSchema = z.object({
  title: z.string().min(2).max(140).optional(),
  description: z.string().max(1200).optional(),
  price: z.number().min(0).max(1_000_000).optional(),
  imageUrl: z.string().max(600).nullable().optional(),
  isActive: z.boolean().optional(),
  items: z.array(comboItemSchema).min(2).max(20).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const parsed = await parseBody(req, patchSchema)
    if (isResponse(parsed)) return parsed

    const combo = await db.combo.findUnique({ where: { id }, select: { id: true } })
    if (!combo) return fail('Combo not found.', 404)

    const data: Record<string, unknown> = {}
    if (parsed.title !== undefined) data.title = parsed.title.trim()
    if (parsed.description !== undefined) data.description = parsed.description.slice(0, 1200)
    if (parsed.price !== undefined) data.price = parsed.price
    if (parsed.imageUrl !== undefined) data.imageUrl = parsed.imageUrl?.trim() || null
    if (parsed.isActive !== undefined) data.isActive = parsed.isActive

    await db.$transaction(async (tx) => {
      if (parsed.items) {
        const resolved: { itemType: string; refId: string; titleSnapshot: string; order: number }[] = []
        for (const [i, item] of parsed.items.entries()) {
          const r = await resolveComboItemRef(item.itemType, item.refId)
          if (!r) throw Object.assign(new Error(`Item #${i + 1} not found (${item.itemType})`), { status: 422 })
          resolved.push({ itemType: item.itemType, refId: r.refId, titleSnapshot: r.titleSnapshot, order: i })
        }
        await tx.comboItem.deleteMany({ where: { comboId: id } })
        await tx.comboItem.createMany({ data: resolved.map((r) => ({ ...r, comboId: id })) })
      }
      if (Object.keys(data).length > 0) {
        await tx.combo.update({ where: { id }, data })
      }
    })

    const updated = await db.combo.findUnique({
      where: { id },
      include: { items: { orderBy: { order: 'asc' } } },
    })
    return ok({ combo: updated })
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500
    if (status !== 500) return fail((err as Error).message, status)
    console.error('[PATCH /api/admin/combos/[id]]', err)
    return fail('Server error', 500)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth
    const { id } = await params
    const combo = await db.combo.findUnique({ where: { id }, select: { id: true } })
    if (!combo) return fail('Combo not found.', 404)
    await db.combo.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/combos/[id]]', err)
    return fail('Server error', 500)
  }
}

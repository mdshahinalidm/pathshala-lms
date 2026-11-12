/**
 * /api/admin/combos — combo offer management.
 *  GET   → every combo (any active state) with items, for the admin table.
 *  POST  → create: { title, description?, price, isActive?, imageUrl?,
 *          items: [{ itemType: COURSE|EXAM|SUGGESTION, refId }] }
 *          Titles are snapshotted at creation time; refs are validated.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireManager } from '@/lib/api-helpers'
import { resolveComboItemRef } from '@/lib/combo'

export const runtime = 'nodejs'

export const comboItemSchema = z.object({
  itemType: z.enum(['COURSE', 'EXAM', 'SUGGESTION']),
  refId: z.string().min(1).max(64),
})

const createSchema = z.object({
  title: z.string().min(2).max(140),
  description: z.string().max(1200).optional().default(''),
  price: z.number().min(0).max(1_000_000),
  imageUrl: z.string().max(600).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  items: z.array(comboItemSchema).min(2).max(20),
})

export async function GET(req: Request) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth

    const combos = await db.combo.findMany({
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { order: 'asc' } } },
    })
    return ok({ combos })
  } catch (err) {
    console.error('[GET /api/admin/combos]', err)
    return fail('Server error', 500)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth

    const parsed = await parseBody(req, createSchema)
    if (isResponse(parsed)) return parsed

    // Validate every ref and snapshot its current title.
    const resolved: { itemType: string; refId: string; titleSnapshot: string }[] = []
    for (const [i, item] of parsed.items.entries()) {
      const r = await resolveComboItemRef(item.itemType, item.refId)
      if (!r) return fail(`Item #${i + 1} not found (${item.itemType}: ${item.refId})`, 422)
      resolved.push({ itemType: item.itemType, refId: r.refId, titleSnapshot: r.titleSnapshot })
    }

    const combo = await db.combo.create({
      data: {
        title: parsed.title.trim(),
        description: (parsed.description ?? '').slice(0, 1200),
        price: parsed.price,
        imageUrl: parsed.imageUrl?.trim() || null,
        isActive: parsed.isActive,
        items: {
          create: resolved.map((r, i) => ({ ...r, order: i })),
        },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    })

    return ok({ combo }, 201)
  } catch (err) {
    console.error('[POST /api/admin/combos]', err)
    return fail('Server error', 500)
  }
}

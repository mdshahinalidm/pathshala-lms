/**
 * /api/admin/media — Media Library backend.
 *
 * GET    ?kind=IMAGE|VIDEO|PDF|FILE&q=&page=&limit= — paginated asset list.
 * DELETE { ids: string[] } — bulk delete: removes DB rows AND the physical
 *          files (only paths that resolve inside public/uploads — path
 *          traversal impossible). Deleting an asset never breaks lessons:
 *          course data keeps its own URL copy.
 */
import { unlink } from 'fs/promises'
import path from 'path'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAdmin, requireManager } from '@/lib/api-helpers'

export const runtime = 'nodejs'

const KINDS = ['IMAGE', 'VIDEO', 'PDF', 'FILE'] as const

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const url = new URL(req.url)
    const kindParam = (url.searchParams.get('kind') ?? '').toUpperCase()
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80)
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
    const limit = Math.min(96, Math.max(6, Number(url.searchParams.get('limit') ?? '24') || 24))

    const where: {
      kind?: string
      OR?: Array<{ originalName: { contains: string } } | { title: { contains: string } }>
    } = {}
    if ((KINDS as readonly string[]).includes(kindParam)) where.kind = kindParam
    if (q) where.OR = [{ originalName: { contains: q } }, { title: { contains: q } }]

    const [total, assets, counts] = await Promise.all([
      db.mediaAsset.count({ where }),
      db.mediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.mediaAsset.groupBy({ by: ['kind'], _count: { _all: true }, _sum: { size: true } }),
    ])

    const byKind: Record<string, { count: number; bytes: number }> = {}
    for (const row of counts) {
      byKind[row.kind] = { count: row._count._all, bytes: row._sum.size ?? 0 }
    }

    return ok({
      assets,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      byKind,
    })
  } catch (err) {
    console.error('[GET /api/admin/media]', err)
    return fail('Server error', 500)
  }
}

const deleteSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) })

/** Only delete files that resolve strictly inside public/uploads. */
function safeUploadPath(url: string): string | null {
  if (!url.startsWith('/uploads/') || url.includes('..') || url.includes('\\')) return null
  const resolved = path.resolve(path.join(process.cwd(), 'public'), `.${url}`)
  const root = path.resolve(path.join(process.cwd(), 'public', 'uploads'))
  if (!resolved.startsWith(root + path.sep)) return null
  return resolved
}

export async function DELETE(req: Request) {
  try {
    // Media deletion is content management → ADMIN/MANAGER (moderator read-only).
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const parsed = await parseBody(req, deleteSchema)
    if (isResponse(parsed)) return parsed

    const assets = await db.mediaAsset.findMany({
      where: { id: { in: parsed.ids } },
      select: { id: true, url: true },
    })
    if (assets.length === 0) return ok({ deleted: 0 })

    await Promise.all(
      assets.map(async (a) => {
        const p = safeUploadPath(a.url)
        if (p) {
          try {
            await unlink(p)
          } catch {
            /* file may already be gone — row delete still proceeds */
          }
        }
      })
    )

    const result = await db.mediaAsset.deleteMany({
      where: { id: { in: assets.map((a) => a.id) } },
    })
    return ok({ deleted: result.count })
  } catch (err) {
    console.error('[DELETE /api/admin/media]', err)
    return fail('Server error', 500)
  }
}

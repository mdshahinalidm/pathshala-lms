/**
 * /api/suggestions/[id] — admin detail, edit and delete of a study material.
 *
 * GET    (admin) edit-prefill: every editable field (fileData NEVER leaves
 *        the server) + hasFile flag.
 * PUT    (admin) update title/description/category/isFree/price and, when a
 *        new inline file or an external URL is supplied, replace the stored
 *        file. Omitting both keeps the current file untouched.
 * DELETE (admin) remove the material.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, requireManager, isResponse, parseBody, sanitize } from '@/lib/api-helpers'

const BUILT_IN_CATEGORIES = ['SSC', 'HSC', 'ADMISSION', 'JOB', 'GENERAL']

const suggestionUpdateSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(150),
  description: z.string().max(2000).nullish(),
  category: z.string().min(1, 'Category is required').max(50),
  isFree: z.boolean(),
  price: z.number().min(0).nullish(),
  fileName: z.string().max(200).nullish(),
  fileType: z
    .string()
    .max(100)
    .regex(/^[\w.+-]+\/[\w.+-]+$/, 'fileType must look like application/pdf')
    .nullish(),
  fileSize: z.number().int().min(0).nullish(),
  fileData: z
    .string()
    .max(8_000_000, 'File too large — inline files must stay under ~6 MB')
    .nullish(),
  fileUrl: z.string().max(1000).nullish(),
})

/** GET /api/suggestions/[id] (admin) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin
    const { id } = await params

    const row = await db.suggestion.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        isFree: true,
        price: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        fileUrl: true,
        downloads: true,
        createdAt: true,
      },
    })
    if (!row) return fail('Material not found', 404)

    return ok({ ...row, hasFile: Boolean(row.fileName || row.fileUrl) })
  } catch (err) {
    console.error('[GET /api/suggestions/[id]]', err)
    return fail('Server error', 500)
  }
}

/** PUT /api/suggestions/[id] (admin) */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin
    const { id } = await params

    const existing = await db.suggestion.findUnique({
      where: { id },
      select: { id: true, price: true, category: true },
    })
    if (!existing) return fail('Material not found', 404)

    const body = await parseBody(req, suggestionUpdateSchema)
    if (isResponse(body)) return body

    const title = sanitize(body.title, 150)
    if (title.length < 3) return fail('Title is invalid after sanitization', 422)
    const description = body.description ? sanitize(body.description, 2000) : null

    // Category: built-in, one created in Admin → Suggestion categories, or
    // the material's current category (legacy seeded values like GENERAL /
    // JOB / HONOURS stay valid when the row is edited without recategorising).
    const category = body.category.trim()
    if (category !== existing.category) {
      if (!BUILT_IN_CATEGORIES.includes(category)) {
        const custom = await db.suggestionCategory.findFirst({
          where: { name: category },
          select: { id: true },
        })
        if (!custom) return fail('Unknown category', 422)
      }
    }

    // ── File resolution ──
    // ① New inline file → replaces everything (external URL cleared).
    let fileData: string | null = null
    let fileName: string | null | undefined
    let fileType: string | null | undefined
    let fileSize: number | null | undefined
    let fileUrl: string | null | undefined
    let clearFileData = false

    if (body.fileData) {
      const raw = body.fileData
      const commaIdx = raw.startsWith('data:') ? raw.indexOf(',') : -1
      fileData = commaIdx >= 0 ? raw.slice(commaIdx + 1) : raw
      if (fileData.length >= 8_000_000) {
        return fail('File too large — inline files must stay under ~6 MB', 422)
      }
      fileName =
        (body.fileName ? sanitize(body.fileName, 200) : '') || 'pathshala-material.pdf'
      fileType = body.fileType ?? 'application/octet-stream'
      fileSize = body.fileSize ?? Buffer.from(fileData, 'base64').length
      fileUrl = null
    } else if (body.fileUrl && body.fileUrl.trim()) {
      // ② External URL → becomes THE file (stale inline data must not win).
      try {
        const u = new URL(body.fileUrl.trim())
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad protocol')
        fileUrl = u.toString()
      } catch {
        return fail('fileUrl must be a valid http(s) URL', 422)
      }
      clearFileData = true
      fileName = body.fileName ? sanitize(body.fileName, 200) : undefined
      fileType = body.fileType ?? undefined
      fileSize = null
    }
    // ③ Neither supplied → every file field stays exactly as it is.

    const price = body.isFree ? null : (body.price ?? existing.price ?? null)

    const updated = await db.suggestion.update({
      where: { id },
      data: {
        title,
        description,
        category,
        isFree: body.isFree,
        price,
        ...(fileData !== null
          ? { fileData, fileName, fileType, fileSize, fileUrl }
          : clearFileData
            ? { fileData: null, fileUrl, ...(fileName !== undefined ? { fileName } : {}), ...(fileType !== undefined ? { fileType } : {}), fileSize }
            : {}),
      },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        isFree: true,
        price: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        fileUrl: true,
        downloads: true,
        createdAt: true,
      },
    })

    // Never echo fileData back.
    return ok({ ...updated, hasFile: Boolean(updated.fileName || updated.fileUrl) })
  } catch (err) {
    console.error('[PUT /api/suggestions/[id]]', err)
    return fail('Server error', 500)
  }
}

/** DELETE /api/suggestions/[id] (admin) */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const existing = await db.suggestion.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return fail('Material not found', 404)

    await db.suggestion.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/suggestions/[id]]', err)
    return fail('Server error', 500)
  }
}

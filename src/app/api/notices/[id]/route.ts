/**
 * /api/notices/[id] — admin update / delete of a notice.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  fail,
  requireManager,
  isResponse,
  parseBody,
  sanitize,
} from '@/lib/api-helpers'

const noticeUpdateSchema = z.object({
  title: z.string().min(3).max(150).optional(),
  body: z.string().min(10).max(4000).optional(),
  type: z.enum(['URGENT', 'GENERAL', 'EVENT']).optional(),
  isBanner: z.boolean().optional(),
  imageUrl: z.string().max(600).nullable().optional(),
  pdfUrl: z.string().max(600).nullable().optional(),
  pdfName: z.string().max(200).nullable().optional(),
})

/** PUT /api/notices/[id] (admin) — partial update */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const existing = await db.notice.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return fail('Notice not found', 404)

    const body = await parseBody(req, noticeUpdateSchema)
    if (isResponse(body)) return body

    const data: {
      title?: string
      body?: string
      type?: string
      isBanner?: boolean
      imageUrl?: string | null
      pdfUrl?: string | null
      pdfName?: string | null
    } = {}

    if (body.title !== undefined) {
      const title = sanitize(body.title, 150)
      if (title.length < 3) return fail('Title is invalid after sanitization', 422)
      data.title = title
    }
    if (body.body !== undefined) {
      const text = sanitize(body.body, 4000)
      if (text.length < 10) return fail('Body is invalid after sanitization', 422)
      data.body = text
    }
    if (body.type !== undefined) data.type = body.type
    if (body.isBanner !== undefined) data.isBanner = body.isBanner
    if (body.imageUrl !== undefined) {
      data.imageUrl = body.imageUrl ? sanitize(body.imageUrl, 600) : null
    }
    if (body.pdfUrl !== undefined) {
      data.pdfUrl = body.pdfUrl ? sanitize(body.pdfUrl, 600) : null
      if (!body.pdfUrl) data.pdfName = null // clearing the PDF clears its label
    }
    if (body.pdfName !== undefined) {
      data.pdfName = body.pdfName ? sanitize(body.pdfName, 200) : null
    }

    const notice = await db.notice.update({ where: { id }, data })
    return ok(notice)
  } catch (err) {
    console.error('[PUT /api/notices/[id]]', err)
    return fail('Server error', 500)
  }
}

/** DELETE /api/notices/[id] (admin) */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const existing = await db.notice.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return fail('Notice not found', 404)

    await db.notice.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/notices/[id]]', err)
    return fail('Server error', 500)
  }
}

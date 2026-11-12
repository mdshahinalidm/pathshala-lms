/**
 * /api/subjects/[id] — ADMIN update / delete a subject.
 * PATCH  {name?, nameEn?} — rename (slug unchanged → links stay stable).
 * DELETE — removes the subject; CourseSubject pivot rows cascade (courses
 *          themselves are NEVER touched — zero data loss).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireManager, sanitize } from '@/lib/api-helpers'

const subjectUpdateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  nameEn: z.string().max(60).optional(),
})

/** PATCH /api/subjects/[id] (admin) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const parsed = await parseBody(req, subjectUpdateSchema)
    if (isResponse(parsed)) return parsed

    const existing = await db.subject.findUnique({ where: { id } })
    if (!existing) return fail('Subject not found', 404)

    const data: { name?: string; nameEn?: string } = {}
    if (parsed.name !== undefined) data.name = sanitize(parsed.name, 60)
    if (parsed.nameEn !== undefined) data.nameEn = sanitize(parsed.nameEn, 60)

    const subject = await db.subject.update({ where: { id }, data })
    return ok(subject)
  } catch (err) {
    console.error('[PATCH /api/subjects/[id]]', err)
    return fail('Server error', 500)
  }
}

/** DELETE /api/subjects/[id] (admin) */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const existing = await db.subject.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return fail('Subject not found', 404)

    await db.subject.delete({ where: { id } }) // CourseSubject pivot cascades; courses untouched
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/subjects/[id]]', err)
    return fail('Server error', 500)
  }
}

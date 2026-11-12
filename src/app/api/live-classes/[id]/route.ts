/**
 * PUT    /api/live-classes/[id] — ADMIN updates a live class (partial).
 * DELETE /api/live-classes/[id] — ADMIN deletes a live class.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireManager, sanitize } from '@/lib/api-helpers'

const liveClassUpdateSchema = z.object({
  title: z.string().min(2).max(150).optional(),
  provider: z.enum(['ZOOM', 'MEET', 'CUSTOM']).optional(),
  joinUrl: z
    .string()
    .min(4)
    .max(1000)
    .regex(/^https?:\/\/.+/i, 'Join URL must be a valid http(s) link')
    .optional(),
  scheduledAt: z.coerce.date().optional(),
  durationMin: z.number().int().min(5).max(600).optional(),
  notes: z.string().max(2000).optional().nullable(),
  courseId: z.string().optional().nullable(),
  isPublished: z.boolean().optional(),
})

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const parsed = await parseBody(req, liveClassUpdateSchema)
    if (isResponse(parsed)) return parsed

    const existing = await db.liveClass.findUnique({ where: { id } })
    if (!existing) return fail('Live class not found', 404)

    if (parsed.courseId) {
      const course = await db.course.findUnique({ where: { id: parsed.courseId }, select: { id: true } })
      if (!course) return fail('Course not found', 404)
    }

    const liveClass = await db.liveClass.update({
      where: { id },
      data: {
        ...(parsed.title !== undefined ? { title: sanitize(parsed.title, 150) } : {}),
        ...(parsed.provider !== undefined ? { provider: parsed.provider } : {}),
        ...(parsed.joinUrl !== undefined ? { joinUrl: parsed.joinUrl.trim() } : {}),
        ...(parsed.scheduledAt !== undefined ? { scheduledAt: parsed.scheduledAt } : {}),
        ...(parsed.durationMin !== undefined ? { durationMin: parsed.durationMin } : {}),
        ...(parsed.notes !== undefined ? { notes: parsed.notes ? sanitize(parsed.notes, 2000) : null } : {}),
        ...(parsed.courseId !== undefined ? { courseId: parsed.courseId || null } : {}),
        ...(parsed.isPublished !== undefined ? { isPublished: parsed.isPublished } : {}),
      },
      include: { course: { select: { id: true, title: true, slug: true } } },
    })
    return ok(liveClass)
  } catch (err) {
    console.error('[PUT /api/live-classes/[id]]', err)
    return fail('Server error', 500)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const existing = await db.liveClass.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return fail('Live class not found', 404)

    await db.liveClass.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/live-classes/[id]]', err)
    return fail('Server error', 500)
  }
}

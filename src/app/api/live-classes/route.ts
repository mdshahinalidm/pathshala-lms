/**
 * GET  /api/live-classes — published classes sorted by scheduledAt (newest first)
 *                          with course {id, title, slug}. ADMIN + ?scope=all → all.
 * POST /api/live-classes — ADMIN creates a live class.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, rateLimit, requireManager, requireAuth, sanitize } from '@/lib/api-helpers'

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const scopeAll =
      new URL(req.url).searchParams.get('scope') === 'all' &&
      (auth.role === 'ADMIN' || auth.role === 'MANAGER' || auth.role === 'MODERATOR')

    const classes = await db.liveClass.findMany({
      where: scopeAll ? {} : { isPublished: true },
      orderBy: { scheduledAt: 'desc' },
      take: 200,
      include: { course: { select: { id: true, title: true, slug: true } } },
    })
    return ok(classes)
  } catch (err) {
    console.error('[GET /api/live-classes]', err)
    return fail('Server error', 500)
  }
}

const liveClassCreateSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(150),
  provider: z.enum(['ZOOM', 'MEET', 'CUSTOM']).default('ZOOM'),
  joinUrl: z
    .string()
    .min(4, 'Join URL is required')
    .max(1000)
    .regex(/^https?:\/\/.+/i, 'Join URL must be a valid http(s) link'),
  scheduledAt: z.coerce.date(),
  durationMin: z.number().int().min(5).max(600).default(60),
  notes: z.string().max(2000).optional().nullable(),
  courseId: z.string().optional().nullable(),
  isPublished: z.boolean().default(true),
})

export async function POST(req: Request) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth

    const limited = rateLimit(req, 'live-classes-create', 30, 60_000)
    if (limited) return limited

    const parsed = await parseBody(req, liveClassCreateSchema)
    if (isResponse(parsed)) return parsed

    if (parsed.courseId) {
      const course = await db.course.findUnique({ where: { id: parsed.courseId }, select: { id: true } })
      if (!course) return fail('Course not found', 404)
    }

    const liveClass = await db.liveClass.create({
      data: {
        title: sanitize(parsed.title, 150),
        provider: parsed.provider,
        joinUrl: parsed.joinUrl.trim(),
        scheduledAt: parsed.scheduledAt,
        durationMin: parsed.durationMin,
        notes: parsed.notes ? sanitize(parsed.notes, 2000) : null,
        courseId: parsed.courseId || null,
        isPublished: parsed.isPublished,
      },
      include: { course: { select: { id: true, title: true, slug: true } } },
    })
    return ok(liveClass, 201)
  } catch (err) {
    console.error('[POST /api/live-classes]', err)
    return fail('Server error', 500)
  }
}

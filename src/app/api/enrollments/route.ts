/**
 * GET   /api/enrollments — own enrollments with course summary + lessonsTotal
 * PATCH /api/enrollments — mark a lesson complete ({courseId, lessonId}),
 *                          recompute progress (completed/lessonsTotal*100).
 *                          On reaching 100% a Certificate is auto-issued
 *                          (idempotent via @@unique userId+courseId) plus a
 *                          COURSE notification carrying the public serial.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAuth } from '@/lib/api-helpers'

function parseCompletedIds(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

async function lessonsTotalFor(courseId: string): Promise<number> {
  const chapters = await db.chapter.findMany({
    where: { courseId },
    select: { _count: { select: { lessons: true } } },
  })
  return chapters.reduce((sum, ch) => sum + ch._count.lessons, 0)
}

/** PS-CERT-XXXXXXXX — 8 random uppercase A-Z0-9 chars, uniqueness-checked. */
async function makeCertificateSerial(): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  for (let attempt = 0; attempt < 8; attempt++) {
    let suffix = ''
    for (let i = 0; i < 8; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
    const serial = `PS-CERT-${suffix}`
    const clash = await db.certificate.findUnique({ where: { serial }, select: { id: true } })
    if (!clash) return serial
  }
  return `PS-CERT-${Date.now().toString(36).toUpperCase().slice(-8)}`
}

/** Auto-issue a completion certificate exactly once per user+course. */
async function issueCertificateIfComplete(userId: string, courseId: string): Promise<void> {
  const existing = await db.certificate.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true },
  })
  if (existing) return // already issued — never duplicate

  const course = await db.course.findUnique({ where: { id: courseId }, select: { title: true } })
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  if (!course || !user) return

  const serial = await makeCertificateSerial()
  await db.certificate.create({
    data: {
      serial,
      userId,
      courseId,
      studentName: user.name,
      courseTitle: course.title,
    },
  })

  await db.notification.create({
    data: {
      userId,
      type: 'COURSE',
      title: '🎓 সার্টিফিকেট অর্জিত হয়েছে!',
      body: `অভিনন্দন! আপনি "${course.title}" কোর্সটি ১০০% সম্পন্ন করেছেন। সার্টিফিকেট সিরিয়াল: ${serial} (certificate serial)। ড্যাশবোর্ডের সার্টিফিকেট পেজ থেকে ডাউনলোড করুন।`,
      link: '/dashboard/certificates',
    },
  })
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const enrollments = await db.enrollment.findMany({
      where: { userId: auth.id },
      orderBy: { enrolledAt: 'desc' },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            thumbnail: true,
            price: true,
            level: true,
            isLifetime: true,
            validityMonths: true,
            chapters: { select: { lessons: { select: { id: true } } } },
          },
        },
      },
    })

    const list = enrollments.map((e) => {
      const { chapters, ...course } = e.course
      const lessonsTotal = chapters.reduce((sum, ch) => sum + ch.lessons.length, 0)
      // Validity status: Active | Expiring Soon (≤7 days) | Expired | Lifetime
      const status = !e.expiresAt
        ? 'LIFETIME'
        : e.expiresAt.getTime() <= Date.now()
          ? 'EXPIRED'
          : e.expiresAt.getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000
            ? 'EXPIRING_SOON'
            : 'ACTIVE'
      return {
        id: e.id,
        progress: e.progress,
        enrolledAt: e.enrolledAt,
        expiresAt: e.expiresAt,
        accessStatus: status,
        completedLessonIds: parseCompletedIds(e.completedLessonIds),
        course,
        lessonsTotal,
      }
    })
    return ok(list)
  } catch (err) {
    console.error('[GET /api/enrollments]', err)
    return fail('Server error', 500)
  }
}

const patchSchema = z.object({
  courseId: z.string().min(1),
  lessonId: z.string().min(1),
})

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const parsed = await parseBody(req, patchSchema)
    if (isResponse(parsed)) return parsed

    const enrollment = await db.enrollment.findUnique({
      where: { userId_courseId: { userId: auth.id, courseId: parsed.courseId } },
    })
    if (!enrollment) return fail('Enrollment not found', 404)

    const lesson = await db.lesson.findFirst({
      where: { id: parsed.lessonId, chapter: { courseId: parsed.courseId } },
      select: { id: true },
    })
    if (!lesson) return fail('Lesson not found in this course', 404)

    const completed = parseCompletedIds(enrollment.completedLessonIds)
    if (!completed.includes(parsed.lessonId)) completed.push(parsed.lessonId)

    const lessonsTotal = await lessonsTotalFor(parsed.courseId)
    const progress = lessonsTotal > 0 ? Math.round((completed.length / lessonsTotal) * 100) : 0
    const clamped = Math.min(progress, 100)

    await db.enrollment.update({
      where: { id: enrollment.id },
      data: { completedLessonIds: JSON.stringify(completed), progress: clamped },
    })

    if (clamped >= 100) {
      await issueCertificateIfComplete(auth.id, parsed.courseId)
    }

    return ok({ progress: clamped })
  } catch (err) {
    console.error('[PATCH /api/enrollments]', err)
    return fail('Server error', 500)
  }
}

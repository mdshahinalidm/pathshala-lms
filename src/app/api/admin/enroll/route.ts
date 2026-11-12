/**
 * /api/admin/enroll — manually enroll a student into a course (admin only).
 * Idempotent: if the enrollment already exists it is returned untouched
 * (no duplicate notification). New enrollments fire a COURSE notification.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, requireManager, isResponse, parseBody } from '@/lib/api-helpers'
import { enrollmentExpiryFor } from '@/lib/enrollment'

const enrollSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  courseId: z.string().min(1, 'courseId is required'),
})

/** POST /api/admin/enroll (admin) */
export async function POST(req: Request) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const body = await parseBody(req, enrollSchema)
    if (isResponse(body)) return body

    const [user, course] = await Promise.all([
      db.user.findUnique({ where: { id: body.userId }, select: { id: true, name: true } }),
      db.course.findUnique({
        where: { id: body.courseId },
        // isLifetime/validityMonths are REQUIRED by enrollmentExpiryFor —
        // without them a limited-validity course would silently enroll as
        // lifetime.
        select: { id: true, title: true, isLifetime: true, validityMonths: true },
      }),
    ])
    if (!user) return fail('User not found', 404)
    if (!course) return fail('Course not found', 404)

    const existing = await db.enrollment.findUnique({
      where: {
        userId_courseId: { userId: body.userId, courseId: body.courseId },
      },
    })
    if (existing) {
      // Already enrolled — skip creation & notification.
      return ok({ enrolled: true, alreadyEnrolled: true, enrollment: existing })
    }

    // Apply the course-validity expiry (single shared rule).
    const expiresAt = enrollmentExpiryFor(course)
    const enrollment = await db.enrollment.create({
      data: { userId: body.userId, courseId: body.courseId, expiresAt },
    })

    await db.notification.create({
      data: {
        userId: body.userId,
        type: 'COURSE',
        title: '✨ অ্যাডমিন কর্তৃক ভর্তি',
        body: `আপনাকে "${course.title}" কোর্সে ভর্তি করা হয়েছে। এখনই শেখা শুরু করুন!`,
        link: '/dashboard',
      },
    })

    return ok({ enrolled: true, alreadyEnrolled: false, enrollment })
  } catch (err) {
    console.error('[POST /api/admin/enroll]', err)
    return fail('Server error', 500)
  }
}

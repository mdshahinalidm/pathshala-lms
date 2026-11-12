/**
 * POST /api/enroll-free — one-click enrollment for 100% free courses
 * (price === 0 AND discountPrice === 0). Paid courses must go through
 * /api/orders + /api/orders/[id]/confirm.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAuth } from '@/lib/api-helpers'
import { enrollmentExpiryFor } from '@/lib/enrollment'

const enrollFreeSchema = z.object({
  courseId: z.string().min(1),
})

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const parsed = await parseBody(req, enrollFreeSchema)
    if (isResponse(parsed)) return parsed

    const course = await db.course.findUnique({
      where: { id: parsed.courseId },
      // isLifetime/validityMonths are REQUIRED by enrollmentExpiryFor.
      select: { id: true, isPublished: true, price: true, discountPrice: true, isLifetime: true, validityMonths: true },
    })
    if (!course || !course.isPublished) return fail('Course not found or unavailable', 404)

    // Free = price 0 and no non-zero discount (discountPrice is nullable).
    const isFree = course.price === 0 && (course.discountPrice === null || course.discountPrice === 0)
    if (!isFree) {
      return fail('This course is not free. Please complete payment to enroll.', 400)
    }

    const existing = await db.enrollment.findUnique({
      where: { userId_courseId: { userId: auth.id, courseId: course.id } },
      select: { id: true },
    })
    if (!existing) {
      // Course-validity expiry applied (single shared rule).
      const expiresAt = enrollmentExpiryFor(course)
      await db.enrollment.create({ data: { userId: auth.id, courseId: course.id, expiresAt } })
    }
    return ok({ enrolled: true })
  } catch (err) {
    console.error('[POST /api/enroll-free]', err)
    return fail('Server error', 500)
  }
}

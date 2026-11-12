/**
 * GET  /api/reviews?courseId= — approved reviews (latest 12); without courseId
 *      the latest 12 approved reviews across the platform are returned.
 * POST /api/reviews — authenticated user posts a review (rating 1..5).
 *      new reviews are created as PENDING (isApproved: false) —
 *      they only appear on the website after the admin approves them from
 *      Admin → Review Moderation. Existing approved reviews are untouched.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAuth, sanitize } from '@/lib/api-helpers'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const courseId = searchParams.get('courseId')?.trim() || ''

    const reviews = await db.review.findMany({
      where: { isApproved: true, ...(courseId ? { courseId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        userName: true,
        userRole: true,
        rating: true,
        comment: true,
        createdAt: true,
        course: {
          select: {
            title: true,
            titleEn: true,
            slug: true,
            subject: true,
            category: { select: { name: true, nameEn: true } },
          },
        },
      },
    })
    // Enriched payload: userRole ≈ class info, course.subject/title ≈ subject
    const enriched = reviews.map((r) => ({
      id: r.id,
      userName: r.userName,
      userRole: r.userRole,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      courseTitle: r.course?.title ?? null,
      courseTitleEn: r.course?.titleEn ?? null,
      courseSlug: r.course?.slug ?? null,
      subject: r.course?.subject ?? null,
      categoryName: r.course?.category?.name ?? null,
      categoryEn: r.course?.category?.nameEn ?? null,
    }))
    return ok(enriched)
  } catch (err) {
    console.error('[GET /api/reviews]', err)
    return fail('Server error', 500)
  }
}

const reviewCreateSchema = z.object({
  rating: z.number().int().min(1, 'Rating must be 1..5').max(5, 'Rating must be 1..5'),
  comment: z.string().min(5, 'Comment must be at least 5 characters').max(600),
  userName: z.string().max(80).optional(),
  courseId: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const parsed = await parseBody(req, reviewCreateSchema)
    if (isResponse(parsed)) return parsed

    const comment = sanitize(parsed.comment, 600)
    if (comment.length < 5) return fail('Comment must be at least 5 characters', 422)

    const userName = sanitize(parsed.userName?.trim() || auth.name, 80) || 'Student'

    let courseId: string | null = null
    if (parsed.courseId) {
      // The course page URL carries a SLUG (/courses/[slug]) while some callers
      // pass the raw id — resolve both so a purchased student can always review
      // (same lookup contract as GET /api/courses/[id]).
      const course = await db.course.findFirst({
        where: { OR: [{ id: parsed.courseId }, { slug: parsed.courseId }] },
        select: { id: true },
      })
      if (!course) return fail('Course not found', 422)
      courseId = course.id
    }

    const review = await db.review.create({
      data: {
        userName,
        userRole: 'Verified Student',
        rating: parsed.rating,
        comment,
        userId: auth.id,
        courseId,
        // reviews WAIT for admin approval — created pending so the
        // website only ever shows admin-approved reviews (moderation gate).
        isApproved: false,
      },
    })
    return ok(review)
  } catch (err) {
    console.error('[POST /api/reviews]', err)
    return fail('Server error', 500)
  }
}

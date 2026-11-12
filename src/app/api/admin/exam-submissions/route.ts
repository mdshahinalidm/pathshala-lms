/**
 * GET /api/admin/exam-submissions — ADMIN RESULT CENTER (spec #12, #22).
 * Every written-exam submission with filters:
 *   ?examId= &courseId= &categoryId= &subjectId= &reviewStatus= &from= &to=
 *   &q= (student name / email / phone / exam title / invoice-ish id)
 * View = all panel roles; marking rights live on the PATCH route.
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAdmin } from '@/lib/api-helpers'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const url = new URL(req.url)
    const examId = url.searchParams.get('examId') ?? ''
    const courseId = url.searchParams.get('courseId') ?? ''
    const categoryId = url.searchParams.get('categoryId') ?? ''
    const subjectId = url.searchParams.get('subjectId') ?? ''
    const reviewStatus = url.searchParams.get('reviewStatus') ?? ''
    const from = url.searchParams.get('from') ?? ''
    const to = url.searchParams.get('to') ?? ''
    const q = (url.searchParams.get('q') ?? '').trim()

    const where: Record<string, unknown> = {}
    if (examId) where.examId = examId
    if (courseId) where.courseId = courseId
    if (categoryId) where.categoryId = categoryId
    if (subjectId) where.subjectId = subjectId
    if (reviewStatus) where.reviewStatus = reviewStatus
    if (from || to) {
      const submittedAt: Record<string, Date> = {}
      if (from) {
        const d = new Date(from)
        if (!Number.isNaN(d.getTime())) submittedAt.gte = d
      }
      if (to) {
        const d = new Date(to)
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999)
          submittedAt.lte = d
        }
      }
      if (Object.keys(submittedAt).length) where.submittedAt = submittedAt
    }
    if (q) {
      where.OR = [
        { user: { is: { name: { contains: q } } } },
        { user: { is: { email: { contains: q } } } },
        { user: { is: { phone: { contains: q } } } },
        { exam: { is: { title: { contains: q } } } },
      ]
    }

    const submissions = await db.examSubmission.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      take: 300,
      select: {
        id: true,
        submittedAt: true,
        publishedAt: true,
        reviewStatus: true,
        obtainedMarks: true,
        feedback: true,
        user: {
          select: {
            id: true, name: true, email: true, phone: true,
            avatarUrl: true, studentClass: true,
          },
        },
        exam: {
          select: {
            id: true, title: true, totalMarks: true,
            course: { select: { id: true, title: true } },
            category: { select: { id: true, name: true } },
            subject: { select: { id: true, name: true, nameEn: true } },
          },
        },
        attempt: { select: { id: true, status: true, startedAt: true, endsAt: true, isAutoSubmitted: true } },
      },
    })

    // answer image counts per submission (one grouped query)
    const attemptIds = submissions.map((s) => s.attempt.id)
    const imageCounts = await db.examAnswerImage.groupBy({
      by: ['attemptId'],
      where: { attemptId: { in: attemptIds } },
      _count: { _all: true },
    })
    const countMap = new Map(imageCounts.map((c) => [c.attemptId, c._count._all]))
    const annotatedCounts = await db.examAnswerImage.groupBy({
      by: ['attemptId'],
      where: { attemptId: { in: attemptIds }, annotatedAt: { not: null } },
      _count: { _all: true },
    })
    const annotatedMap = new Map(annotatedCounts.map((c) => [c.attemptId, c._count._all]))

    return ok(
      submissions.map((s) => ({
        id: s.id,
        submittedAt: s.submittedAt,
        publishedAt: s.publishedAt,
        reviewStatus: s.reviewStatus,
        obtainedMarks: s.obtainedMarks,
        totalMarks: s.exam.totalMarks,
        feedback: s.feedback,
        user: s.user,
        exam: {
          id: s.exam.id,
          title: s.exam.title,
          totalMarks: s.exam.totalMarks,
          courseTitle: s.exam.course?.title ?? null,
          categoryName: s.exam.category?.name ?? null,
          subjectName: s.exam.subject?.nameEn || s.exam.subject?.name || null,
        },
        attempt: s.attempt,
        imageCount: countMap.get(s.attempt.id) ?? 0,
        annotatedCount: annotatedMap.get(s.attempt.id) ?? 0,
      }))
    )
  } catch (err) {
    console.error('[GET /api/admin/exam-submissions]', err)
    return fail('Server error', 500)
  }
}

/**
 * GET /api/exams/results — the STUDENT's own PUBLISHED written-exam results
 * (spec #18 "My Results"). Ownership enforced server-side; unpublished
 * submissions never appear here.
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAuth } from '@/lib/api-helpers'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const submissions = await db.examSubmission.findMany({
      where: { userId: auth.id, reviewStatus: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        submittedAt: true,
        publishedAt: true,
        obtainedMarks: true,
        feedback: true,
        exam: {
          select: {
            id: true,
            title: true,
            totalMarks: true,
            course: { select: { title: true } },
            category: { select: { name: true } },
            subject: { select: { name: true, nameEn: true } },
          },
        },
      },
    })

    const rows = submissions.map((s) => ({
      id: s.id,
      submittedAt: s.submittedAt,
      publishedAt: s.publishedAt,
      obtainedMarks: s.obtainedMarks,
      totalMarks: s.exam.totalMarks,
      percentage:
        s.obtainedMarks != null && s.exam.totalMarks > 0
          ? Math.round((s.obtainedMarks / s.exam.totalMarks) * 1000) / 10
          : null,
      feedback: s.feedback,
      exam: {
        id: s.exam.id,
        title: s.exam.title,
        courseTitle: s.exam.course?.title ?? null,
        categoryName: s.exam.category?.name ?? null,
        subjectName: s.exam.subject?.nameEn || s.exam.subject?.name || null,
      },
    }))

    return ok({ results: rows })
  } catch (err) {
    console.error('[GET /api/exams/results]', err)
    return fail('Server error', 500)
  }
}

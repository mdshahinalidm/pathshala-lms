/**
 * GET /api/my-exam-results — the student's PUBLISHED written-exam results.
 * Evaluated (annotated) answer sheets become visible here after publish.
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAuth } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const attempts = await db.examAttempt.findMany({
      where: { userId: auth.id, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      include: {
        exam: {
          select: {
            id: true, title: true, categoryName: true, subjectName: true, totalMarks: true,
          },
        },
      },
    })

    return ok({
      serverNow: new Date().toISOString(),
      results: attempts.map((a) => ({
        id: a.id,
        examId: a.exam.id,
        examTitle: a.exam.title,
        categoryName: a.exam.categoryName,
        subjectName: a.exam.subjectName,
        totalMarks: a.totalMarks,
        examTotalMarks: a.exam.totalMarks,
        obtainedMarks: a.obtainedMarks,
        percentage: a.percentage,
        grade: a.grade,
        feedback: a.feedback,
        submittedAt: a.submittedAt?.toISOString() ?? null,
        publishedAt: a.publishedAt?.toISOString() ?? null,
      })),
    })
  } catch (err) {
    console.error('[GET /api/my-exam-results]', err)
    return fail('Server error', 500)
  }
}

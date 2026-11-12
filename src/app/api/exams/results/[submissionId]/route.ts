/**
 * GET /api/exams/results/[submissionId] — one result DETAIL (spec #19/#20).
 *  • student: only their OWN submission AND only when reviewStatus=PUBLISHED
 *    (IDOR-safe: another student's id → 404, unpublished → 404)
 *  • panel roles: always visible
 * Returns marks, feedback, exam context and every answer image WITH its
 * annotation strokes layer (original file URL is separate and untouched).
 */
import { db } from '@/lib/db'
import { fail, getAuthUser, isResponse, ok } from '@/lib/api-helpers'
import { isPanelRole } from '@/lib/roles'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  try {
    const auth = await getAuthUser(req)
    if (!auth) return fail('Login required.', 401)
    const isPanel = isPanelRole(auth.role)
    const { submissionId } = await params

    const submission = await db.examSubmission.findUnique({
      where: { id: submissionId },
      include: {
        attempt: { select: { id: true, startedAt: true, endsAt: true, submittedAt: true, isAutoSubmitted: true } },
        exam: {
          select: {
            id: true,
            title: true,
            totalMarks: true,
            course: { select: { id: true, title: true } },
            category: { select: { id: true, name: true } },
            subject: { select: { id: true, name: true, nameEn: true } },
          },
        },
      },
    })
    if (!submission) return fail('Result not found.', 404)

    if (!isPanel) {
      if (submission.userId !== auth.id) return fail('Result not found.', 404)
      if (submission.reviewStatus !== 'PUBLISHED') return fail('Result not found.', 404)
    }

    const student = await db.user.findUnique({
      where: { id: submission.userId },
      select: { id: true, name: true, email: true, phone: true, avatarUrl: true, studentClass: true, institution: true },
    })

    const images = await db.examAnswerImage.findMany({
      where: { attemptId: submission.attemptId },
      orderBy: { order: 'asc' },
      select: { id: true, url: true, originalName: true, mime: true, size: true, order: true, strokes: true, annotatedAt: true, createdAt: true },
    })

    const totalMarks = submission.exam.totalMarks
    const percentage =
      submission.obtainedMarks != null && totalMarks > 0
        ? Math.round((submission.obtainedMarks / totalMarks) * 1000) / 10
        : null

    return ok({
      submission: {
        id: submission.id,
        submittedAt: submission.submittedAt,
        publishedAt: submission.publishedAt,
        markedAt: submission.markedAt,
        reviewStatus: submission.reviewStatus,
        obtainedMarks: submission.obtainedMarks,
        totalMarks,
        percentage,
        feedback: submission.feedback,
      },
      attempt: submission.attempt,
      exam: submission.exam,
      student,
      images: images.map((img) => ({
        ...img,
        strokes: safeStrokes(img.strokes),
        hasAnnotation: img.annotatedAt != null,
      })),
    })
  } catch (err) {
    console.error('[GET /api/exams/results/[submissionId]]', err)
    return fail('Server error', 500)
  }
}

function safeStrokes(json: string): unknown[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

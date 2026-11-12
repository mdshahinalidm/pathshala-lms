/**
 * POST /api/exam-attempts/[id]/submit — FINAL submission.
 *  • ownership + state enforced server-side
 *  • deadline enforced (90s network grace after 00:00)
 *  • snapshot: submittedAt/server time, user, exam, attempt + all image ids
 *  • after submit the student can NEVER modify answer images
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, rateLimit, requireAuth } from '@/lib/api-helpers'

export const runtime = 'nodejs'

const SUBMIT_GRACE_MS = 90_000

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth
    if (rateLimit(req, 'exam-submit', 10, 60_000)) return fail('Too many requests — please slow down.', 429)

    const { id } = await params
    const attempt = await db.examAttempt.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, deadlineAt: true, examId: true },
    })
    if (!attempt || attempt.userId !== auth.id) return fail('Attempt not found.', 404)
    if (attempt.status !== 'IN_PROGRESS') {
      return ok({ status: attempt.status, alreadySubmitted: true })
    }
    if (Date.now() > attempt.deadlineAt.getTime() + SUBMIT_GRACE_MS) {
      // deadline long past → lock as expired instead of rejecting into limbo
      await db.examAttempt.update({
        where: { id },
        data: { status: 'SUBMITTED', submittedAt: attempt.deadlineAt, expired: true },
      })
      return ok({ status: 'SUBMITTED', expired: true })
    }

    const imageCount = await db.examAnswerImage.count({ where: { attemptId: id } })
    if (imageCount === 0) {
      return fail('অন্তত একটি উত্তরপত্রের ছবি আপলোড করুন। (Upload at least one answer-sheet image.)', 422)
    }

    const updated = await db.examAttempt.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
      select: { id: true, status: true, submittedAt: true },
    })
    return ok({ status: updated.status, submittedAt: updated.submittedAt?.toISOString() ?? null, imageCount })
  } catch (err) {
    console.error('[POST /api/exam-attempts/[id]/submit]', err)
    return fail('Server error', 500)
  }
}

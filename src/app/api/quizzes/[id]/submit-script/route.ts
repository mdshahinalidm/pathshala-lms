/**
 * POST /api/quizzes/[id]/submit-script — finalize the student's written-exam
 * attempt. The uploaded sheets are frozen; the attempt becomes
 * SUBMITTED and lands in the admin Result Center for grading.
 *
 * Body: { attemptId, timeTaken (seconds) }
 * → { ok, data: { submitted: true, attemptId, sheetCount } }
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, requireAuth, isResponse, parseBody, rateLimit } from '@/lib/api-helpers'
import { attemptEndsAt, effectiveDurationMin, EXAM_SUBMIT_GRACE_SEC } from '@/lib/exam-session'

export const runtime = 'nodejs'

const bodySchema = z.object({
  attemptId: z.string().min(1).max(100),
  timeTaken: z.number().int().min(0).max(86_400).default(0),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireAuth(req)
    if (isResponse(user)) return user

    const limited = rateLimit(req, `script-submit:${user.id}`, 15, 60_000)
    if (limited) return limited

    const body = await parseBody(req, bodySchema)
    if (isResponse(body)) return body

    const attempt = await db.quizAttempt.findUnique({
      where: { id: body.attemptId },
      include: { quiz: true, subject: true, sheets: { orderBy: { order: 'asc' } } },
    })
    if (!attempt || attempt.userId !== user.id || attempt.quizId !== id) {
      return fail('অ্যাটেম্পট পাওয়া যায়নি। (Attempt not found.)', 404)
    }
    if (attempt.scriptStatus === 'SUBMITTED') {
      return ok({ submitted: true, attemptId: attempt.id, sheetCount: attempt.sheets.length })
    }
    if (attempt.scriptStatus !== 'IN_PROGRESS' || !attempt.startedAt) {
      return fail('এই অ্যাটেম্পটটি আর খোলা নেই। (This attempt is no longer open.)', 409)
    }
    if (attempt.sheets.length === 0) {
      return fail('অন্তত একটি উত্তরপত্রের ছবি আপলোড করুন। (Upload at least one answer-sheet photo.)', 422)
    }
    const endsAt = attemptEndsAt(
      attempt.startedAt,
      effectiveDurationMin(attempt.quiz, attempt.subject)
    )
    if (Date.now() > endsAt.getTime() + EXAM_SUBMIT_GRACE_SEC * 1000) {
      // Too late — settle it server-side as submitted-at-deadline (sheets exist).
      await db.quizAttempt.update({
        where: { id: attempt.id },
        data: {
          scriptStatus: 'SUBMITTED',
          submittedAt: endsAt,
          scriptUrl: attempt.sheets[0]?.imageUrl ?? null,
          scriptName: 'answer-sheets',
        },
      })
      return ok({ submitted: true, attemptId: attempt.id, sheetCount: attempt.sheets.length })
    }

    await db.quizAttempt.update({
      where: { id: attempt.id },
      data: {
        scriptStatus: 'SUBMITTED',
        submittedAt: new Date(),
        timeTaken: body.timeTaken,
        scriptUrl: attempt.sheets[0]?.imageUrl ?? null,
        scriptName: 'answer-sheets',
      },
    })

    return ok({ submitted: true, attemptId: attempt.id, sheetCount: attempt.sheets.length })
  } catch (err) {
    console.error('[POST /api/quizzes/[id]/submit-script]', err)
    return fail('Server error', 500)
  }
}

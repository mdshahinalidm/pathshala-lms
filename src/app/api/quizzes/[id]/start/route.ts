/**
 * POST /api/quizzes/[id]/start — open (or resume) the student's written-exam
 * session. The server owns the clock: attempt.startedAt anchors the
 * countdown (endsAt = startedAt + durationMin) so refreshing or switching
 * devices never buys extra time.
 *
 *  • SUBMITTED attempt → returns that state (re-entry shows the receipt).
 *  • RUNNING attempt inside the window → resumed with remaining time + sheets.
 *  • Expired attempt → sheets>0 auto-finalized as SUBMITTED at the deadline;
 *    empty attempts are marked EXPIRED and a fresh session starts.
 *
 * Paid exams require an active ExamPurchase (quizId-scoped) — enforced here
 * so the runner cannot be bypassed by direct API calls.
 *
 * body { subjectId? } starts a subject-scoped session inside an
 * honours batch — the countdown then uses that subject's own duration.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, requireAuth, isResponse, rateLimit } from '@/lib/api-helpers'
import { examAccessFor } from '@/lib/exam-access'
import { resolveAttemptPhase } from '@/lib/exam-session'

export const runtime = 'nodejs'

const bodySchema = z.object({
  subjectId: z.string().min(1).max(100).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireAuth(req)
    if (isResponse(user)) return user

    const limited = rateLimit(req, `exam-start:${user.id}`, 30, 60_000)
    if (limited) return limited

    // Body is optional (legacy whole-exam start sends none).
    const raw: unknown = await req.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      const first = parsed.error.issues?.[0]
      return fail(first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input', 422)
    }
    const body = parsed.data

    const quiz = await db.quiz.findUnique({ where: { id } })
    if (!quiz || !quiz.isPublished) return fail('Exam not found', 404)
    if (quiz.type !== 'EXAM' || quiz.paperKind !== 'CQ') {
      return fail('This exam does not use answer-sheet submissions', 400)
    }

    // ── PAID exam gate: an active purchase is required ──
    if (!quiz.isFree) {
      const access = await examAccessFor(user.id, quiz)
      if (!access.hasAccess) {
        return fail(
          'EXAM_LOCKED: এই পেইড এক্সামে অংশ নিতে প্রথমে কিনুন। (Buy this paid exam before participating.)',
          403
        )
      }
    }

    // ── honours subject scoping ──
    let subjectId: string | null = null
    let durationMin = quiz.durationMin
    if (body.subjectId) {
      const subject = await db.quizSubject.findUnique({ where: { id: body.subjectId } })
      if (!subject || subject.quizId !== quiz.id) {
        return fail('বিষয়টি এই এক্সাম ব্যাচে পাওয়া যায়নি। (Subject not found in this exam batch.)', 404)
      }
      subjectId = subject.id
      durationMin = subject.durationMin
    }

    const resolved = await resolveAttemptPhase(quiz, user.id, subjectId)
    if (resolved.phase === 'RUNNING' || resolved.phase === 'SUBMITTED') {
      return ok(resolved)
    }

    // Fresh session.
    const now = new Date()
    const attempt = await db.quizAttempt.create({
      data: {
        userId: user.id,
        quizId: quiz.id,
        subjectId,
        scriptStatus: 'IN_PROGRESS',
        startedAt: now,
      },
    })
    const endsAt = new Date(now.getTime() + Math.max(1, durationMin) * 60_000)

    return ok({
      phase: 'RUNNING' as const,
      attemptId: attempt.id,
      startedAt: attempt.startedAt?.toISOString() ?? now.toISOString(),
      endsAt: endsAt.toISOString(),
      serverNow: now.toISOString(),
      durationMin,
      sheets: [],
    })
  } catch (err) {
    console.error('[POST /api/quizzes/[id]/start]', err)
    return fail('Server error', 500)
  }
}

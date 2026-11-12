/**
 * GET /api/quizzes/[id]/subject-status — per-subject exam session states for
 * an honours batch. The runner's subject list uses this to show
 * each subject as "নতুন / চলমান / জমা দেওয়া" and to resume a RUNNING
 * session without restarting the server-anchored countdown.
 *
 * Expired IN_PROGRESS attempts are settled with the SAME logic as
 * resolveAttemptPhase (sheets uploaded → SUBMITTED at the deadline, empty →
 * EXPIRED), so the status list never disagrees with the runner.
 *
 * → { ok, data: { states: [{ subjectId, phase, endsAt?, submittedAt? }] } }
 */
import { db } from '@/lib/db'
import { ok, fail, requireAuth, isResponse, rateLimit } from '@/lib/api-helpers'
import { examAccessFor } from '@/lib/exam-access'
import { resolveAttemptPhase } from '@/lib/exam-session'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireAuth(req)
    if (isResponse(user)) return user

    const limited = rateLimit(req, `exam-subject-status:${user.id}`, 60, 60_000)
    if (limited) return limited

    const quiz = await db.quiz.findUnique({ where: { id } })
    if (!quiz || !quiz.isPublished) return fail('Exam not found', 404)
    if (quiz.type !== 'EXAM' || quiz.paperKind !== 'CQ') {
      return ok({ states: [] })
    }

    // ── PAID exam gate (same as the attempt endpoint) ──
    if (!quiz.isFree) {
      const access = await examAccessFor(user.id, quiz)
      if (!access.hasAccess) {
        return fail(
          'EXAM_LOCKED: এই পেইড এক্সামে অংশ নিতে প্রথমে কিনুন। (Buy this paid exam before participating.)',
          403
        )
      }
    }

    const subjects = await db.quizSubject.findMany({
      where: { quizId: id },
      orderBy: { order: 'asc' },
    })

    // resolveAttemptPhase is the single source of truth — reuse it per subject.
    const states = await Promise.all(
      subjects.map(async (s) => {
        const resolved = await resolveAttemptPhase(quiz, user.id, s.id)
        return {
          subjectId: s.id,
          phase: resolved.phase,
          endsAt: resolved.endsAt,
          submittedAt: resolved.submittedAt,
        }
      })
    )

    return ok({ states })
  } catch (err) {
    console.error('[GET /api/quizzes/[id]/subject-status]', err)
    return fail('Server error', 500)
  }
}

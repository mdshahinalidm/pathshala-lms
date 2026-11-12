/**
 * GET /api/quizzes/[id]/attempt — the student's current written-exam session
 * state. Used by the runner on load so a refresh / revisit resumes
 * the SAME server-anchored countdown instead of restarting the clock.
 *
 * → { phase: NONE | RUNNING | SUBMITTED | EXPIRED, attemptId?, endsAt?,
 *     serverNow, durationMin, sheets: [{ id, imageUrl, order }] }
 *
 * ?subject=<id> resumes one honours subject's session.
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

    const limited = rateLimit(req, `exam-attempt:${user.id}`, 60, 60_000)
    if (limited) return limited

    const subjectParam = new URL(req.url).searchParams.get('subject')
    let subjectId: string | null = null
    if (subjectParam) {
      const subject = await db.quizSubject.findUnique({ where: { id: subjectParam } })
      if (!subject || subject.quizId !== id) {
        return fail('বিষয়টি এই এক্সাম ব্যাচে পাওয়া যায়নি। (Subject not found in this exam batch.)', 404)
      }
      subjectId = subject.id
    }

    const quiz = await db.quiz.findUnique({ where: { id } })
    if (!quiz || !quiz.isPublished) return fail('Exam not found', 404)
    if (quiz.type !== 'EXAM' || quiz.paperKind !== 'CQ') {
      return ok({
        phase: 'NONE' as const,
        serverNow: new Date().toISOString(),
        durationMin: quiz.durationMin,
        sheets: [],
      })
    }

    // ── PAID exam gate ──
    if (!quiz.isFree) {
      const access = await examAccessFor(user.id, quiz)
      if (!access.hasAccess) {
        return fail(
          'EXAM_LOCKED: এই পেইড এক্সামে অংশ নিতে প্রথমে কিনুন। (Buy this paid exam before participating.)',
          403
        )
      }
    }

    return ok(await resolveAttemptPhase(quiz, user.id, subjectId))
  } catch (err) {
    console.error('[GET /api/quizzes/[id]/attempt]', err)
    return fail('Server error', 500)
  }
}

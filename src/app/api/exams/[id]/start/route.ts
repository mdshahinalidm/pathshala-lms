/**
 * POST /api/exams/[id]/start — Start Exam (spec #6).
 * The SERVER captures the exact start timestamp: startedAt = now,
 * endsAt = now + durationMin. Clients can never move the clock.
 *  • paid exams require a SUCCESS purchase (server-side)
 *  • an IN_PROGRESS attempt is RESUMED (refresh / other device = same clock)
 *  • one attempt per student per exam (SUBMITTED/EXPIRED → 409)
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, rateLimit, requireAuth } from '@/lib/api-helpers'
import { isPanelRole } from '@/lib/roles'
import { examVisibleNow, finalizeIfExpired, hasExamAccess } from '@/lib/exam-helpers'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    if (rateLimit(req, 'exam-start', 6, 60_000)) {
      return fail('Too many requests — please slow down.', 429)
    }

    const { id } = await params
    const exam = await db.writtenExam.findUnique({
      where: { id },
      select: { id: true, title: true, price: true, durationMin: true, isPublished: true, publishAt: true },
    })
    if (!exam) return fail('Exam not found', 404)

    const isPanel = isPanelRole(auth.role)
    if (!isPanel && !examVisibleNow(exam)) return fail('Exam not found', 404)

    // purchase gate — enforced here, not in the UI
    if (!isPanel && !(await hasExamAccess(auth.id, exam))) {
      return fail('এই পরীক্ষাটি পেইড — শুরু করার আগে কিনতে হবে।', 402)
    }

    // resume or block on the existing attempt
    const existing = await db.examAttempt.findFirst({
      where: { userId: auth.id, examId: id },
      orderBy: { startedAt: 'desc' },
    })
    if (existing) await finalizeIfExpired(existing)
    const current = existing
      ? await db.examAttempt.findUnique({ where: { id: existing.id } })
      : null
    if (current && current.status === 'IN_PROGRESS') {
      return ok({
        attempt: { id: current.id, status: current.status, startedAt: current.startedAt, endsAt: current.endsAt },
        serverTime: new Date().toISOString(),
        resumed: true,
      })
    }
    if (current && (current.status === 'SUBMITTED' || current.status === 'EXPIRED')) {
      return fail('এই পরীক্ষার সময় ইতিমধ্যে শেষ/জমা হয়ে গেছে — আর একবার শুরু করা যাবে না।', 409)
    }

    const now = new Date()
    const endsAt = new Date(now.getTime() + exam.durationMin * 60_000)
    const attempt = await db.examAttempt.create({
      data: { userId: auth.id, examId: id, status: 'IN_PROGRESS', startedAt: now, endsAt },
      select: { id: true, status: true, startedAt: true, endsAt: true },
    })
    return ok({ attempt, serverTime: now.toISOString(), resumed: false })
  } catch (err) {
    console.error('[POST /api/exams/[id]/start]', err)
    return fail('Server error', 500)
  }
}

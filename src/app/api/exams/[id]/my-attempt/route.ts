/**
 * GET /api/exams/[id]/my-attempt — SERVER-AUTHORITATIVE exam timer state.
 * The client derives remaining time from `attempt.endsAt - serverTime`;
 * refreshing, closing the browser or opening another device can never
 * reset/extend it. Lazy auto-finalize runs here (spec #7).
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAuth } from '@/lib/api-helpers'
import { finalizeIfExpired } from '@/lib/exam-helpers'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const where = { userId: auth.id, examId: id }
    let attempt = await db.examAttempt.findFirst({
      where,
      orderBy: { startedAt: 'desc' },
      include: {
        _count: { select: { images: true } },
        submission: { select: { id: true, reviewStatus: true, obtainedMarks: true } },
      },
    })
    if (attempt) {
      await finalizeIfExpired(attempt)
      attempt = await db.examAttempt.findFirst({
        where,
        orderBy: { startedAt: 'desc' },
        include: {
          _count: { select: { images: true } },
          submission: { select: { id: true, reviewStatus: true, obtainedMarks: true } },
        },
      })
    }

    const now = new Date()
    return ok({
      serverTime: now.toISOString(),
      attempt: attempt
        ? {
            id: attempt.id,
            status: attempt.status,
            startedAt: attempt.startedAt,
            endsAt: attempt.endsAt,
            isAutoSubmitted: attempt.isAutoSubmitted,
            remainingMs: Math.max(0, attempt.endsAt.getTime() - now.getTime()),
            imageCount: attempt._count.images,
            submission: attempt.submission,
          }
        : null,
    })
  } catch (err) {
    console.error('[GET /api/exams/[id]/my-attempt]', err)
    return fail('Server error', 500)
  }
}

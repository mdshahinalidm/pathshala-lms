/**
 * GET /api/exam-attempts/[id] — attempt state for the OWNER student.
 * Server-authoritative timer: returns serverNow/startedAt/deadlineAt so the
 * client can render a drift-corrected countdown that survives refresh,
 * browser restarts and device switches. After deadline+grace an in-progress
 * attempt AUTO-LOCKS to SUBMITTED (expired) — the exam state is never lost.
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAuth } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Uploads stop 10s after the deadline (network grace); submit grace is 90s. */
export const UPLOAD_GRACE_MS = 10_000
export const SUBMIT_GRACE_MS = 90_000

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    let attempt = await db.examAttempt.findUnique({
      where: { id },
      include: {
        exam: {
          select: {
            id: true, title: true, instructions: true, durationMin: true, totalMarks: true,
            categoryName: true, subjectName: true,
            questionPdfUrl: true, questionPdfName: true, questionImages: true,
          },
        },
        images: {
          select: {
            id: true, order: true, url: true, fileName: true, fileSize: true, annotatedUrl: true,
          },
          orderBy: { order: 'asc' },
        },
      },
    })
    if (!attempt) return fail('Attempt not found.', 404)
    if (attempt.userId !== auth.id) return fail('Attempt not found.', 404) // IDOR-safe: no existence leak

    const nowMs = Date.now()
    // auto-lock expired in-progress attempts (idempotent)
    if (attempt.status === 'IN_PROGRESS' && nowMs > attempt.deadlineAt.getTime() + SUBMIT_GRACE_MS) {
      await db.examAttempt.update({
        where: { id },
        data: { status: 'SUBMITTED', submittedAt: attempt.deadlineAt, expired: true },
      })
      attempt = { ...attempt, status: 'SUBMITTED', submittedAt: attempt.deadlineAt, expired: true }
    }

    const remainingSec = attempt.status === 'IN_PROGRESS'
      ? Math.max(0, Math.floor((attempt.deadlineAt.getTime() - nowMs) / 1000))
      : 0

    return ok({
      attempt: {
        id: attempt.id,
        status: attempt.status,
        expired: attempt.expired,
        startedAt: attempt.startedAt.toISOString(),
        deadlineAt: attempt.deadlineAt.toISOString(),
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        remainingSec,
        uploadOpen: attempt.status === 'IN_PROGRESS' && nowMs <= attempt.deadlineAt.getTime() + UPLOAD_GRACE_MS,
        obtainedMarks: attempt.obtainedMarks,
        totalMarks: attempt.totalMarks,
        percentage: attempt.percentage,
        grade: attempt.grade,
        feedback: attempt.feedback,
        publishedAt: attempt.publishedAt?.toISOString() ?? null,
      },
      exam: {
        ...attempt.exam,
        questionImages: safeImages(attempt.exam.questionImages),
      },
      images: attempt.images,
      serverNow: new Date(nowMs).toISOString(),
    })
  } catch (err) {
    console.error('[GET /api/exam-attempts/[id]]', err)
    return fail('Server error', 500)
  }
}

function safeImages(raw: string): { url: string; name?: string; size?: number; mime?: string }[] {
  try {
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

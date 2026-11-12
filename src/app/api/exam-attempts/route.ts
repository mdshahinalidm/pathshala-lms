/**
 * GET  /api/exam-attempts — the student's written-exam attempts (My Exams).
 * POST /api/exam-attempts — START an attempt { examId }.
 *   • ownership: free OR SUCCESS purchase (server-enforced)
 *   • ONE attempt per exam (unique userId+examId) — resumable if in progress
 *   • SERVER-AUTHORITATIVE timer: startedAt/deadlineAt = server clock
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, rateLimit, requireAuth } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const startSchema = z.object({ examId: z.string().min(1) })

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const attempts = await db.examAttempt.findMany({
      where: { userId: auth.id },
      orderBy: { createdAt: 'desc' },
      include: {
        exam: {
          select: {
            id: true, title: true, durationMin: true, totalMarks: true,
            categoryName: true, subjectName: true,
          },
        },
        images: { select: { id: true, order: true, annotatedUrl: true }, orderBy: { order: 'asc' } },
      },
    })

    const serverNow = new Date().toISOString()
    return ok({
      serverNow,
      attempts: attempts.map((a) => ({
        id: a.id,
        status: a.status,
        expired: a.expired,
        startedAt: a.startedAt.toISOString(),
        deadlineAt: a.deadlineAt.toISOString(),
        submittedAt: a.submittedAt?.toISOString() ?? null,
        obtainedMarks: a.obtainedMarks,
        totalMarks: a.totalMarks,
        percentage: a.percentage,
        grade: a.grade,
        feedback: a.feedback,
        publishedAt: a.publishedAt?.toISOString() ?? null,
        imageCount: a.images.length,
        exam: a.exam,
      })),
    })
  } catch (err) {
    console.error('[GET /api/exam-attempts]', err)
    return fail('Server error', 500)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    if (rateLimit(req, 'exam-start', 12, 60_000)) {
      return fail('Too many requests — please slow down.', 429)
    }

    const parsed = await parseBody(req, startSchema)
    if (isResponse(parsed)) return parsed

    const exam = await db.writtenExam.findUnique({
      where: { id: parsed.examId },
      select: { id: true, isPublished: true, isFree: true, durationMin: true, totalMarks: true },
    })
    if (!exam || !exam.isPublished) return fail('Exam not found.', 404)

    // ownership (server-side access control — never client-trusted)
    if (!exam.isFree) {
      const owned = await db.examPurchase.findFirst({
        where: { userId: auth.id, examId: exam.id, status: 'SUCCESS' },
        select: { id: true },
      })
      if (!owned) return fail('এই পরীক্ষাটি আপনার কেনা নেই। (You have not purchased this exam.)', 403)
    }

    // starting a FREE exam adds it to the student's dashboard exam
    // section (idempotent — ExamEnrollment is the "added exams" ledger).
    if (exam.isFree) {
      await db.examEnrollment.upsert({
        where: { userId_examId: { userId: auth.id, examId: exam.id } },
        update: {},
        create: { userId: auth.id, examId: exam.id, source: 'FREE_CLICK' },
      })
    }

    // one attempt per exam — resume the existing in-progress attempt
    const existing = await db.examAttempt.findUnique({
      where: { userId_examId: { userId: auth.id, examId: exam.id } },
      select: { id: true, status: true, deadlineAt: true },
    })
    if (existing) {
      if (existing.status === 'IN_PROGRESS') {
        const remainingSec = Math.max(0, Math.floor((existing.deadlineAt.getTime() - Date.now()) / 1000))
        return ok({ attemptId: existing.id, resumed: true, remainingSec, serverNow: new Date().toISOString() })
      }
      return fail('এই পরীক্ষাটি আপনার জন্য ইতিমধ্যে জমা হয়েছে। (This exam is already submitted.)', 409)
    }

    const now = new Date()
    const deadline = new Date(now.getTime() + exam.durationMin * 60_000)
    const attempt = await db.examAttempt.create({
      data: {
        userId: auth.id,
        examId: exam.id,
        status: 'IN_PROGRESS',
        startedAt: now,
        deadlineAt: deadline,
        endsAt: deadline,
        totalMarks: exam.totalMarks,
      },
      select: { id: true },
    })
    return ok(
      { attemptId: attempt.id, resumed: false, remainingSec: exam.durationMin * 60, serverNow: now.toISOString() },
      201
    )
  } catch (err) {
    console.error('[POST /api/exam-attempts]', err)
    return fail('Server error', 500)
  }
}

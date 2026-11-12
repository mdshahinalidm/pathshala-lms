/**
 * POST /api/exams/attempts/[attemptId]/submit — FINAL SUBMIT (spec #11).
 *  • owner-only; creates the ExamSubmission snapshot (exam/course/category/
 *    subject ids, images stay linked via attempt)
 *  • requires ≥1 answer image
 *  • deadline enforced server-side: accepted until endsAt + 30s grace —
 *    after the lazy auto-finalize window the attempt is locked
 *  • idempotent-rejecting: a second submit is a 409
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, rateLimit, requireAuth } from '@/lib/api-helpers'
import { SUBMIT_GRACE_MS, finalizeIfExpired } from '@/lib/exam-helpers'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth
    if (rateLimit(req, 'exam-submit', 6, 60_000)) {
      return fail('Too many requests — please slow down.', 429)
    }
    const { attemptId } = await params

    const existingAttempt = await db.examAttempt.findUnique({ where: { id: attemptId } })
    if (!existingAttempt || existingAttempt.userId !== auth.id) return fail('Attempt not found.', 404)
    await finalizeIfExpired(existingAttempt)
    const attempt = await db.examAttempt.findUnique({ where: { id: attemptId } })
    if (!attempt || attempt.userId !== auth.id) return fail('Attempt not found.', 404)

    if (attempt.status === 'SUBMITTED') return fail('পরীক্ষা ইতিমধ্যে জমা হয়ে গেছে।', 409)
    if (attempt.status === 'EXPIRED') return fail('সময় শেষ — পরীক্ষাটি স্বয়ংক্রিয়ভাবে বন্ধ হয়ে গেছে।', 409)
    if (Date.now() > attempt.endsAt.getTime() + SUBMIT_GRACE_MS) {
      return fail('সময় শেষ — জমা দেওয়া যায়নি।', 403)
    }

    const imageCount = await db.examAnswerImage.count({ where: { attemptId } })
    if (imageCount < 1) {
      return fail('কমপক্ষে একটি উত্তরপত্রের ছবি আপলোড করে তারপর জমা দিন।', 422)
    }

    const exam = await db.writtenExam.findUnique({
      where: { id: attempt.examId },
      select: { id: true, courseId: true, categoryId: true, subjectId: true, title: true },
    })
    if (!exam) return fail('Exam not found', 404)

    const now = new Date()
    const submission = await db.$transaction(async (tx) => {
      const s = await tx.examSubmission.create({
        data: {
          attemptId: attempt.id,
          userId: auth.id,
          examId: exam.id,
          courseId: exam.courseId,
          categoryId: exam.categoryId,
          subjectId: exam.subjectId,
          submittedAt: now,
          reviewStatus: 'SUBMITTED',
        },
      })
      await tx.examAttempt.update({
        where: { id: attempt.id },
        data: { status: 'SUBMITTED', submittedAt: now },
      })
      return s
    })

    return ok({
      submission: { id: submission.id, submittedAt: submission.submittedAt, reviewStatus: submission.reviewStatus },
    })
  } catch (err) {
    console.error('[POST attempts/[attemptId]/submit]', err)
    return fail('Server error', 500)
  }
}

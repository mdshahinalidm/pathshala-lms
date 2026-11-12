/**
 * exam-helpers — shared server-side logic for the Written/Theory Exam System.
 *
 * Core guarantees (spec):
 *  • the SERVER owns the exam clock: every attempt stores startedAt/endsAt;
 *    clients only ever derive remaining time from these + serverTime.
 *  • the deadline is enforced server-side: image upload stops at
 *    endsAt + ANSWER_GRACE_MS, final submit at endsAt + SUBMIT_GRACE_MS
 *    (small network-fairness grace), and at endsAt + AUTO_FINALIZE_MS the
 *    attempt is lazily auto-finalized (no cron needed).
 *  • paid exams are gated by an ExamPurchase row with status SUCCESS.
 */
import { db } from '@/lib/db'
import type { ExamAttempt } from '@prisma/client'

/** Per-image safety cap (no user-facing dimension restriction — only abuse protection). */
export const ANSWER_IMAGE_MAX_BYTES = 40 * 1024 * 1024 // 40 MB
/** Small grace so a student whose clock hit 00:00 mid-upload isn't truncated unfairly. */
export const ANSWER_GRACE_MS = 10_000
/** Final-submit grace window after 00:00 (client auto-submits at 00:00). */
export const SUBMIT_GRACE_MS = 30_000
/** After this the server lazily finalizes the attempt (auto-submit state). */
export const AUTO_FINALIZE_MS = 60_000

/** A published exam is visible when isPublished AND (no publishAt OR publishAt <= now). */
export function examVisibleNow(exam: { isPublished: boolean; publishAt: Date | null }): boolean {
  if (!exam.isPublished) return false
  if (exam.publishAt && exam.publishAt.getTime() > Date.now()) return false
  return true
}

/** Purchase gate: free exams open for everyone, paid ones need a SUCCESS purchase. */
export async function hasExamAccess(
  userId: string,
  exam: { id: string; price: number }
): Promise<boolean> {
  if (!(exam.price > 0)) return true
  const owned = await db.examPurchase.findFirst({
    where: { userId, examId: exam.id, status: 'SUCCESS' },
    select: { id: true },
  })
  return Boolean(owned)
}

/**
 * Lazily auto-finalize an attempt whose deadline long passed (spec #7:
 * "Exam automatically submitted state-এ যেতে পারে"). With ≥1 uploaded image
 * → a submission is created server-side (submittedAt = the deadline itself);
 * with none → the attempt is marked EXPIRED. Runs inside every state read;
 * callers re-query when they need the fresh row.
 */
export async function finalizeIfExpired(attempt: ExamAttempt): Promise<void> {
  if (attempt.status !== 'IN_PROGRESS') return
  const overdueMs = Date.now() - attempt.endsAt.getTime()
  if (overdueMs < AUTO_FINALIZE_MS) return

  const imageCount = await db.examAnswerImage.count({ where: { attemptId: attempt.id } })
  if (imageCount > 0) {
    const exam = await db.writtenExam.findUnique({
      where: { id: attempt.examId },
      select: { courseId: true, categoryId: true, subjectId: true },
    })
    await db.$transaction(async (tx) => {
      await tx.examSubmission.create({
        data: {
          attemptId: attempt.id,
          userId: attempt.userId,
          examId: attempt.examId,
          courseId: exam?.courseId ?? null,
          categoryId: exam?.categoryId ?? null,
          subjectId: exam?.subjectId ?? null,
          submittedAt: attempt.endsAt,
          reviewStatus: 'SUBMITTED',
        },
      })
      await tx.examAttempt.update({
        where: { id: attempt.id },
        data: { status: 'SUBMITTED', submittedAt: attempt.endsAt, isAutoSubmitted: true },
      })
    })
  } else {
    await db.examAttempt.update({
      where: { id: attempt.id },
      data: { status: 'EXPIRED' },
    })
  }
}

/** Magic-byte sniffing for student answer photos — never trust the client mime. */
export function sniffImage(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'png'
  }
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

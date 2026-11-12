/**
 * Exam access helpers (server-only).
 *
 * A paid live exam is accessible when the student owns an ExamPurchase with
 * status SUCCESS that has not expired (expiresAt null = lifetime access,
 * which is the batch duration the admin left unset). Free exams are open to
 * every logged-in student.
 */
import { db } from '@/lib/db'

export interface ExamAccessInfo {
  /** true when the exam is free OR the caller owns an active purchase. */
  hasAccess: boolean
  /** The active purchase (when any) — includes expiry for UI chips. */
  activePurchase: { id: string; expiresAt: Date | null } | null
}

export async function examAccessFor(
  userId: string | null,
  quiz: { id?: string; isFree: boolean }
): Promise<ExamAccessInfo> {
  if (quiz.isFree) return { hasAccess: true, activePurchase: null }
  if (!userId || !quiz.id) return { hasAccess: false, activePurchase: null }

  // quizId scoped — one paid exam must NEVER unlock another exam (security).
  const purchase = await db.examPurchase.findFirst({
    where: {
      userId,
      quizId: quiz.id,
      status: 'SUCCESS',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, expiresAt: true },
  })
  return { hasAccess: Boolean(purchase), activePurchase: purchase }
}

/** Compute the access expiry for a newly-confirmed exam purchase. */
export function examExpiryFor(accessMonths: number | null | undefined): Date | null {
  if (!accessMonths || accessMonths <= 0) return null // lifetime
  const d = new Date()
  d.setMonth(d.getMonth() + accessMonths)
  return d
}

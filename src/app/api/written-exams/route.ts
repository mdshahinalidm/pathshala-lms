/**
 * GET /api/written-exams — WRITTEN exam catalog for students.
 * Returns published exams (safe fields only) with, for the signed-in
 * student: ownership (purchase status), their attempt state and remaining
 * time. Anonymous callers get the public catalog (buy prompts login).
 */
import { db } from '@/lib/db'
import { fail, getAuthUser, ok } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req)

    // ?scope=mine → dashboard "My Exams": only exams the student
    // explicitly added (free click) or owns via SUCCESS purchase.
    const scope = new URL(req.url).searchParams.get('scope')
    let mineIds: string[] | null = null
    if (scope === 'mine' && auth) {
      const [enr, purch] = await Promise.all([
        db.examEnrollment.findMany({ where: { userId: auth.id, examId: { not: null } }, select: { examId: true } }),
        db.examPurchase.findMany({ where: { userId: auth.id, status: 'SUCCESS' }, select: { examId: true } }),
      ])
      mineIds = [...new Set([...enr.map((x) => x.examId!), ...purch.map((p) => p.examId)])].filter(
        (v): v is string => Boolean(v)
      )
      if (mineIds.length === 0) return ok({ exams: [] })
    }

    const exams = await db.writtenExam.findMany({
      where: { isPublished: true, ...(mineIds ? { id: { in: mineIds } } : {}) },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        instructions: true,
        courseId: true,
        categoryName: true,
        subjectId: true,
        subjectName: true,
        durationMin: true,
        totalMarks: true,
        isFree: true,
        price: true,
        createdAt: true,
      },
    })

    // course titles + question availability flags
    const courseIds = exams.map((e) => e.courseId).filter((v): v is string => Boolean(v))
    const courses = courseIds.length
      ? await db.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } })
      : []
    const titleOf = new Map(courses.map((c) => [c.id, c.title]))

    // per-student purchase/attempt maps
    const ownedMap = new Map<string, { purchaseId: string; status: string }>()
    const attemptMap = new Map<string, { id: string; status: string; deadlineAt: Date; submittedAt: Date | null; obtainedMarks: number | null; publishedAt: Date | null }>()
    if (auth) {
      const purchases = await db.examPurchase.findMany({
        where: { userId: auth.id },
        select: { id: true, examId: true, status: true },
      })
      for (const p of purchases) {
        if (p.examId) ownedMap.set(p.examId, { purchaseId: p.id, status: p.status })
      }
      const attempts = await db.examAttempt.findMany({
        where: { userId: auth.id },
        select: { id: true, examId: true, status: true, deadlineAt: true, submittedAt: true, obtainedMarks: true, publishedAt: true },
      })
      for (const a of attempts) attemptMap.set(a.examId, a)
    }

    const items = exams.map((e) => {
      const owned = ownedMap.get(e.id)
      const attempt = attemptMap.get(e.id)
      const isOwned = e.isFree || owned?.status === 'SUCCESS'
      const remainingSec = attempt && attempt.status === 'IN_PROGRESS'
        ? Math.max(0, Math.floor((attempt.deadlineAt.getTime() - Date.now()) / 1000))
        : null
      return {
        ...e,
        courseTitle: e.courseId ? (titleOf.get(e.courseId) ?? null) : null,
        hasQuestionFile: true, // published exams always have question media
        isOwned,
        myPurchase: owned ? { id: owned.purchaseId, status: owned.status } : null,
        myAttempt: attempt
          ? {
              id: attempt.id,
              status: attempt.status,
              remainingSec,
              submittedAt: attempt.submittedAt?.toISOString() ?? null,
              obtainedMarks: attempt.obtainedMarks,
              isPublished: Boolean(attempt.publishedAt),
            }
          : null,
      }
    })

    return ok({ exams: items })
  } catch (err) {
    console.error('[GET /api/written-exams]', err)
    return fail('Server error', 500)
  }
}

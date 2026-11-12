/**
 * GET /api/written-exams/[id] — one published written exam (detail).
 * Question media (PDF/images) are ONLY included for owned exams
 * (free or SUCCESS purchase) — server-side access control.
 */
import { db } from '@/lib/db'
import { fail, getAuthUser, ok } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req)
    const { id } = await params

    const exam = await db.writtenExam.findUnique({
      where: { id },
      select: {
        id: true, title: true, description: true, instructions: true,
        courseId: true, categoryName: true, subjectId: true, subjectName: true,
        durationMin: true, totalMarks: true, isFree: true, price: true,
        imageUrl: true,
        isPublished: true, questionPdfUrl: true, questionPdfName: true, questionImages: true,
      },
    })
    if (!exam || !exam.isPublished) return fail('Exam not found.', 404)

    // ownership
    let isOwned = exam.isFree
    let myPurchase: { id: string; status: string } | null = null
    if (!isOwned && auth) {
      const p = await db.examPurchase.findFirst({
        where: { userId: auth.id, examId: id, status: 'SUCCESS' },
        select: { id: true, status: true },
      })
      if (p) { isOwned = true; myPurchase = p }
    } else if (exam.isFree && auth) {
      myPurchase = null
    }
    if (!isOwned && !exam.isFree) {
      const pending = auth
        ? await db.examPurchase.findFirst({
            where: { userId: auth.id, examId: id, status: 'PENDING' },
            select: { id: true, status: true },
          })
        : null
      if (pending) myPurchase = pending
    }

    let courseTitle: string | null = null
    if (exam.courseId) {
      const c = await db.course.findUnique({ where: { id: exam.courseId }, select: { title: true } })
      courseTitle = c?.title ?? null
    }

    // attempt (owned only)
    let myAttempt: {
      id: string; status: string; startedAt: string; deadlineAt: string
      serverNow: string; remainingSec: number; submittedAt: string | null
      obtainedMarks: number | null; totalMarks: number; feedback: string | null
      grade: string | null; percentage: number | null; expired: boolean
      publishedAt: string | null
    } | null = null
    if (isOwned && auth) {
      const a = await db.examAttempt.findUnique({
        where: { userId_examId: { userId: auth.id, examId: id } },
      })
      if (a) {
        const serverNow = Date.now()
        const remainingSec = a.status === 'IN_PROGRESS'
          ? Math.max(0, Math.floor((a.deadlineAt.getTime() - serverNow) / 1000))
          : 0
        myAttempt = {
          id: a.id,
          status: a.status,
          startedAt: a.startedAt.toISOString(),
          deadlineAt: a.deadlineAt.toISOString(),
          serverNow: new Date(serverNow).toISOString(),
          remainingSec,
          submittedAt: a.submittedAt?.toISOString() ?? null,
          obtainedMarks: a.obtainedMarks,
          totalMarks: a.totalMarks,
          feedback: a.feedback,
          grade: a.grade,
          percentage: a.percentage,
          expired: a.expired,
          publishedAt: a.publishedAt?.toISOString() ?? null,
        }
      }
    }

    // question media gated by ownership
    const qImages = isOwned ? safeParseImages(exam.questionImages) : []
    return ok({
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        instructions: exam.instructions,
        courseId: exam.courseId,
        courseTitle,
        categoryName: exam.categoryName,
        subjectName: exam.subjectName,
        durationMin: exam.durationMin,
        totalMarks: exam.totalMarks,
        isFree: exam.isFree,
        price: exam.price,
        imageUrl: exam.imageUrl,
        questionPdfUrl: isOwned ? exam.questionPdfUrl : null,
        questionPdfName: isOwned ? exam.questionPdfName : null,
        questionImages: qImages,
      },
      isOwned,
      myPurchase,
      myAttempt,
    })
  } catch (err) {
    console.error('[GET /api/written-exams/[id]]', err)
    return fail('Server error', 500)
  }
}

function safeParseImages(raw: string): { url: string; name?: string; size?: number; mime?: string }[] {
  try {
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

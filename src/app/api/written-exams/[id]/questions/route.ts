/**
 * GET /api/written-exams/[id]/questions — the question media manifest for a
 * WRITTEN exam. Powers the "প্রশ্ন দেখুন" dialog on /exams:
 *
 *  • 401  — guest (login required)
 *  • 404  — exam missing or unpublished
 *  • 403  — paid exam without a SUCCESS ExamPurchase (staff bypasses)
 *  • 200  — { title, isFree, durationMin, hasQuestions, pdf, images }
 *
 * Only metadata + gated URLs are returned — the media itself is streamed by
 * /api/written-exams/[id]/question-file (server-side ownership enforced).
 */
import { db } from '@/lib/db'
import { fail, getAuthUser, ok } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req)
    if (!auth) return fail('প্রশ্ন দেখতে লগইন করুন। (Login required.)', 401)

    const { id } = await params
    const exam = await db.writtenExam.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        isFree: true,
        isPublished: true,
        questionPdfUrl: true,
        questionPdfName: true,
        questionImages: true,
        durationMin: true,
      },
    })
    if (!exam || !exam.isPublished) return fail('পরীক্ষাটি পাওয়া যায়নি। (Exam not found.)', 404)

    // paid exams: SUCCESS purchase (or staff) unlocks the question media
    if (!exam.isFree) {
      const staff = auth.role === 'ADMIN' || auth.role === 'MANAGER' || auth.role === 'MODERATOR'
      if (!staff) {
        const owned = await db.examPurchase.findFirst({
          where: { userId: auth.id, examId: id, status: 'SUCCESS' },
          select: { id: true },
        })
        if (!owned) {
          return fail('এই পরীক্ষার প্রশ্ন দেখতে কেনা প্রয়োজন। (Purchase required.)', 403)
        }
      }
    }

    const images = safeImages(exam.questionImages).map((i) => ({
      url: String(i.url ?? ''),
      name: typeof i.name === 'string' ? i.name : null,
    }))

    return ok({
      title: exam.title,
      isFree: exam.isFree,
      durationMin: exam.durationMin,
      hasQuestions: Boolean(exam.questionPdfUrl || images.length > 0),
      pdf: exam.questionPdfUrl
        ? { url: exam.questionPdfUrl, name: exam.questionPdfName ?? null }
        : null,
      images,
    })
  } catch (err) {
    console.error('[GET /api/written-exams/[id]/questions]', err)
    return fail('Server error', 500)
  }
}

interface QuestionImage {
  url?: unknown
  name?: unknown
}

function safeImages(raw: string): QuestionImage[] {
  try {
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr.filter((i) => i && typeof i === 'object') : []
  } catch {
    return []
  }
}

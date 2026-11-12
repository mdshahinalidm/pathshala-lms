/**
 * /api/exam-enrollments "click → my dashboard" for FREE exams.
 *
 * An exam reaches a student's dashboard exam section ONLY by explicit
 * action: clicking a FREE exam on /exams (the dashboard runner pages call
 * this idempotently on load, so login?next=… redirects also enroll).
 * Paid written exams are NEVER enrolled here — they enter through a
 * SUCCESS ExamPurchase (the dashboard query unions purchases).
 *
 * POST (student) { kind: 'MCQ' | 'WRITTEN', id: string }
 *   MCQ     → quiz must be a published type=EXAM quiz (always free)
 *   WRITTEN → exam must be published AND free (paid → 403, must purchase)
 *   → ok({ enrolled: true })
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, getAuthUser, isResponse, ok, parseBody } from '@/lib/api-helpers'

export const runtime = 'nodejs'

const schema = z.object({
  kind: z.enum(['MCQ', 'WRITTEN']),
  id: z.string().min(1).max(64),
})

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req)
    if (!auth) return fail('লগইন করুন — পরীক্ষা ড্যাশবোর্ডে যোগ করতে একাউন্ট লাগবে।', 401)

    const body = await parseBody(req, schema)
    if (isResponse(body)) return body
    const { kind, id } = body

    if (kind === 'MCQ') {
      const quiz = await db.quiz.findUnique({
        where: { id },
        select: { id: true, type: true, isPublished: true },
      })
      if (!quiz || quiz.type !== 'EXAM' || !quiz.isPublished) {
        return fail('পরীক্ষাটি খুঁজে পাওয়া যায়নি।', 404)
      }
      await db.examEnrollment.upsert({
        where: { userId_quizId: { userId: auth.id, quizId: id } },
        update: {},
        create: { userId: auth.id, quizId: id, source: 'FREE_CLICK' },
      })
      return ok({ enrolled: true })
    }

    // WRITTEN
    const exam = await db.writtenExam.findUnique({
      where: { id },
      select: { id: true, isPublished: true, isFree: true, price: true },
    })
    if (!exam || !exam.isPublished) return fail('পরীক্ষাটি খুঁজে পাওয়া যায়নি।', 404)
    if ((exam.price ?? 0) > 0 || !exam.isFree) {
      return fail('এটি পেইড পরীক্ষা — ড্যাশবোর্ডে যোগ হতে ফি পরিশোধ করুন।', 403)
    }
    await db.examEnrollment.upsert({
      where: { userId_examId: { userId: auth.id, examId: id } },
      update: {},
      create: { userId: auth.id, examId: id, source: 'FREE_CLICK' },
    })
    return ok({ enrolled: true })
  } catch (err) {
    console.error('[POST /api/exam-enrollments]', err)
    return fail('Server error', 500)
  }
}

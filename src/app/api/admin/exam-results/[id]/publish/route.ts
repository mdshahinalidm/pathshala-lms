/**
 * POST /api/admin/exam-results/[id]/publish — PUBLISH the result.
 * Requires marks saved first. Sets status=PUBLISHED + publishedAt and creates
 * the student notification ("Your result for [Exam] has been published.").
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireManager } from '@/lib/api-helpers'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const attempt = await db.examAttempt.findUnique({
      where: { id },
      select: {
        id: true, status: true, obtainedMarks: true, totalMarks: true, userId: true,
        exam: { select: { title: true } },
      },
    })
    if (!attempt) return fail('Submission not found.', 404)
    if (attempt.status === 'PUBLISHED') return ok({ status: 'PUBLISHED', alreadyPublished: true })
    if (attempt.obtainedMarks === null || attempt.obtainedMarks === undefined) {
      return fail('আগে নম্বর সেভ করুন, তারপর পাবলিশ করুন। (Save marks before publishing.)', 422)
    }

    await db.examAttempt.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    })

    await db.notification.create({
      data: {
        userId: attempt.userId,
        type: 'RESULT',
        title: '📊 ফলাফল প্রকাশিত হয়েছে',
        body: `"${attempt.exam.title}" পরীক্ষার ফলাফল প্রকাশিত হয়েছে — প্রাপ্ত নম্বর ${attempt.obtainedMarks}/${attempt.totalMarks}। মূল্যায়িত উত্তরপত্র দেখুন।`,
        link: '/dashboard/exam-results',
      },
    })

    return ok({ status: 'PUBLISHED' })
  } catch (err) {
    console.error('[POST /api/admin/exam-results/[id]/publish]', err)
    return fail('Server error', 500)
  }
}

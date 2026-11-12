/**
 * POST /api/admin/exam-results/publish — bulk publish results.
 * Body: { attemptIds: string[] }
 *
 * at publish time the server AUTO-GRADES every attempt from its
 * marks (NU scale for honours, board scale for class 9-12) and stores the
 * { grade, gpa } snapshot on the attempt — the same numbers then appear on
 * the admin sheet and the student's result page. MCQ attempts publish from
 * their auto-score (score/total); written attempts from the admin's marks.
 * Each student receives an EXAM notification linking to /dashboard/results.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, requireManager, isResponse, parseBody } from '@/lib/api-helpers'
import { gradeForLevel, roundGpa } from '@/lib/grading'

export const runtime = 'nodejs'

const bodySchema = z.object({
  attemptIds: z.array(z.string().min(1).max(100)).min(1).max(500),
})

export async function POST(req: Request) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const body = await parseBody(req, bodySchema)
    if (isResponse(body)) return body

    const attempts = await db.quizAttempt.findMany({
      where: { id: { in: body.attemptIds } },
      include: {
        quiz: { select: { id: true, title: true, level: true, paperKind: true, totalMarks: true } },
        subject: { select: { id: true, name: true, totalMarks: true } },
      },
    })

    let published = 0
    const skipped: { attemptId: string; reason: string }[] = []
    const now = new Date()

    for (const a of attempts) {
      const isMcq = a.quiz.paperKind === 'MCQ'
      if (!isMcq && a.scriptStatus !== 'SUBMITTED') {
        skipped.push({ attemptId: a.id, reason: 'not-submitted' })
        continue
      }
      if (a.isPublished) {
        skipped.push({ attemptId: a.id, reason: 'already-published' })
        continue
      }

      // ── Auto-grade from marks ──
      let obtained: number | null = null
      let full: number | null = null
      if (isMcq) {
        obtained = a.score
        full = a.total
      } else {
        obtained = a.totalMarks ?? null
        full = a.subject?.totalMarks ?? a.quiz.totalMarks
      }
      if (obtained === null || !full || full <= 0) {
        skipped.push({ attemptId: a.id, reason: 'no-marks' })
        continue
      }

      const percent = Math.max(0, Math.min(100, (obtained / full) * 100))
      const { grade, gpa } = gradeForLevel(a.quiz.level, percent)

      await db.quizAttempt.update({
        where: { id: a.id },
        data: { isPublished: true, publishedAt: now, grade, gpa: roundGpa(gpa) },
      })
      await db.notification.create({
        data: {
          userId: a.userId,
          type: 'EXAM',
          title: 'রেজাল্ট প্রকাশিত হয়েছে 🎉',
          body: `${a.quiz.title}${a.subject ? ` — ${a.subject.name}` : ''}: প্রাপ্ত নম্বর ${obtained}/${full} · গ্রেড ${grade} · GPA ${roundGpa(gpa).toFixed(2)}। মার্ক করা উত্তরপত্রসহ বিস্তারিত দেখুন।`,
          link: '/dashboard/results',
        },
      })
      published++
    }

    return ok({ published, skipped })
  } catch (err) {
    console.error('[POST /api/admin/exam-results/publish]', err)
    return fail('Server error', 500)
  }
}

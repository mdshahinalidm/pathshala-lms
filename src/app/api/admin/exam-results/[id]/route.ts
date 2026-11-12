/**
 * /api/admin/exam-results/[id] — one submission (Result Center).
 *  GET   → full submission: student header + all answer images (original +
 *          annotation strokes + annotated version). Ownership of the route is
 *          panel-role gated; the student-side twin enforces per-student access.
 *  PATCH → save marking: obtainedMarks + feedback (+ auto % and grade).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAdmin } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  obtainedMarks: z.number().int().min(0).max(1000),
  feedback: z.string().max(4000).optional(),
})

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const attempt = await db.examAttempt.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true, avatarUrl: true, studentClass: true, institution: true, createdAt: true },
        },
        exam: {
          select: {
            id: true, title: true, description: true, instructions: true, categoryName: true,
            subjectName: true, totalMarks: true, durationMin: true, courseId: true,
          },
        },
        images: {
          select: {
            id: true, order: true, url: true, fileName: true, fileSize: true,
            annotationData: true, annotatedUrl: true, annotatedAt: true, createdAt: true,
          },
          orderBy: { order: 'asc' },
        },
      },
    })
    if (!attempt) return fail('Submission not found.', 404)
    if (!['SUBMITTED', 'MARKED', 'PUBLISHED'].includes(attempt.status)) {
      return fail('এই চেষ্টাটি এখনো জমা হয়নি। (This attempt has not been submitted yet.)', 409)
    }

    let courseTitle: string | null = null
    if (attempt.exam.courseId) {
      const c = await db.course.findUnique({ where: { id: attempt.exam.courseId }, select: { title: true } })
      courseTitle = c?.title ?? null
    }

    return ok({
      attempt: {
        id: attempt.id,
        status: attempt.status,
        startedAt: attempt.startedAt.toISOString(),
        deadlineAt: attempt.deadlineAt.toISOString(),
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        expired: attempt.expired,
        totalMarks: attempt.totalMarks,
        obtainedMarks: attempt.obtainedMarks,
        percentage: attempt.percentage,
        grade: attempt.grade,
        feedback: attempt.feedback,
        markedAt: attempt.markedAt?.toISOString() ?? null,
        publishedAt: attempt.publishedAt?.toISOString() ?? null,
      },
      student: attempt.user,
      exam: { ...attempt.exam, courseTitle },
      images: attempt.images.map((i) => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
        annotatedAt: i.annotatedAt?.toISOString() ?? null,
        annotationData: i.annotationData ? safeParse(i.annotationData) : [],
      })),
    })
  } catch (err) {
    console.error('[GET /api/admin/exam-results/[id]]', err)
    return fail('Server error', 500)
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const parsed = await parseBody(req, patchSchema)
    if (isResponse(parsed)) return parsed

    const attempt = await db.examAttempt.findUnique({
      where: { id },
      select: { id: true, status: true, totalMarks: true },
    })
    if (!attempt) return fail('Submission not found.', 404)
    if (attempt.status === 'IN_PROGRESS') return fail('চেষ্টাটি এখনো জমা হয়নি।', 409)
    if (parsed.obtainedMarks > attempt.totalMarks) {
      return fail(`প্রাপ্ত নম্বর মোট নম্বরের (${attempt.totalMarks}) বেশি হতে পারে না।`, 422)
    }

    const pct = attempt.totalMarks > 0 ? (parsed.obtainedMarks / attempt.totalMarks) * 100 : 0
    const grade = gradeOf(pct)
    const updated = await db.examAttempt.update({
      where: { id },
      data: {
        obtainedMarks: parsed.obtainedMarks,
        percentage: Math.round(pct * 100) / 100,
        grade,
        feedback: parsed.feedback ? parsed.feedback.slice(0, 4000) : null,
        status: attempt.status === 'PUBLISHED' ? 'PUBLISHED' : 'MARKED',
        markedAt: new Date(),
      },
      select: { id: true, status: true, obtainedMarks: true, percentage: true, grade: true },
    })
    return ok(updated)
  } catch (err) {
    console.error('[PATCH /api/admin/exam-results/[id]]', err)
    return fail('Server error', 500)
  }
}

/** Standard Bangladeshi letter-grade scale. */
function gradeOf(pct: number): string {
  if (pct >= 80) return 'A+'
  if (pct >= 70) return 'A'
  if (pct >= 60) return 'A-'
  if (pct >= 50) return 'B'
  if (pct >= 40) return 'C'
  if (pct >= 33) return 'D'
  return 'F'
}

function safeParse(raw: string): unknown {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

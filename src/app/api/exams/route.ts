/**
 * /api/exams — WRITTEN / THEORY exam catalog (NO MCQ; the Quiz engine is a
 * separate untouched system).
 *
 * GET  — public: published+visible exams (course/category/subject titles +
 *        optional per-user state: purchased / attempt / submission status).
 *        `?scope=all` (panel roles only): every exam incl. drafts with counts.
 * POST — create (MANAGER/ADMIN). Zod-validated; FK ids verified; text sanitized.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  fail,
  getAuthUser,
  isResponse,
  ok,
  parseBody,
  rateLimit,
  requireManager,
  sanitize,
} from '@/lib/api-helpers'
import { isPanelRole } from '@/lib/roles'
import { examVisibleNow } from '@/lib/exam-helpers'

export const runtime = 'nodejs'

const createSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().max(2000).optional().nullable(),
  instructions: z.string().max(6000).optional().nullable(),
  courseId: z.string().max(64).optional().nullable(),
  categoryId: z.string().max(64).optional().nullable(),
  subjectId: z.string().max(64).optional().nullable(),
  totalMarks: z.number().int().min(1).max(1000),
  durationMin: z.number().int().min(1).max(600),
  price: z.number().min(0).max(100000),
  isPublished: z.boolean().default(false),
  publishAt: z.string().optional().nullable(), // ISO date or null
  questionPdfUrl: z.string().max(600).optional().nullable(),
  questionPdfName: z.string().max(200).optional().nullable(),
  questionImages: z.array(z.string().max(600)).max(30).default([]),
  imageUrl: z.string().max(600).optional().nullable(), // feature image
})

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const scope = url.searchParams.get('scope')
    const auth = await getAuthUser(req)
    const isPanel = Boolean(auth && isPanelRole(auth.role))

    if (scope === 'all') {
      if (!isPanel) return fail('Forbidden — admin access required.', 403)
      const rows = await db.writtenExam.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          course: { select: { id: true, title: true } },
          category: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true, nameEn: true } },
          _count: { select: { purchases: true, attempts: true } },
        },
      })
      return ok(
        rows.map((e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          courseId: e.courseId,
          courseTitle: e.course?.title ?? null,
          categoryId: e.categoryId,
          categoryName: e.category?.name ?? null,
          subjectId: e.subjectId,
          subjectName: e.subject?.nameEn || e.subject?.name || null,
          totalMarks: e.totalMarks,
          durationMin: e.durationMin,
          price: e.price,
          isPublished: e.isPublished,
          publishAt: e.publishAt,
          questionImageCount: safeImages(e.questionImages).length,
          hasPdf: Boolean(e.questionPdfUrl),
          purchaseCount: e._count.purchases,
          attemptCount: e._count.attempts,
          createdAt: e.createdAt,
        }))
      )
    }

    // ── public / student list ──
    // ?scope=mine → only exams the student explicitly added (free
    // click enrollment) or owns via a SUCCESS purchase (paid exams enter the
    // dashboard the instant payment succeeds — never before).
    let mineIds: string[] | null = null
    if (scope === 'mine' && auth && !isPanel) {
      const [enr, purch] = await Promise.all([
        db.examEnrollment.findMany({ where: { userId: auth.id, examId: { not: null } }, select: { examId: true } }),
        db.examPurchase.findMany({ where: { userId: auth.id, status: 'SUCCESS' }, select: { examId: true } }),
      ])
      mineIds = [...new Set([...enr.map((x) => x.examId!), ...purch.map((p) => p.examId)])].filter(
        (x): x is string => Boolean(x)
      )
      if (mineIds.length === 0) return ok([])
    }

    const exams = await db.writtenExam.findMany({
      where: { isPublished: true, ...(mineIds ? { id: { in: mineIds } } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        course: { select: { title: true } },
        category: { select: { name: true } },
        subject: { select: { name: true, nameEn: true } },
      },
    })
    const visible = exams.filter((e) => examVisibleNow(e))

    // per-user state in 3 flat queries (no N+1)
    let purchaseMap = new Map<string, string>()
    let attemptMap = new Map<string, { status: string; endsAt: string; id: string }>()
    let submissionMap = new Map<string, { id: string; reviewStatus: string; obtainedMarks: number | null }>()
    if (auth) {
      const [purchases, attempts, submissions] = await Promise.all([
        db.examPurchase.findMany({ where: { userId: auth.id }, select: { examId: true, status: true } }),
        db.examAttempt.findMany({
          where: { userId: auth.id },
          orderBy: { startedAt: 'desc' },
          select: { id: true, examId: true, status: true, endsAt: true },
        }),
        db.examSubmission.findMany({
          where: { userId: auth.id },
          select: { id: true, examId: true, reviewStatus: true, obtainedMarks: true },
        }),
      ])
      purchaseMap = new Map(purchases.filter((p) => p.examId).map((p) => [p.examId as string, p.status]))
      for (const a of attempts) if (!attemptMap.has(a.examId)) attemptMap.set(a.examId, { id: a.id, status: a.status, endsAt: a.endsAt.toISOString() })
      for (const s of submissions) if (!submissionMap.has(s.examId)) submissionMap.set(s.examId, { id: s.id, reviewStatus: s.reviewStatus, obtainedMarks: s.obtainedMarks })
    }

    return ok(
      visible.map((e) => {
        const submission = auth ? submissionMap.get(e.id) ?? null : null
        const attempt = auth ? attemptMap.get(e.id) ?? null : null
        const purchased = auth ? purchaseMap.get(e.id) === 'SUCCESS' || (e.price ?? 0) <= 0 : (e.price ?? 0) <= 0
        return {
          id: e.id,
          title: e.title,
          description: e.description,
          imageUrl: e.imageUrl,
          courseTitle: e.course?.title ?? null,
          categoryName: e.category?.name ?? null,
          subjectName: e.subject?.nameEn || e.subject?.name || null,
          totalMarks: e.totalMarks,
          durationMin: e.durationMin,
          price: e.price,
          hasQuestion: Boolean(e.questionPdfUrl) || safeImages(e.questionImages).length > 0,
          purchased,
          myAttempt: attempt,
          mySubmission: submission,
        }
      })
    )
  } catch (err) {
    console.error('[GET /api/exams]', err)
    return fail('Server error', 500)
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    if (rateLimit(req, 'exam-create', 20, 60_000)) {
      return fail('Too many requests — please slow down.', 429)
    }

    const parsed = await parseBody(req, createSchema)
    if (isResponse(parsed)) return parsed

    // FK existence checks (422 on unknown ids — never a dangling reference)
    if (parsed.courseId) {
      const exists = await db.course.findUnique({ where: { id: parsed.courseId }, select: { id: true } })
      if (!exists) return fail('নির্বাচিত কোর্সটি খুঁজে পাওয়া যায়নি।', 422)
    }
    if (parsed.categoryId) {
      const exists = await db.category.findUnique({ where: { id: parsed.categoryId }, select: { id: true } })
      if (!exists) return fail('নির্বাচিত ক্যাটাগরিটি খুঁজে পাওয়া যায়নি।', 422)
    }
    if (parsed.subjectId) {
      const exists = await db.subject.findUnique({ where: { id: parsed.subjectId }, select: { id: true } })
      if (!exists) return fail('নির্বাচিত সাবজেক্টটি খুঁজে পাওয়া যায়নি।', 422)
    }

    const exam = await db.writtenExam.create({
      data: {
        title: sanitize(parsed.title, 150),
        description: parsed.description ? sanitize(parsed.description, 2000) : '',
        instructions: parsed.instructions ? sanitize(parsed.instructions, 6000) : '',
        courseId: parsed.courseId || null,
        categoryId: parsed.categoryId || null,
        subjectId: parsed.subjectId || null,
        totalMarks: parsed.totalMarks,
        durationMin: parsed.durationMin,
        price: parsed.price,
        isPublished: parsed.isPublished,
        publishAt: parsed.publishAt ? new Date(parsed.publishAt) : null,
        questionPdfUrl: parsed.questionPdfUrl || null,
        questionPdfName: parsed.questionPdfName || null,
        questionImages: JSON.stringify(parsed.questionImages.slice(0, 30)),
        imageUrl: parsed.imageUrl || null,
        createdByEmail: admin.email ?? '',
      },
      select: { id: true },
    })
    return ok({ id: exam.id })
  } catch (err) {
    console.error('[POST /api/exams]', err)
    return fail('Server error', 500)
  }
}

function safeImages(json: string): string[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * /api/exams/[id] — one WRITTEN exam.
 *
 * GET    — detail. Question media URLs are REDACTED for students who have not
 *          purchased a paid exam (server-side access control — the frontend
 *          never becomes the gate). Students get their attempt/submission
 *          state; panel roles get everything.
 * PUT    — full update (MANAGER/ADMIN).
 * DELETE — delete (MANAGER/ADMIN) — blocked when submissions exist (data
 *          safety: archive by unpublishing instead).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  fail,
  getAuthUser,
  isResponse,
  ok,
  parseBody,
  requireManager,
  sanitize,
} from '@/lib/api-helpers'
import { isPanelRole } from '@/lib/roles'
import { examVisibleNow, hasExamAccess, finalizeIfExpired } from '@/lib/exam-helpers'

export const runtime = 'nodejs'

const updateSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().max(2000).optional().nullable(),
  instructions: z.string().max(6000).optional().nullable(),
  courseId: z.string().max(64).optional().nullable(),
  categoryId: z.string().max(64).optional().nullable(),
  subjectId: z.string().max(64).optional().nullable(),
  totalMarks: z.number().int().min(1).max(1000),
  durationMin: z.number().int().min(1).max(600),
  price: z.number().min(0).max(100000),
  isPublished: z.boolean(),
  publishAt: z.string().optional().nullable(),
  questionPdfUrl: z.string().max(600).optional().nullable(),
  questionPdfName: z.string().max(200).optional().nullable(),
  questionImages: z.array(z.string().max(600)).max(30).default([]),
  imageUrl: z.string().max(600).optional().nullable(), // feature image
})

function safeImages(json: string): string[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await getAuthUser(req)
    const isPanel = Boolean(auth && isPanelRole(auth.role))

    const exam = await db.writtenExam.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, title: true } },
        category: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true, nameEn: true } },
      },
    })
    if (!exam) return fail('Exam not found', 404)
    if (!isPanel && !examVisibleNow(exam)) return fail('Exam not found', 404)

    const images = safeImages(exam.questionImages)
    let canPreview = isPanel
    let purchased = isPanel
    if (auth && !isPanel) {
      purchased = await hasExamAccess(auth.id, exam)
      canPreview = purchased
    }

    // per-user exam state
    let my: unknown = null
    if (auth && !isPanel) {
      const where = { userId: auth.id, examId: id }
      let attempt = await db.examAttempt.findFirst({
        where,
        orderBy: { startedAt: 'desc' },
        include: { _count: { select: { images: true } }, submission: { select: { id: true, reviewStatus: true } } },
      })
      if (attempt) {
        await finalizeIfExpired(attempt)
        attempt = await db.examAttempt.findFirst({
          where,
          orderBy: { startedAt: 'desc' },
          include: { _count: { select: { images: true } }, submission: { select: { id: true, reviewStatus: true } } },
        })
      }
      my = attempt
        ? {
            attempt: {
              id: attempt.id,
              status: attempt.status,
              startedAt: attempt.startedAt,
              endsAt: attempt.endsAt,
              isAutoSubmitted: attempt.isAutoSubmitted,
              imageCount: attempt._count.images,
            },
            submission: attempt.submission,
          }
        : { attempt: null, submission: null }
    }

    return ok({
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        instructions: exam.instructions,
        course: exam.course,
        category: exam.category,
        subject: exam.subject,
        totalMarks: exam.totalMarks,
        durationMin: exam.durationMin,
        price: exam.price,
        isPublished: exam.isPublished,
        publishAt: exam.publishAt,
        questionImageCount: images.length,
        // media only for entitled viewers (students never receive protected URLs)
        questionImages: canPreview ? images : [],
        questionPdfUrl: canPreview ? exam.questionPdfUrl : null,
        questionPdfName: exam.questionPdfName,
        canPreview,
        purchased,
      },
      my,
    })
  } catch (err) {
    console.error('[GET /api/exams/[id]]', err)
    return fail('Server error', 500)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const parsed = await parseBody(req, updateSchema)
    if (isResponse(parsed)) return parsed

    const existing = await db.writtenExam.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return fail('Exam not found', 404)

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

    await db.writtenExam.update({
      where: { id },
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
      },
    })
    return ok({ updated: true })
  } catch (err) {
    console.error('[PUT /api/exams/[id]]', err)
    return fail('Server error', 500)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const existing = await db.writtenExam.findUnique({
      where: { id },
      select: { id: true, _count: { select: { submissions: true, attempts: true, purchases: true } } },
    })
    if (!existing) return fail('Exam not found', 404)

    // Data safety: evaluated/submitted work is NEVER cascade-deleted.
    if (existing._count.submissions > 0 || existing._count.attempts > 0) {
      return fail(
        'এই পরীক্ষায় শিক্ষার্থীর জমা দেওয়া উত্তর/রেকর্ড আছে — মুছে ফেলা যাবে না। প্রয়োজনে Unpublish করে সংরক্ষণ করুন।',
        409
      )
    }

    await db.writtenExam.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/exams/[id]]', err)
    return fail('Server error', 500)
  }
}

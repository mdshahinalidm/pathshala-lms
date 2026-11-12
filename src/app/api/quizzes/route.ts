/**
 * /api/quizzes — quiz listing + creation.
 *
 * GET  ?courseId=<id>&scope=published|mine
 *      - published (default): all isPublished quizzes, newest first.
 *      - mine: published quizzes that are global (courseId = null) OR belong
 *        to a course the logged-in user is enrolled in; also returns the
 *        user's best attempt score (%) per quiz. Anonymous callers fall back
 *        to the published listing with myBest = null.
 * POST (ADMIN) create a quiz with 1..50 questions (transactional).
 */
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  fail,
  getAuthUser,
  requireManager,
  isResponse,
  parseBody,
  sanitize,
} from '@/lib/api-helpers'

export const questionInputSchema = z.object({
  text: z.string().min(3, 'Question text must be at least 3 characters').max(500),
  options: z
    .array(z.string().min(1, 'Option cannot be empty').max(200))
    .length(4, 'Exactly 4 options are required'),
  correctIndex: z.number().int().min(0).max(3),
  order: z.number().int().min(0).optional(),
})

export const quizInputSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(150),
  description: z.string().max(500).nullish(), // null/undefined both allowed (standalone exams)
  type: z.enum(['QUIZ', 'EXAM']).default('QUIZ'), // QUIZ = course practice · EXAM = live exam
  courseId: z.string().min(1).nullish(),
  durationMin: z.number().int().min(1).max(180),
  isPublished: z.boolean(),
  imageUrl: z.string().max(600).nullish(), // feature image
  questions: z.array(questionInputSchema).min(1, 'At least 1 question required').max(50),
})

/** GET /api/quizzes */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const courseId = url.searchParams.get('courseId') || undefined
    const scope = url.searchParams.get('scope') || 'published'
    const typeParam = url.searchParams.get('type')
    const user = await getAuthUser(req) // may be null (public listing)

    const where: Prisma.QuizWhereInput = { isPublished: true }
    if (courseId) where.courseId = courseId
    if (typeParam === 'QUIZ' || typeParam === 'EXAM') where.type = typeParam

    if (scope === 'mine' && user) {
      const enrollments = await db.enrollment.findMany({
        where: { userId: user.id },
        select: { courseId: true },
      })
      const courseIds = enrollments.map((e) => e.courseId)
      // global quizzes (courseId = null) + quizzes of enrolled courses
      where.OR = [{ courseId: null }, { courseId: { in: courseIds } }]
    }

    // dashboard exam section — only exams the student explicitly
    // added by clicking a free exam on /exams (ExamEnrollment rows).
    if (scope === 'enrolled') {
      if (!user) return ok([])
      const enr = await db.examEnrollment.findMany({
        where: { userId: user.id, quizId: { not: null } },
        select: { quizId: true },
      })
      const ids = enr.map((e) => e.quizId!).filter(Boolean)
      if (ids.length === 0) return ok([])
      where.id = { in: ids }
    }

    const quizzes = await db.quiz.findMany({
      where,
      include: {
        course: { select: { id: true, title: true, slug: true } },
        _count: { select: { questions: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Per-quiz best attempt (percentage) for the logged-in user.
    const bestPct = new Map<string, number>()
    if (user && quizzes.length > 0) {
      const attempts = await db.quizAttempt.findMany({
        where: { userId: user.id, quizId: { in: quizzes.map((q) => q.id) } },
        select: { quizId: true, score: true, total: true },
      })
      for (const a of attempts) {
        if (a.total <= 0) continue
        const pct = Math.round((a.score / a.total) * 100)
        const current = bestPct.get(a.quizId)
        if (current === undefined || pct > current) bestPct.set(a.quizId, pct)
      }
    }

    const items = quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      type: q.type,
      durationMin: q.durationMin,
      isPublished: q.isPublished,
      imageUrl: q.imageUrl,
      createdAt: q.createdAt, // admin date column
      questionCount: q._count.questions,
      courseTitle: q.course?.title ?? null,
      myBest: bestPct.get(q.id) ?? null,
    }))

    return ok(items)
  } catch (err) {
    console.error('[GET /api/quizzes]', err)
    return fail('Server error', 500)
  }
}

/** POST /api/quizzes (admin) */
export async function POST(req: Request) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const body = await parseBody(req, quizInputSchema)
    if (isResponse(body)) return body

    // Sanitize text inputs; reject if sanitization destroys required content.
    const title = sanitize(body.title, 150)
    if (title.length < 3) return fail('Title is invalid after sanitization', 422)
    const description = body.description ? sanitize(body.description, 500) : undefined

    if (body.courseId) {
      const course = await db.course.findUnique({
        where: { id: body.courseId },
        select: { id: true },
      })
      if (!course) return fail('Course not found', 404)
    }

    const questions = body.questions.map((q, idx) => {
      const text = sanitize(q.text, 500)
      const options = q.options.map((o) => sanitize(o, 200))
      if (text.length < 3) return null
      if (options.some((o) => o.length === 0)) return null
      return {
        text,
        options,
        correctIndex: q.correctIndex,
        order: q.order ?? idx,
      }
    })
    if (questions.some((q) => q === null)) {
      return fail('Question/option text is empty after sanitization', 422)
    }

    const created = await db.$transaction(async (tx) => {
      const quiz = await tx.quiz.create({
        data: {
          title,
          description: description ?? null,
          type: body.type,
          courseId: body.courseId ?? null,
          durationMin: body.durationMin,
          isPublished: body.isPublished,
          imageUrl: body.imageUrl ?? null,
          questions: {
            create: questions.map((q) => ({
              text: q!.text,
              options: JSON.stringify(q!.options),
              correctIndex: q!.correctIndex,
              order: q!.order,
            })),
          },
        },
      })
      return tx.quiz.findUnique({
        where: { id: quiz.id },
        include: {
          questions: { orderBy: { order: 'asc' } },
          _count: { select: { questions: true } },
        },
      })
    })

    return ok(created)
  } catch (err) {
    console.error('[POST /api/quizzes]', err)
    return fail('Server error', 500)
  }
}

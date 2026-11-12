/**
 * /api/quizzes/[id] — quiz detail, update, delete.
 *
 * GET    admin → full quiz incl. correctIndex + isPublished
 *        public/student → correctIndex stripped (safe exam paper)
 * PUT    (admin) full update: quiz fields + sync questions (delete missing,
 *        update existing by id, create the rest) — transactional.
 * DELETE (admin) remove quiz (questions & attempts cascade).
 */
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
import { quizInputSchema } from '../route'

/** PUT schema = POST schema + optional question ids for upsert semantics. */
const questionUpdateSchema = z.object({
  id: z.string().min(1).optional(),
  text: z.string().min(3).max(500),
  options: z.array(z.string().min(1).max(200)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  order: z.number().int().min(0).optional(),
})
const quizUpdateSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().max(500).nullish(),
  type: z.enum(['QUIZ', 'EXAM']).optional(),
  courseId: z.string().min(1).nullish(),
  durationMin: z.number().int().min(1).max(180),
  isPublished: z.boolean(),
  imageUrl: z.string().max(600).nullish(), // feature image (same contract as POST)
  questions: z.array(questionUpdateSchema).min(1).max(50),
})

/** Safely parse the stored JSON options array. */
function parseOptions(raw: string): string[] {
  try {
    const arr: unknown = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.map((o) => String(o))
  } catch {
    // fall through
  }
  return []
}

/** GET /api/quizzes/[id] */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const quiz = await db.quiz.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, title: true } },
        questions: { orderBy: { order: 'asc' } },
      },
    })
    if (!quiz) return fail('Quiz not found', 404)

    const user = await getAuthUser(req)
    const isAdmin = user?.role === 'ADMIN'

    // Unpublished quizzes are only visible to admins.
    if (!quiz.isPublished && !isAdmin) return fail('Quiz not found', 404)

    if (isAdmin) {
      return ok({
        quiz: {
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          type: quiz.type,
          durationMin: quiz.durationMin,
          isPublished: quiz.isPublished,
          courseId: quiz.courseId,
          imageUrl: quiz.imageUrl, // edit form needs the stored feature image
          questionCount: quiz.questions.length,
          course: quiz.course ? { id: quiz.course.id, title: quiz.course.title } : null,
        },
        questions: quiz.questions.map((q) => ({
          id: q.id,
          text: q.text,
          options: parseOptions(q.options),
          order: q.order,
          correctIndex: q.correctIndex,
        })),
      })
    }

    // Public / student view — strip correct answers.
    return ok({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        durationMin: quiz.durationMin,
        questionCount: quiz.questions.length,
        course: quiz.course ? { id: quiz.course.id, title: quiz.course.title } : null,
      },
      questions: quiz.questions.map((q) => ({
        id: q.id,
        text: q.text,
        options: parseOptions(q.options),
        order: q.order,
      })),
    })
  } catch (err) {
    console.error('[GET /api/quizzes/[id]]', err)
    return fail('Server error', 500)
  }
}

/** PUT /api/quizzes/[id] (admin) */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const existing = await db.quiz.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return fail('Quiz not found', 404)

    const body = await parseBody(req, quizUpdateSchema)
    if (isResponse(body)) return body

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

    const prepared = body.questions.map((q, idx) => {
      const text = sanitize(q.text, 500)
      const options = q.options.map((o) => sanitize(o, 200))
      return { q, text, options, order: q.order ?? idx }
    })
    if (prepared.some((p) => p.text.length < 3 || p.options.some((o) => o.length === 0))) {
      return fail('Question/option text is empty after sanitization', 422)
    }

    const updated = await db.$transaction(async (tx) => {
      await tx.quiz.update({
        where: { id },
        data: {
          title,
          description: description ?? null,
          type: body.type ?? undefined,
          courseId: body.courseId ?? null,
          durationMin: body.durationMin,
          isPublished: body.isPublished,
          imageUrl: body.imageUrl ?? null,
        },
      })

      // Only ids that belong to THIS quiz may be updated — anything else is new.
      const ownedIds = new Set(
        (await tx.question.findMany({ where: { quizId: id }, select: { id: true } })).map(
          (q) => q.id,
        ),
      )
      const payloadIds = new Set(
        prepared.map((p) => p.q.id).filter((qid): qid is string => !!qid && ownedIds.has(qid)),
      )

      // Delete questions removed from the payload.
      await tx.question.deleteMany({
        where: { quizId: id, id: { notIn: [...payloadIds] } },
      })

      // Upsert remaining questions in payload order.
      for (const p of prepared) {
        const data = {
          text: p.text,
          options: JSON.stringify(p.options),
          correctIndex: p.q.correctIndex,
          order: p.order,
        }
        if (p.q.id && ownedIds.has(p.q.id)) {
          await tx.question.update({ where: { id: p.q.id }, data })
        } else {
          await tx.question.create({ data: { ...data, quizId: id } })
        }
      }

      return tx.quiz.findUnique({
        where: { id },
        include: { questions: { orderBy: { order: 'asc' } } },
      })
    })

    return ok(updated)
  } catch (err) {
    console.error('[PUT /api/quizzes/[id]]', err)
    return fail('Server error', 500)
  }
}

/** DELETE /api/quizzes/[id] (admin) */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const existing = await db.quiz.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return fail('Quiz not found', 404)

    // Questions & attempts cascade (schema onDelete: Cascade).
    await db.quiz.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/quizzes/[id]]', err)
    return fail('Server error', 500)
  }
}

/**
 * /api/admin/written-exams/[id] — one written exam.
 *  GET    → full row (manager+)
 *  PATCH  → update (manager+) — fields are partial; questionImages replaces
 *  DELETE → delete (manager+). Cascades purchases/attempts (rare, owner action).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireManager } from '@/lib/api-helpers'

export const runtime = 'nodejs'

const questionImage = z.object({
  url: z.string().min(1).max(500),
  name: z.string().max(200).optional(),
  size: z.number().int().nonnegative().optional(),
  mime: z.string().max(100).optional(),
})

const patchSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(4000).optional(),
  instructions: z.string().max(8000).optional(),
  courseId: z.string().max(50).nullable().optional(),
  categoryName: z.string().max(120).nullable().optional(),
  subjectId: z.string().max(50).nullable().optional(),
  subjectName: z.string().max(120).nullable().optional(),
  durationMin: z.number().int().min(1).max(24 * 60).optional(),
  totalMarks: z.number().int().min(1).max(1000).optional(),
  isFree: z.boolean().optional(),
  price: z.number().nonnegative().nullable().optional(),
  isPublished: z.boolean().optional(),
  questionPdfUrl: z.string().max(500).nullable().optional(),
  questionPdfName: z.string().max(200).nullable().optional(),
  questionImages: z.array(questionImage).max(30).optional(),
  imageUrl: z.string().max(600).nullable().optional(), // feature image
})

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth
    const { id } = await params
    const exam = await db.writtenExam.findUnique({ where: { id } })
    if (!exam) return fail('Exam not found.', 404)
    let courseTitle: string | null = null
    if (exam.courseId) {
      const c = await db.course.findUnique({ where: { id: exam.courseId }, select: { title: true } })
      courseTitle = c?.title ?? null
    }
    return ok({
      ...exam,
      courseTitle,
      questionImages: safeParseImages(exam.questionImages),
    })
  } catch (err) {
    console.error('[GET /api/admin/written-exams/[id]]', err)
    return fail('Server error', 500)
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth
    const { id } = await params
    const parsed = await parseBody(req, patchSchema)
    if (isResponse(parsed)) return parsed
    const b = parsed

    const exam = await db.writtenExam.findUnique({ where: { id }, select: { id: true, isFree: true } })
    if (!exam) return fail('Exam not found.', 404)

    // pricing consistency
    let isFree = b.isFree
    let price = b.price
    if (isFree === undefined) isFree = exam.isFree
    if (isFree) price = null
    else if (price === undefined) {
      const cur = await db.writtenExam.findUnique({ where: { id }, select: { price: true } })
      price = cur?.price ?? 0
    }
    if (!isFree && !(Number(price) > 0)) return fail('পেইড এক্সামের দাম দিন। (Set a price for a paid exam.)', 422)

    if (b.courseId) {
      const course = await db.course.findUnique({ where: { id: b.courseId }, select: { id: true } })
      if (!course) return fail('Course not found.', 404)
    }

    const { sanitize } = await import('@/lib/api-helpers')
    const updated = await db.writtenExam.update({
      where: { id },
      data: {
        ...(b.title !== undefined ? { title: sanitize(b.title, 200) } : {}),
        ...(b.description !== undefined ? { description: sanitize(b.description, 4000) } : {}),
        ...(b.instructions !== undefined ? { instructions: sanitize(b.instructions, 8000) } : {}),
        ...(b.courseId !== undefined ? { courseId: b.courseId || null } : {}),
        ...(b.categoryName !== undefined ? { categoryName: b.categoryName ? sanitize(b.categoryName, 120) : null } : {}),
        ...(b.subjectId !== undefined ? { subjectId: b.subjectId || null } : {}),
        ...(b.subjectName !== undefined ? { subjectName: b.subjectName ? sanitize(b.subjectName, 120) : null } : {}),
        ...(b.durationMin !== undefined ? { durationMin: b.durationMin } : {}),
        ...(b.totalMarks !== undefined ? { totalMarks: b.totalMarks } : {}),
        isFree,
        price,
        ...(b.isPublished !== undefined ? { isPublished: b.isPublished } : {}),
        ...(b.questionPdfUrl !== undefined ? { questionPdfUrl: b.questionPdfUrl || null } : {}),
        ...(b.questionPdfName !== undefined ? { questionPdfName: b.questionPdfName || null } : {}),
        ...(b.questionImages !== undefined ? { questionImages: JSON.stringify(b.questionImages) } : {}),
        ...(b.imageUrl !== undefined ? { imageUrl: b.imageUrl || null } : {}),
      },
      select: { id: true },
    })
    return ok(updated)
  } catch (err) {
    console.error('[PATCH /api/admin/written-exams/[id]]', err)
    return fail('Server error', 500)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth
    const { id } = await params
    const exam = await db.writtenExam.findUnique({ where: { id }, select: { id: true } })
    if (!exam) return fail('Exam not found.', 404)
    await db.writtenExam.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/written-exams/[id]]', err)
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

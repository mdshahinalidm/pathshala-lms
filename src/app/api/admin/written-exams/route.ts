/**
 * /api/admin/written-exams — WRITTEN/THEORY exam manager (admin side).
 *  GET  → list every written exam (incl. drafts) + attempt/purchase counts
 *  POST → create (manager+). Question media arrive as /api/admin/upload URLs.
 * No MCQ anywhere — written exams are descriptive answer-sheet exams.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAdmin, requireManager, sanitize } from '@/lib/api-helpers'

export const runtime = 'nodejs'

const questionImage = z.object({
  url: z.string().min(1).max(500),
  name: z.string().max(200).optional(),
  size: z.number().int().nonnegative().optional(),
  mime: z.string().max(100).optional(),
})

const createSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional(),
  instructions: z.string().max(8000).optional(),
  courseId: z.string().max(50).nullable().optional(),
  categoryName: z.string().max(120).nullable().optional(),
  subjectId: z.string().max(50).nullable().optional(),
  subjectName: z.string().max(120).nullable().optional(),
  durationMin: z.number().int().min(1).max(24 * 60),
  totalMarks: z.number().int().min(1).max(1000),
  isFree: z.boolean().optional(),
  price: z.number().nonnegative().nullable().optional(),
  isPublished: z.boolean().optional(),
  questionPdfUrl: z.string().max(500).nullable().optional(),
  questionPdfName: z.string().max(200).nullable().optional(),
  questionImages: z.array(questionImage).max(30).optional(),
  imageUrl: z.string().max(600).nullable().optional(), // feature image
})

/** GET — all written exams with counters (manager+). */
export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (isResponse(auth)) return auth

    const exams = await db.writtenExam.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        instructions: true,
        courseId: true,
        categoryName: true,
        subjectId: true,
        subjectName: true,
        durationMin: true,
        totalMarks: true,
        isFree: true,
        price: true,
        isPublished: true,
        imageUrl: true, // feature image shown in the admin card list
        questionPdfUrl: true,
        questionPdfName: true,
        questionImages: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { purchases: true, attempts: true } },
      },
    })

    // course titles for the table display
    const courseIds = exams.map((e) => e.courseId).filter((v): v is string => Boolean(v))
    const courses = courseIds.length
      ? await db.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } })
      : []
    const titleOf = new Map(courses.map((c) => [c.id, c.title]))

    return ok(
      exams.map(({ _count, ...e }) => ({
        ...e,
        courseTitle: e.courseId ? (titleOf.get(e.courseId) ?? null) : null,
        questionImages: safeParseImages(e.questionImages),
        purchaseCount: _count.purchases,
        attemptCount: _count.attempts,
      }))
    )
  } catch (err) {
    console.error('[GET /api/admin/written-exams]', err)
    return fail('Server error', 500)
  }
}

/** POST — create a written exam (manager+). */
export async function POST(req: Request) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth

    const parsed = await parseBody(req, createSchema)
    if (isResponse(parsed)) return parsed
    const b = parsed

    const isFree = b.isFree ?? true
    const price = isFree ? null : (b.price ?? 0)
    if (!isFree && !(Number(price) > 0)) return fail('পেইড এক্সামের দাম দিন। (Set a price for a paid exam.)', 422)
    if (!b.questionPdfUrl && !(b.questionImages && b.questionImages.length > 0)) {
      return fail('প্রশ্নের PDF অথবা অন্তত একটি ছবি আপলোড করুন। (Upload a question PDF or at least one image.)', 422)
    }

    // validate course link (optional)
    if (b.courseId) {
      const course = await db.course.findUnique({ where: { id: b.courseId }, select: { id: true } })
      if (!course) return fail('Course not found.', 404)
    }

    const exam = await db.writtenExam.create({
      data: {
        title: sanitize(b.title, 200),
        description: b.description ? sanitize(b.description, 4000) : '',
        instructions: b.instructions ? sanitize(b.instructions, 8000) : '',
        courseId: b.courseId || null,
        categoryName: b.categoryName ? sanitize(b.categoryName, 120) : null,
        subjectId: b.subjectId || null,
        subjectName: b.subjectName ? sanitize(b.subjectName, 120) : null,
        durationMin: b.durationMin,
        totalMarks: b.totalMarks,
        isFree,
        price,
        isPublished: b.isPublished ?? false,
        questionPdfUrl: b.questionPdfUrl || null,
        questionPdfName: b.questionPdfName || null,
        questionImages: JSON.stringify(b.questionImages ?? []),
        imageUrl: b.imageUrl || null,
      },
      select: { id: true },
    })
    return ok({ id: exam.id }, 201)
  } catch (err) {
    console.error('[POST /api/admin/written-exams]', err)
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

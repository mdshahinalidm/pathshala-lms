/**
 * /api/exams/catalog UNIFIED public exam catalog for /exams.
 *
 * Merges every published MCQ exam (Quiz, type=EXAM) with every published
 * (and schedule-visible) written exam (WrittenExam) into one normalized
 * list so the public exam page can show them together — free and paid —
 * with feature images, exactly like the courses catalog.
 *
 * GET (public, no auth required):
 *   → { items: CatalogItem[], courses: { id, title }[] }
 *   CatalogItem: { kind: 'MCQ'|'WRITTEN', id, title, description, imageUrl,
 *     durationMin, questionCount|null, totalMarks|null, isFree, price|null,
 *     courseTitle|null, categoryName|null, subjectName|null, createdAt }
 */
import { db } from '@/lib/db'
import { fail, ok } from '@/lib/api-helpers'
import { examVisibleNow } from '@/lib/exam-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeImages(json: string): { url: string; name?: string }[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export async function GET() {
  try {
    const [mcqRows, writtenRows] = await Promise.all([
      db.quiz.findMany({
        where: { type: 'EXAM', isPublished: true },
        orderBy: { createdAt: 'desc' },
        include: {
          course: { select: { id: true, title: true } },
          _count: { select: { questions: true } },
        },
      }),
      db.writtenExam.findMany({
        where: { isPublished: true },
        orderBy: { createdAt: 'desc' },
        include: {
          course: { select: { id: true, title: true } },
          category: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true, nameEn: true } },
        },
      }),
    ])

    const items: Record<string, unknown>[] = []

    for (const q of mcqRows) {
      items.push({
        kind: 'MCQ',
        id: q.id,
        title: q.title,
        description: q.description,
        imageUrl: q.imageUrl,
        durationMin: q.durationMin,
        questionCount: q._count.questions,
        totalMarks: null,
        isFree: true, // MCQ exams have no paid flow
        price: null,
        courseTitle: q.course?.title ?? null,
        categoryName: null,
        subjectName: null,
        createdAt: q.createdAt,
      })
    }

    for (const e of writtenRows) {
      if (!examVisibleNow(e)) continue
      const hasQuestion = Boolean(e.questionPdfUrl) || safeImages(e.questionImages).length > 0
      items.push({
        kind: 'WRITTEN',
        id: e.id,
        title: e.title,
        description: e.description || null,
        imageUrl: e.imageUrl,
        durationMin: e.durationMin,
        questionCount: hasQuestion ? null : 0,
        totalMarks: e.totalMarks,
        isFree: !(e.price != null && e.price > 0),
        price: e.price,
        courseTitle: e.course?.title ?? null,
        categoryName: e.category?.name ?? e.categoryName ?? null,
        subjectName: e.subject?.nameEn || e.subject?.name || e.subjectName || null,
        createdAt: e.createdAt,
      })
    }

    items.sort((a, b) => new Date(b.createdAt as Date).getTime() - new Date(a.createdAt as Date).getTime())

    // Distinct linked courses (for the filter sidebar), sorted by title.
    const courseMap = new Map<string, string>()
    for (const q of mcqRows) if (q.course) courseMap.set(q.course.id, q.course.title)
    for (const e of writtenRows) if (e.course) courseMap.set(e.course.id, e.course.title)
    const courses = [...courseMap.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title))

    return ok({ items, courses })
  } catch (err) {
    console.error('[GET /api/exams/catalog]', err)
    return fail('Server error', 500)
  }
}

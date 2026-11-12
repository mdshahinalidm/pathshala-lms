/**
 * /api/questions — public question bank listing for /questions page.
 *
 * GET ?filter=recent|archive|all&limit=24
 *   recent  : questions of published quizzes with ZERO attempts
 *             (exams not yet taken) — correctIndex hidden.
 *   archive : questions of published quizzes with >=1 attempt
 *             (exam already held) — correctIndex included, shown archived.
 *   all     : both merged (recent first).
 *
 * Newest quizzes first; options parsed from the stored JSON string.
 */
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const filter = url.searchParams.get('filter') || 'all'
    const limitRaw = parseInt(url.searchParams.get('limit') || '24', 10)
    const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 24 : limitRaw, 1), 60)

    // Published quizzes with attempt counts → split recent vs archive.
    const quizzes = await db.quiz.findMany({
      where: { isPublished: true },
      select: { id: true, title: true, type: true, durationMin: true, createdAt: true, _count: { select: { attempts: true } } },
      orderBy: { createdAt: 'desc' },
    })

    const archiveQuizIds = quizzes.filter((q) => q._count.attempts > 0).map((q) => q.id)
    const recentQuizIds = quizzes.filter((q) => q._count.attempts === 0).map((q) => q.id)

    const wantRecent = filter === 'recent' || filter === 'all'
    const wantArchive = filter === 'archive' || filter === 'all'

    const baseSelect = {
      id: true,
      text: true,
      options: true,
      correctIndex: true,
      order: true,
      quiz: {
        select: {
          id: true,
          title: true,
          type: true,
          durationMin: true,
          createdAt: true,
          course: { select: { title: true, slug: true, category: { select: { name: true, nameEn: true } } } },
        },
      },
    } as const

    const [recentRows, archiveRows] = await Promise.all([
      wantRecent && recentQuizIds.length > 0
        ? db.question.findMany({
            where: { quizId: { in: recentQuizIds } },
            select: baseSelect,
            orderBy: [{ quiz: { createdAt: 'desc' } }, { order: 'asc' }],
            take: wantArchive ? Math.ceil(limit / 2) : limit,
          })
        : Promise.resolve([]),
      wantArchive && archiveQuizIds.length > 0
        ? db.question.findMany({
            where: { quizId: { in: archiveQuizIds } },
            select: baseSelect,
            orderBy: [{ quiz: { createdAt: 'desc' } }, { order: 'asc' }],
            take: wantRecent ? Math.ceil(limit / 2) : limit,
          })
        : Promise.resolve([]),
    ])

    const map = (row: (typeof recentRows)[number], archived: boolean) => ({
      id: row.id,
      text: row.text,
      options: JSON.parse(row.options) as string[],
      // Answers are only revealed for archived questions (exam already held).
      ...(archived ? { correctIndex: row.correctIndex } : {}),
      archived,
      quiz: {
        id: row.quiz.id,
        title: row.quiz.title,
        type: row.quiz.type,
        durationMin: row.quiz.durationMin,
      },
      courseTitle: row.quiz.course?.title ?? null,
      courseSlug: row.quiz.course?.slug ?? null,
      categoryName: row.quiz.course?.category?.name ?? null,
    })

    const items = [...recentRows.map((r) => map(r, false)), ...archiveRows.map((r) => map(r, true))]
    return ok(items)
  } catch (err) {
    console.error('[GET /api/questions]', err)
    return fail('Server error', 500)
  }
}

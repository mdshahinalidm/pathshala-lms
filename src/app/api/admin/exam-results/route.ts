/**
 * GET /api/admin/exam-results — RESULT CENTER list (panel roles).
 * Filters: examId, courseId, status (SUBMITTED|MARKED|PUBLISHED|...),
 * q (student name/email/exam title), from/to (ISO date). Paginated (page/50).
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAdmin } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (isResponse(auth)) return auth

    const sp = new URL(req.url).searchParams
    const examId = sp.get('examId') || undefined
    const status = sp.get('status') || undefined
    const q = (sp.get('q') || '').trim()
    const from = sp.get('from')
    const to = sp.get('to')
    const page = Math.max(1, Number(sp.get('page') ?? 1) || 1)
    const PER = 50

    const where: Record<string, unknown> = {
      status: { in: ['SUBMITTED', 'MARKED', 'PUBLISHED'] }, // only actionable submissions
    }
    if (examId) where.examId = examId
    if (status && ['SUBMITTED', 'MARKED', 'PUBLISHED'].includes(status)) where.status = status
    if (from || to) {
      const created: Record<string, Date> = {}
      if (from) created.gte = new Date(from)
      if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); created.lte = d }
      where.createdAt = created
    }
    if (q) {
      where.OR = [
        { user: { name: { contains: q } } },
        { user: { email: { contains: q } } },
        { user: { phone: { contains: q } } },
        { exam: { title: { contains: q } } },
      ]
    }

    const [total, rows] = await Promise.all([
      db.examAttempt.count({ where }),
      db.examAttempt.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * PER,
        take: PER,
        select: {
          id: true, status: true, expired: true, submittedAt: true, totalMarks: true,
          createdAt: true, obtainedMarks: true, percentage: true, grade: true, publishedAt: true,
          user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true, studentClass: true } },
          exam: { select: { id: true, title: true, categoryName: true, subjectName: true, totalMarks: true } },
          _count: { select: { images: true } },
        },
      }),
    ])

    return ok({
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PER)),
      submissions: rows.map(({ _count, ...r }) => ({ ...r, imageCount: _count.images })),
    })
  } catch (err) {
    console.error('[GET /api/admin/exam-results]', err)
    return fail('Server error', 500)
  }
}

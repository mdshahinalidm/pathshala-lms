/**
 * /api/admin/students — student management (panel: ADMIN + MANAGER).
 *
 * GET  ?q=<search name/email/phone> · ?class=<ClassKey filter>
 *      → { students: [...], classCounts: { CLASS_9: n, … }, total }
 *        Every STUDENT account with profile data + enrollment/order/purchase
 *        counts, newest first (200 max).
 *
 * GET /api/admin/students/[id] → full detail for the students-page detail
 * dialog: profile, enrollments (course+progress), orders, purchases,
 * quiz attempts, notifications count.
 */
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAdmin } from '@/lib/api-helpers'
import { CLASS_OPTIONS } from '@/lib/student-classes'

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const url = new URL(req.url)
    const q = url.searchParams.get('q')?.trim()
    const classFilter = url.searchParams.get('class')?.trim()

    const where: Prisma.UserWhereInput = {
      role: 'STUDENT',
      ...(classFilter && CLASS_OPTIONS.some((c) => c.value === classFilter)
        ? { studentClass: classFilter }
        : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } },
              { institution: { contains: q } },
            ],
          }
        : {}),
    }

    const [students, groupByClass, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isVerified: true,
          isBlocked: true,
          avatarUrl: true,
          studentClass: true,
          institution: true,
          createdAt: true,
          _count: { select: { enrollments: true, orders: true, purchases: true } },
        },
      }),
      // Per-class headcount (ALL students, unaffected by search) — the
      // "কোন ক্লাসে কত জন" chips above the table.
      db.user.groupBy({
        by: ['studentClass'],
        where: { role: 'STUDENT' },
        _count: { _all: true },
      }),
      db.user.count({ where: { role: 'STUDENT' } }),
    ])

    const classCounts: Record<string, number> = {}
    for (const g of groupByClass) {
      classCounts[g.studentClass ?? 'NOT_SET'] = g._count._all
    }

    return ok({ students, classCounts, total })
  } catch (err) {
    console.error('[GET /api/admin/students]', err)
    return fail('Server error', 500)
  }
}

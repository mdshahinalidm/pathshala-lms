/**
 * GET /api/admin/students/[id] — full student detail (panel).
 * Profile + enrollments + orders + suggestion purchases + quiz attempts +
 * notification count — shown in the admin Students detail dialog.
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAdmin } from '@/lib/api-helpers'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const { id } = await params

    const student = await db.user.findFirst({
      where: { id, role: 'STUDENT' },
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
        activeSessionId: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    if (!student) return fail('Student not found', 404)

    const [enrollments, orders, purchases, quizAttempts, notificationsCount] = await Promise.all([
      db.enrollment.findMany({
        where: { userId: id },
        orderBy: { enrolledAt: 'desc' },
        select: {
          id: true,
          progress: true,
          enrolledAt: true,
          expiresAt: true,
          course: { select: { id: true, title: true, slug: true, price: true } },
        },
      }),
      db.order.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          amount: true,
          method: true,
          status: true,
          payStatus: true,
          trxId: true,
          invoiceNo: true,
          createdAt: true,
          course: { select: { title: true } },
        },
      }),
      db.suggestionPurchase.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          amount: true,
          method: true,
          status: true,
          payStatus: true,
          trxId: true,
          invoiceNo: true,
          createdAt: true,
          suggestion: { select: { id: true, title: true } },
        },
      }),
      db.quizAttempt.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          score: true,
          total: true,
          createdAt: true,
          quiz: { select: { title: true } },
        },
      }),
      db.notification.count({ where: { userId: id } }),
    ])

    return ok({ student, enrollments, orders, purchases, quizAttempts, notificationsCount })
  } catch (err) {
    console.error('[GET /api/admin/students/[id]]', err)
    return fail('Server error', 500)
  }
}

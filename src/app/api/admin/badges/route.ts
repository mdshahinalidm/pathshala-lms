/**
 * GET /api/admin/badges — lightweight poll endpoint for admin-shell badge
 * counters (sidebar pills / favicon-style alerts).
 * Returns pending order count, pending suggestion-purchase count and unread
 * contact-message count.
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAdmin } from '@/lib/api-helpers'

/** GET /api/admin/badges (admin) */
export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const [pendingOrders, unreadMessages, pendingPurchases] = await Promise.all([
      db.order.count({ where: { status: 'PENDING' } }),
      db.contactMessage.count({ where: { isRead: false } }),
      db.suggestionPurchase.count({ where: { payStatus: 'SUBMITTED' } }),
    ])

    return ok({ pendingOrders, unreadMessages, pendingPurchases })
  } catch (err) {
    console.error('[GET /api/admin/badges]', err)
    return fail('Server error', 500)
  }
}

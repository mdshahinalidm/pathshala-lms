/**
 * GET /api/admin/messages — admin inbox for contact-form messages.
 * Returns the latest 200 messages (newest first) + unread badge count.
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAdmin } from '@/lib/api-helpers'

/** GET /api/admin/messages (admin) */
export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const [messages, unreadCount] = await Promise.all([
      db.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
      db.contactMessage.count({ where: { isRead: false } }),
    ])

    return ok({ messages, unreadCount })
  } catch (err) {
    console.error('[GET /api/admin/messages]', err)
    return fail('Server error', 500)
  }
}

/**
 * GET   /api/notifications — own notifications (latest 50, desc) + unreadCount
 * PATCH /api/notifications — mark read: {id} or {all:true} → {updated:n}
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAuth } from '@/lib/api-helpers'

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId: auth.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      db.notification.count({ where: { userId: auth.id, isRead: false } }),
    ])
    return ok({ notifications, unreadCount })
  } catch (err) {
    console.error('[GET /api/notifications]', err)
    return fail('Server error', 500)
  }
}

const patchSchema = z.object({
  id: z.string().min(1).optional(),
  all: z.boolean().optional(),
})

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const parsed = await parseBody(req, patchSchema)
    if (isResponse(parsed)) return parsed

    if (parsed.all) {
      const r = await db.notification.updateMany({
        where: { userId: auth.id, isRead: false },
        data: { isRead: true },
      })
      return ok({ updated: r.count })
    }
    if (parsed.id) {
      // updateMany scoped by userId → users can only mark their own as read.
      const r = await db.notification.updateMany({
        where: { id: parsed.id, userId: auth.id, isRead: false },
        data: { isRead: true },
      })
      return ok({ updated: r.count })
    }
    return fail('Provide a notification id or all:true', 422)
  } catch (err) {
    console.error('[PATCH /api/notifications]', err)
    return fail('Server error', 500)
  }
}

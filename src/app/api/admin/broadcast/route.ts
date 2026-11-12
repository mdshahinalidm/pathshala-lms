/**
 * POST /api/admin/broadcast — push a NOTICE notification to students.
 *
 * Body: { title 3..120, body 1..300, link? ≤200 (must start with '#' or '/'),
 *         userIds?: string[] (≤500), targetClasses?: ClassKey[] (≤9) }
 *   - userIds non-empty        → notify exactly those users (all must exist).
 *   - targetClasses non-empty  → notify STUDENTS whose studentClass is in the
 *                                list (class 9/10/11/12, honours 1st–4th…).
 *   - otherwise                → notify ALL users with role=STUDENT and
 *                                isBlocked=false.
 * Every send also creates a Broadcast row so targeted students can read it
 * from the dashboard নোটিশ বোর্ড (GET /api/broadcasts).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireManager, sanitize } from '@/lib/api-helpers'
import { CLASS_OPTIONS, isValidClass } from '@/lib/student-classes'

const broadcastSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(120),
  body: z.string().min(1, 'Body is required').max(300),
  link: z
    .string()
    .max(200)
    .refine((v) => v.startsWith('#') || v.startsWith('/'), {
      message: 'Link must be an in-app route starting with "#" or "/"',
    })
    .optional(),
  userIds: z.array(z.string().min(1)).max(500).optional(),
  targetClasses: z.array(z.string()).max(CLASS_OPTIONS.length).optional(),
})

/** POST /api/admin/broadcast (admin) */
export async function POST(req: Request) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const parsed = await parseBody(req, broadcastSchema)
    if (isResponse(parsed)) return parsed

    const title = sanitize(parsed.title, 120)
    if (title.length < 3) return fail('Title is invalid after sanitization', 422)
    const body = sanitize(parsed.body, 300)
    if (body.length < 1) return fail('Body is invalid after sanitization', 422)
    const link = parsed.link ? sanitize(parsed.link, 200) || null : null

    // Class targeting (validated against the shared taxonomy).
    const targetClasses = (parsed.targetClasses ?? []).filter(isValidClass)

    let targetIds: string[]
    if (parsed.userIds && parsed.userIds.length > 0) {
      const uniqueIds = [...new Set(parsed.userIds)]
      const found = await db.user.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true },
      })
      if (found.length !== uniqueIds.length) {
        return fail('One or more selected users do not exist', 400)
      }
      targetIds = uniqueIds
    } else {
      const students = await db.user.findMany({
        where: {
          role: 'STUDENT',
          isBlocked: false,
          ...(targetClasses.length > 0 ? { studentClass: { in: targetClasses } } : {}),
        },
        select: { id: true },
      })
      targetIds = students.map((s) => s.id)
    }

    if (targetIds.length === 0) return ok({ notifiedCount: 0 })

    const created = await db.notification.createMany({
      data: targetIds.map((userId) => ({
        userId,
        type: 'NOTICE',
        title,
        body,
        link: link ?? '/dashboard/notices',
        isRead: false,
      })),
    })

    // Persist the broadcast for the student notice board (best-effort —
    // notifications already went out, so a failure here must not 500).
    try {
      await db.broadcast.create({
        data: {
          title,
          body,
          link: link ? (link.startsWith('#') ? link.slice(1) : link) : null,
          targetClasses: JSON.stringify(targetClasses),
          recipientCount: created.count,
          createdByName: admin.name,
        },
      })
    } catch (e) {
      console.error('[POST /api/admin/broadcast] broadcast row failed', e)
    }

    return ok({ notifiedCount: created.count })
  } catch (err) {
    console.error('[POST /api/admin/broadcast]', err)
    return fail('Server error', 500)
  }
}

/**
 * PATCH  /api/admin/messages/[id] — ADMIN mark read/unread {isRead:boolean}.
 * DELETE /api/admin/messages/[id] — ADMIN delete a contact message.
 * Both 404-guarded; PATCH returns the updated message.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAdmin } from '@/lib/api-helpers'

const messagePatchSchema = z.object({
  isRead: z.boolean(),
})

// ───────────────────────────────── PATCH ────────────────────────────────

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const parsed = await parseBody(req, messagePatchSchema)
    if (isResponse(parsed)) return parsed

    const existing = await db.contactMessage.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return fail('Message not found', 404)

    const message = await db.contactMessage.update({
      where: { id },
      data: { isRead: parsed.isRead },
    })
    return ok(message)
  } catch (err) {
    console.error('[PATCH /api/admin/messages/[id]]', err)
    return fail('Server error', 500)
  }
}

// ──────────────────────────────── DELETE ────────────────────────────────

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const existing = await db.contactMessage.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return fail('Message not found', 404)

    await db.contactMessage.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/messages/[id]]', err)
    return fail('Server error', 500)
  }
}

/**
 * /api/admin/combo-purchases/[id] — review actions.
 *  PATCH → { action: 'APPROVE' | 'REJECT', note? } — approve grants the WHOLE
 *          combo instantly (grantComboAccess). Reject marks FAILED.
 *  DELETE → permanent record cleanup.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireManager } from '@/lib/api-helpers'
import { grantComboAccess } from '@/lib/combo'

export const runtime = 'nodejs'

const schema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().max(600).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    const purchase = await db.comboPurchase.findUnique({
      where: { id },
      include: { combo: { select: { title: true } } },
    })
    if (!purchase) return fail('Purchase not found.', 404)

    if (parsed.action === 'APPROVE') {
      if (purchase.status === 'SUCCESS') return ok({ status: 'SUCCESS', alreadyProcessed: true })
      if (purchase.status === 'FAILED') return fail('FAILED ক্রয় আর অনুমোদন করা যাবে না।', 409)
      if (parsed.note) {
        await db.comboPurchase.update({
          where: { id },
          data: { adminNote: parsed.note.slice(0, 600) },
        })
      }
      await grantComboAccess(id)
      return ok({ status: 'SUCCESS' })
    }

    // REJECT
    if (purchase.status === 'FAILED') return ok({ status: 'FAILED', alreadyProcessed: true })
    await db.comboPurchase.update({
      where: { id },
      data: {
        status: 'FAILED',
        payStatus: 'REJECTED',
        adminNote: parsed.note ? parsed.note.slice(0, 600) : purchase.adminNote,
      },
    })
    return ok({ status: 'FAILED' })
  } catch (err) {
    console.error('[PATCH /api/admin/combo-purchases/[id]]', err)
    return fail('Server error', 500)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth
    const { id } = await params
    const purchase = await db.comboPurchase.findUnique({ where: { id }, select: { id: true } })
    if (!purchase) return fail('Purchase not found.', 404)
    await db.comboPurchase.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/combo-purchases/[id]]', err)
    return fail('Server error', 500)
  }
}

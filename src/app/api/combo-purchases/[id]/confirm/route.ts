/**
 * POST /api/combo-purchases/[id]/confirm — SANDBOX gateway auto-confirmation.
 * Owner-only; idempotent. SUCCESS → grantComboAccess marks the purchase
 * SUCCESS and every combo item instantly lands in the student's dashboard.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAuth } from '@/lib/api-helpers'
import { grantComboAccess } from '@/lib/combo'

export const runtime = 'nodejs'

const schema = z.object({ status: z.enum(['SUCCESS', 'FAILED']) })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    const purchase = await db.comboPurchase.findUnique({
      where: { id },
      include: { combo: { select: { title: true } } },
    })
    if (!purchase || purchase.userId !== auth.id) return fail('Purchase not found.', 404)
    if (purchase.status !== 'PENDING') return ok({ status: purchase.status, alreadyProcessed: true })

    const gateway = await db.paymentGateway.findUnique({
      where: { code: purchase.method },
      select: { mode: true },
    })
    if (!gateway || gateway.mode !== 'SANDBOX') {
      return fail('এই মেথডে সরাসরি কনফার্ম করা যাবে না।', 400)
    }

    if (parsed.status === 'SUCCESS') {
      await grantComboAccess(id)
    } else {
      await db.comboPurchase.update({
        where: { id },
        data: { status: 'FAILED', payStatus: 'REJECTED', adminNote: 'Sandbox demo failure' },
      })
    }

    return ok({ status: parsed.status })
  } catch (err) {
    console.error('[POST /api/combo-purchases/[id]/confirm]', err)
    return fail('Server error', 500)
  }
}

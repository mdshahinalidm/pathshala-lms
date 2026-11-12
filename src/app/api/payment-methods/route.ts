/**
 * GET /api/payment-methods — PUBLIC checkout payload.
 * Returns every ENABLED gateway for the checkout page. Never exposes
 * config/secrets — manual gateways only expose the pay-to numbers.
 */
import { db } from '@/lib/db'
import { fail, ok } from '@/lib/api-helpers'
import { ensureGatewaysSeeded, toPublicGateway } from '@/lib/payment-gateways'

export const runtime = 'nodejs'

export async function GET() {
  try {
    await ensureGatewaysSeeded()
    const gateways = await db.paymentGateway.findMany({
      where: { enabled: true, mode: { not: 'OFF' } },
      orderBy: { order: 'asc' },
    })
    return ok(gateways.map(toPublicGateway))
  } catch (err) {
    console.error('[GET /api/payment-methods]', err)
    return fail('Server error', 500)
  }
}

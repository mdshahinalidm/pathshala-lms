/**
 * invoice.ts — ONE shared invoice-number generator (admin-configurable).
 *
 * Format: <prefix>-<zero-padded sequential number>, e.g. INV-PAY-001, 002, …
 * The admin controls prefix (SiteSetting.invoicePrefix), padding width
 * (invoicePad) and the next sequence number (invoiceSeq) from the admin
 * panel. Every issued number is uniqueness-checked against existing orders —
 * duplicates are structurally impossible (loop retries with the next number).
 *
 * Legacy orders keep their old PS-INV-… numbers untouched.
 */
import { db } from '@/lib/db'

/** Default values mirror the SiteSetting column defaults. */
export async function nextInvoiceNo(): Promise<string> {
  const settings = await db.siteSetting.findUnique({
    where: { id: 'singleton' },
    select: { invoicePrefix: true, invoiceSeq: true, invoicePad: true },
  })
  const prefix = (settings?.invoicePrefix || 'INV-PAY').trim() || 'INV-PAY'
  const pad = Math.min(8, Math.max(1, settings?.invoicePad ?? 3))
  let seq = Math.max(1, settings?.invoiceSeq ?? 1)

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = `${prefix}-${String(seq).padStart(pad, '0')}`
    // Unique across BOTH consumers: course orders AND suggestion purchases.
    const [orderClash, purchaseClash] = await Promise.all([
      db.order.findFirst({ where: { invoiceNo: candidate }, select: { id: true } }),
      db.suggestionPurchase.findFirst({ where: { invoiceNo: candidate }, select: { id: true } }),
    ])
    if (!orderClash && !purchaseClash) {
      // Persist the sequence so the NEXT invoice follows on (best-effort).
      try {
        await db.siteSetting.update({
          where: { id: 'singleton' },
          data: { invoiceSeq: seq + 1 },
        }).catch(() => null)
      } catch {
        /* singleton row may not exist yet — defaults apply next time */
      }
      return candidate
    }
    seq++
  }
  // Absolute fallback (never expected): timestamp-suffixed unique ID.
  return `${prefix}-${Date.now().toString().slice(-9)}`
}

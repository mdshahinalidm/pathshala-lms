/**
 * Shared coupon validation.
 *
 * One source of truth for every purchasable item type (course orders,
 * written/MCQ exam purchases, suggestion purchases, plus the public
 * validate-preview endpoint). Rules mirror the original orders route:
 *   • coupon must exist and be isActive
 *   • scopes (COURSE/EXAM/SUGGESTION selection) must include the
 *     item type being purchased
 *   • expiresAt (admin-set time limit) must be in the future
 *   • maxUses (admin-set usage limit) must not be reached
 *   • minAmount must be ≤ the item's list amount
 * discount = PERCENT ? round(list * value/100) : min(value, list), clamped ≥ 0.
 */
import { db } from '@/lib/db'

/** purchase types a coupon can be scoped to. */
export const COUPON_SCOPES = ['COURSE', 'EXAM', 'SUGGESTION'] as const
export type CouponScope = (typeof COUPON_SCOPES)[number]

export const COUPON_SCOPE_LABELS: Record<CouponScope, { bn: string; en: string }> = {
  COURSE: { bn: 'কোর্স', en: 'Course' },
  EXAM: { bn: 'পরীক্ষা', en: 'Exam' },
  SUGGESTION: { bn: 'সাজেশন', en: 'Suggestion' },
}

/** "ALL" → all scopes; CSV string → the listed scopes (unknown values dropped). */
export function parseCouponScopes(scopes: string | null | undefined): CouponScope[] {
  const raw = (scopes ?? 'ALL').trim().toUpperCase()
  if (!raw || raw === 'ALL') return [...COUPON_SCOPES]
  const parts = raw.split(',').map((s) => s.trim()) as CouponScope[]
  return COUPON_SCOPES.filter((s) => parts.includes(s))
}

/** Admin form selection → stored value: none/all picked = "ALL", else canonical CSV. */
export function normalizeCouponScopes(picked: readonly string[]): string {
  const unique = COUPON_SCOPES.filter((s) => picked.includes(s))
  return unique.length === 0 || unique.length === COUPON_SCOPES.length ? 'ALL' : unique.join(',')
}

export type CouponInput = {
  code: string
  type: string // PERCENT | FIXED
  value: number
  minAmount: number
  maxUses: number | null
  usedCount: number
  expiresAt: Date | null
  isActive: boolean
}

export type CouponResult =
  | { ok: true; coupon: CouponInput; discount: number; finalAmount: number }
  | { ok: false; message: string }

/** Normalize a user-typed coupon code (trim + uppercase). */
export function normalizeCouponCode(code: string | null | undefined): string | null {
  const trimmed = code?.trim().toUpperCase() || ''
  return trimmed ? trimmed.slice(0, 40) : null
}

/**
 * Validate a coupon code against a list amount (BDT). Returns either the
 * computed discount or a bilingual error message ready for `fail()`.
 */
export async function validateCouponForAmount(
  rawCode: string | null | undefined,
  listAmount: number,
  scope?: CouponScope
): Promise<CouponResult> {
  const code = normalizeCouponCode(rawCode)
  if (!code) {
    return { ok: true, coupon: { code: '', type: 'PERCENT', value: 0, minAmount: 0, maxUses: null, usedCount: 0, expiresAt: null, isActive: false }, discount: 0, finalAmount: listAmount }
  }

  const coupon = await db.coupon.findUnique({ where: { code } })
  if (!coupon || !coupon.isActive) {
    return { ok: false, message: 'Invalid or inactive coupon code (কুপন কোড সঠিক নয় বা নিষ্ক্রিয়)' }
  }
  // a coupon scoped to specific purchase types only works for those.
  if (scope && coupon.scopes && coupon.scopes !== 'ALL') {
    const allowed = parseCouponScopes(coupon.scopes)
    if (!allowed.includes(scope)) {
      const en = allowed.map((s) => COUPON_SCOPE_LABELS[s].en).join(' / ')
      const bn = allowed.map((s) => COUPON_SCOPE_LABELS[s].bn).join('/')
      return {
        ok: false,
        message: `This coupon only applies to: ${en} (এই কুপনটি শুধু ${bn} কেনায় প্রযোজ্য)`,
      }
    }
  }
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= Date.now()) {
    return { ok: false, message: 'This coupon has expired (কুপনের মেয়াদ শেষ হয়ে গেছে)' }
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, message: 'Coupon usage limit reached (কুপনের ব্যবহার সীমা শেষ)' }
  }
  if (coupon.minAmount > listAmount) {
    return {
      ok: false,
      message: `This coupon requires a minimum order of ৳${coupon.minAmount} (এই কুপনের জন্য সর্বনিম্ন ৳${coupon.minAmount} প্রয়োজন)`,
    }
  }

  const discount = Math.max(
    0,
    Math.min(
      coupon.type === 'PERCENT' ? Math.round((listAmount * coupon.value) / 100) : Math.min(coupon.value, listAmount),
      listAmount
    )
  )

  return { ok: true, coupon, discount, finalAmount: Math.max(0, listAmount - discount) }
}

/** Increment a coupon's used counter exactly once (guarded call sites only). */
export async function incrementCouponUsedCount(code: string | null | undefined): Promise<void> {
  const normalized = normalizeCouponCode(code)
  if (!normalized) return
  try {
    await db.coupon.update({
      where: { code: normalized },
      data: { usedCount: { increment: 1 } },
    })
  } catch {
    // Coupon may have been deleted while a payment was in flight — never break payment.
  }
}

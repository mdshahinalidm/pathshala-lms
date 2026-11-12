/**
 * combo.ts combo (bundle) offer helpers.
 *
 * ONE shared rule for every SUCCESS transition (sandbox confirm, live
 * gateway callback, admin manual approval): `grantComboAccess` marks the
 * ComboPurchase SUCCESS and instantly grants EVERY item to the student —
 *   COURSE     → Enrollment (course-validity expiry applied, idempotent)
 *   EXAM       → ExamPurchase upserted to SUCCESS (unique userId+examId safe)
 *   SUGGESTION → SuggestionPurchase upserted to SUCCESS
 * so the whole bundle appears in the student's dashboard in one moment.
 *
 * `decorateCombo` resolves ComboItem rows against live records for public
 * display (title/price/availability) and computes originalTotal/savings.
 */
import { db } from '@/lib/db'
import { makeTrxId } from '@/lib/api-helpers'
import { enrollWithValidity } from '@/lib/enrollment'
import { incrementCouponUsedCount } from '@/lib/coupon'

export type ComboItemType = 'COURSE' | 'EXAM' | 'SUGGESTION'

export interface ComboItemView {
  id: string
  itemType: ComboItemType
  refId: string
  title: string
  price: number | null
  isFree: boolean
  available: boolean // live record still exists (deleted items show as unavailable)
}

export interface ComboView {
  id: string
  title: string
  description: string
  price: number
  imageUrl: string | null
  isActive: boolean
  createdAt: string
  items: ComboItemView[]
  originalTotal: number // sum of live paid-item sell prices
  savings: number // originalTotal - price (never negative)
}

/** Effective sell price of a course (discountPrice wins when set). */
function courseSellPrice(price: number, discountPrice: number | null): number {
  return discountPrice != null && discountPrice > 0 ? discountPrice : price
}

/** Turn a Combo (with items) into the public ComboView shape. */
export async function decorateCombo(combo: {
  id: string
  title: string
  description: string
  price: number
  imageUrl: string | null
  isActive: boolean
  createdAt: Date
  items: { id: string; itemType: string; refId: string; titleSnapshot: string; order: number }[]
}): Promise<ComboView> {
  const items: ComboItemView[] = []

  for (const item of combo.items) {
    const type = item.itemType as ComboItemType
    if (type === 'COURSE') {
      const course = await db.course.findUnique({
        where: { id: item.refId },
        select: { title: true, price: true, discountPrice: true, isPublished: true },
      })
      items.push({
        id: item.id,
        itemType: 'COURSE',
        refId: item.refId,
        title: course?.title ?? item.titleSnapshot,
        price: course ? courseSellPrice(course.price, course.discountPrice) : null,
        isFree: course ? courseSellPrice(course.price, course.discountPrice) <= 0 : false,
        available: Boolean(course?.isPublished),
      })
    } else if (type === 'EXAM') {
      const exam = await db.writtenExam.findUnique({
        where: { id: item.refId },
        select: { title: true, price: true, isFree: true, isPublished: true },
      })
      items.push({
        id: item.id,
        itemType: 'EXAM',
        refId: item.refId,
        title: exam?.title ?? item.titleSnapshot,
        price: exam?.price ?? null,
        isFree: Boolean(exam?.isFree),
        available: Boolean(exam?.isPublished),
      })
    } else {
      const sug = await db.suggestion.findUnique({
        where: { id: item.refId },
        select: { title: true, price: true, isFree: true },
      })
      items.push({
        id: item.id,
        itemType: 'SUGGESTION',
        refId: item.refId,
        title: sug?.title ?? item.titleSnapshot,
        price: sug?.price ?? null,
        isFree: Boolean(sug?.isFree),
        available: Boolean(sug),
      })
    }
  }

  const originalTotal = items
    .filter((i) => i.available && !i.isFree && (i.price ?? 0) > 0)
    .reduce((sum, i) => sum + (i.price ?? 0), 0)

  return {
    id: combo.id,
    title: combo.title,
    description: combo.description,
    price: combo.price,
    imageUrl: combo.imageUrl,
    isActive: combo.isActive,
    createdAt: combo.createdAt.toISOString(),
    items,
    originalTotal,
    savings: Math.max(0, originalTotal - combo.price),
  }
}

/**
 * The SINGLE SUCCESS transition for combo purchases — used by the sandbox
 * confirm route, the live gateway callback and the admin approval route.
 * Idempotent: an already-SUCCESS purchase returns immediately.
 */
export async function grantComboAccess(comboPurchaseId: string): Promise<boolean> {
  const purchase = await db.comboPurchase.findUnique({
    where: { id: comboPurchaseId },
    include: {
      combo: { select: { id: true, title: true, items: { orderBy: { order: 'asc' } } } },
    },
  })
  if (!purchase) return false
  if (purchase.status === 'SUCCESS') return true // idempotent
  const wasPending = purchase.status === 'PENDING'

  await db.comboPurchase.update({
    where: { id: purchase.id },
    data: { status: 'SUCCESS', payStatus: 'APPROVED' },
  })

  let courses = 0
  let exams = 0
  let suggestions = 0

  for (const item of purchase.combo.items) {
    try {
      if (item.itemType === 'COURSE') {
        const course = await db.course.findUnique({
          where: { id: item.refId },
          select: { id: true, isLifetime: true, validityMonths: true },
        })
        if (!course) continue
        await enrollWithValidity(purchase.userId, course.id)
        courses++
      } else if (item.itemType === 'EXAM') {
        const exam = await db.writtenExam.findUnique({
          where: { id: item.refId },
          select: { id: true, price: true },
        })
        if (!exam) continue
        await db.examPurchase.upsert({
          where: { userId_examId: { userId: purchase.userId, examId: exam.id } },
          update: {
            status: 'SUCCESS',
            payStatus: 'APPROVED',
            adminNote: `কম্বো: ${purchase.combo.title}`,
          },
          create: {
            userId: purchase.userId,
            examId: exam.id,
            amount: 0,
            listAmount: exam.price ?? 0,
            discount: 0,
            method: 'COMBO',
            status: 'SUCCESS',
            payStatus: 'APPROVED',
            trxId: makeTrxId('PSC'),
            adminNote: `কম্বো: ${purchase.combo.title}`,
          },
        })
        exams++
      } else if (item.itemType === 'SUGGESTION') {
        const sug = await db.suggestion.findUnique({
          where: { id: item.refId },
          select: { id: true, price: true },
        })
        if (!sug) continue
        // SuggestionPurchase has NO unique (userId, suggestionId) constraint,
        // so find-then-update/create instead of upsert (idempotent: an
        // existing SUCCESS row is left untouched).
        const existing = await db.suggestionPurchase.findFirst({
          where: { userId: purchase.userId, suggestionId: sug.id, status: 'SUCCESS' },
          select: { id: true },
        })
        if (!existing) {
          const stale = await db.suggestionPurchase.findFirst({
            where: { userId: purchase.userId, suggestionId: sug.id, status: { not: 'SUCCESS' } },
            select: { id: true },
          })
          const data = {
            amount: 0,
            listAmount: sug.price ?? 0,
            discount: 0,
            method: 'COMBO',
            status: 'SUCCESS',
            payStatus: 'APPROVED',
            adminNote: `কম্বো: ${purchase.combo.title}`,
          }
          if (stale) {
            await db.suggestionPurchase.update({ where: { id: stale.id }, data })
          } else {
            await db.suggestionPurchase.create({
              data: {
                userId: purchase.userId,
                suggestionId: sug.id,
                trxId: makeTrxId('PSC'),
                ...data,
              },
            })
          }
        }
        suggestions++
      }
    } catch {
      // One broken item must never block the rest of the bundle.
    }
  }

  await db.notification.create({
    data: {
      userId: purchase.userId,
      type: 'PAYMENT',
      title: '🎉 কম্বো আনলক হয়েছে',
      body: `অভিনন্দন! "${purchase.combo.title}" কম্বোর সব আইটেম (${courses} কোর্স, ${exams} পরীক্ষা, ${suggestions} সাজেশন) আপনার ড্যাশবোর্ডে যোগ হয়েছে।`,
      link: '/dashboard',
    },
  })

  // Coupon usage counts once, at the SUCCESS transition (guarded inside).
  if (wasPending) await incrementCouponUsedCount(purchase.couponCode)
  return true
}

/** Resolve one admin-submitted item to {refId, titleSnapshot} or null. */
export async function resolveComboItemRef(
  itemType: ComboItemType,
  refId: string
): Promise<{ refId: string; titleSnapshot: string } | null> {
  if (itemType === 'COURSE') {
    const c = await db.course.findUnique({ where: { id: refId }, select: { title: true } })
    return c ? { refId, titleSnapshot: c.title } : null
  }
  if (itemType === 'EXAM') {
    const e = await db.writtenExam.findUnique({ where: { id: refId }, select: { title: true } })
    return e ? { refId, titleSnapshot: e.title } : null
  }
  if (itemType === 'SUGGESTION') {
    const s = await db.suggestion.findUnique({ where: { id: refId }, select: { title: true } })
    return s ? { refId, titleSnapshot: s.title } : null
  }
  return null
}

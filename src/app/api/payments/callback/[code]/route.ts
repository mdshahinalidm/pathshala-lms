/**
 * /api/payments/callback/[code] — LIVE gateway return handler.
 * Each gateway's official "return/callback" contract is implemented:
 *
 *  SSLCommerz → POST/GET val_id (+tran_id) → Order Validation API
 *  bKash      → GET ?paymentID&status  → Execute API (POST paymentID)
 *  CUSTOM_*   → generic: the gateway redirects back to our callback —
 *               an explicit success-like status (or no status at all,
 *               i.e. the gateway only calls the success URL) verifies.
 *
 * On verified SUCCESS: order → SUCCESS (idempotent) + Enrollment upsert
 * (auto-unlock — the course instantly appears in the student's dashboard) +
 * notification — OR — suggestion purchase → SUCCESS + notification (the
 * suggestion instantly appears in the student's My Suggestions). The browser
 * is redirected to #/checkout/<courseId>?paid=… (orders) or
 * #/checkout/suggestion/<suggestionId>?paid=… (purchases).
 */
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { nextInvoiceNo } from '@/lib/invoice'
import { enrollmentExpiryFor } from '@/lib/enrollment'
import { incrementCouponUsedCount } from '@/lib/coupon'
import { grantComboAccess } from '@/lib/combo'

export const runtime = 'nodejs'

interface Ctx {
  params: Promise<{ code: string }>
}

async function finalizeOrder(orderId: string): Promise<boolean> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { course: { select: { title: true } } },
  })
  if (!order) return false
  if (order.status === 'SUCCESS') return true // idempotent

  const invoiceNo = order.invoiceNo || (await nextInvoiceNo())
  await db.order.update({
    where: { id: order.id },
    data: { status: 'SUCCESS', payStatus: 'APPROVED', invoiceNo },
  })
  const courseValidity = await db.course.findUnique({
    where: { id: order.courseId },
    select: { isLifetime: true, validityMonths: true },
  })
  await db.enrollment.upsert({
    where: { userId_courseId: { userId: order.userId, courseId: order.courseId } },
    update: {},
    create: {
      userId: order.userId,
      courseId: order.courseId,
      expiresAt: courseValidity ? enrollmentExpiryFor(courseValidity) : null,
    },
  })
  await db.notification.create({
    data: {
      userId: order.userId,
      type: 'PAYMENT',
      title: '🎉 পেমেন্ট সফল — কোর্স আনলক হয়েছে',
      body: `অভিনন্দন! "${order.course.title}" কোর্সের পেমেন্ট (৳${order.amount}, TrxID ${order.trxId}) নিশ্চিত হয়েছে। ড্যাশবোর্ডে গিয়ে এখনই শেখা শুরু করুন।`,
      link: '/dashboard',
    },
  })
  // count the coupon usage once, at the SUCCESS transition.
  await incrementCouponUsedCount(order.couponCode)
  return true
}

async function finalizePurchase(purchaseId: string): Promise<boolean> {
  const purchase = await db.suggestionPurchase.findUnique({
    where: { id: purchaseId },
    include: { suggestion: { select: { title: true } } },
  })
  if (!purchase) return false
  if (purchase.status === 'SUCCESS') return true // idempotent

  await db.suggestionPurchase.update({
    where: { id: purchase.id },
    data: { status: 'SUCCESS', payStatus: 'APPROVED' },
  })
  await db.notification.create({
    data: {
      userId: purchase.userId,
      type: 'PAYMENT',
      title: '🎉 পেমেন্ট সফল — সাজেশন আনলক হয়েছে',
      body: `অভিনন্দন! "${purchase.suggestion.title}" সাজেশনের পেমেন্ট (৳${purchase.amount}, TrxID ${purchase.trxId}) নিশ্চিত হয়েছে — "আমার সাজেশন" থেকে এখনই ডাউনলোড করুন।`,
      link: '/dashboard/suggestions',
    },
  })
  // count the coupon usage once, at the SUCCESS transition.
  await incrementCouponUsedCount(purchase.couponCode)
  return true
}

async function finalizeExamPurchase(examPurchaseId: string): Promise<boolean> {
  const purchase = await db.examPurchase.findUnique({
    where: { id: examPurchaseId },
    include: { exam: { select: { title: true } } },
  })
  if (!purchase) return false
  if (purchase.status === 'SUCCESS') return true // idempotent

  await db.examPurchase.update({
    where: { id: purchase.id },
    data: { status: 'SUCCESS', payStatus: 'APPROVED' },
  })
  await db.notification.create({
    data: {
      userId: purchase.userId,
      type: 'PAYMENT',
      title: '🎉 পেমেন্ট সফল — পরীক্ষা আনলক হয়েছে',
      body: `অভিনন্দন! "${purchase.exam?.title ?? 'পরীক্ষা'}" পরীক্ষার পেমেন্ট (৳${purchase.amount}, TrxID ${purchase.trxId}) নিশ্চিত হয়েছে — "আমার পরীক্ষা" থেকে এখনই শুরু করুন।`,
      link: '/dashboard/written-exams',
    },
  })
  // count the coupon usage once, at the SUCCESS transition.
  await incrementCouponUsedCount(purchase.couponCode)
  return true
}

function redirectBack(origin: string, courseId: string, trxId: string, okFlag: boolean) {
  // Real path-based redirect (the app is path-routed now) — the checkout
  // page reads ?paid=/?failed= from the query and shows the result screen.
  const url = new URL(`${origin}/checkout/${courseId}`)
  url.searchParams.set(okFlag ? 'paid' : 'failed', encodeURIComponent(trxId))
  return NextResponse.redirect(url.toString(), 302)
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    await ctx.params
    const url = new URL(req.url)
    const q = url.searchParams

    const origin = url.origin
    let verified = false

    const gw = async (code: string) => {
      const g = await db.paymentGateway.findUnique({ where: { code } })
      return { mode: g?.mode ?? 'SANDBOX', cfg: safeCfg(g?.config ?? '{}') as Record<string, string> }
    }

    const code = (await ctx.params).code

    if (code === 'SSLCOMMERZ') {
      const valId = q.get('val_id')
      const { mode, cfg } = await gw('SSLCOMMERZ')
      const base = mode === 'LIVE' ? 'https://securepay.sslcommerz.com' : 'https://sandbox.sslcommerz.com'
      if (valId && cfg.store_id && cfg.store_passwd) {
        const vres = await fetch(
          `${base}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(valId)}&store_id=${encodeURIComponent(cfg.store_id)}&store_passwd=${encodeURIComponent(cfg.store_passwd)}&format=json`
        )
        const vjson = (await vres.json().catch(() => null)) as { status?: string } | null
        verified = vjson?.status === 'VALID' || vjson?.status === 'VALIDATED'
      }
    } else if (code === 'BKASH') {
      const paymentID = q.get('paymentID')
      const status = q.get('status')
      const { mode, cfg } = await gw('BKASH')
      const base = mode === 'LIVE' ? 'https://tokenized.pay.bka.sh/v1.2.0' : 'https://tokenized.sandbox.bka.sh/v1.2.0'
      if (status === 'success' && paymentID && cfg.app_key && cfg.username) {
        const tok = await fetch(`${base}/tokenized/checkout/grant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', username: cfg.username, password: cfg.password ?? '' },
          body: JSON.stringify({ app_key: cfg.app_key, app_secret: cfg.app_secret ?? '' }),
        })
        const tokJson = (await tok.json().catch(() => null)) as { id_token?: string } | null
        if (tokJson?.id_token) {
          const ex = await fetch(`${base}/tokenized/checkout/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: tokJson.id_token,
              'X-App-Key': cfg.app_key,
            },
            body: JSON.stringify({ paymentID }),
          })
          const exJson = (await ex.json().catch(() => null)) as { statusCode?: string } | null
          verified = exJson?.statusCode === '0000'
        }
      }
    } else if (code.startsWith('CUSTOM')) {
      // Generic custom gateway return: many gateways only redirect to the
      // success callback when the payment actually succeeded, so a missing
      // status counts as success; an explicit failed-like status fails.
      const raw = (
        q.get('status') ||
        q.get('payment_status') ||
        q.get('paymentStatus') ||
        q.get('transactionStatus') ||
        q.get('State') ||
        q.get('state') ||
        ''
      )
        .trim()
        .toLowerCase()
      verified =
        raw === '' ||
        ['success', 'successful', 'paid', 'completed', 'complete', 'ok', 'true', '1', 'valid', 'validated', 'authorized'].includes(
          raw
        )
    }

    // ── Suggestion purchase callback (?purchase=&suggestion=) ──
    const purchaseId = q.get('purchase')
    const suggestionId = q.get('suggestion')
    if (purchaseId) {
      let okFlag = false
      if (verified) {
        okFlag = await finalizePurchase(purchaseId)
      } else {
        await db.suggestionPurchase.updateMany({
          where: { id: purchaseId, status: 'PENDING' },
          data: { status: 'FAILED' },
        })
      }
      const purchase = await db.suggestionPurchase.findUnique({
        where: { id: purchaseId },
        select: { trxId: true, suggestionId: true },
      })
      const url2 = new URL(
        `${origin}/checkout/suggestion/${suggestionId || purchase?.suggestionId || ''}`
      )
      url2.searchParams.set(okFlag ? 'paid' : 'failed', encodeURIComponent(purchase?.trxId ?? ''))
      return NextResponse.redirect(url2.toString(), 302)
    }

    // ── Combo purchase callback (?comboPurchase=&combo=) — ──
    const comboPurchaseId = q.get('comboPurchase')
    const comboIdParam = q.get('combo')
    if (comboPurchaseId) {
      let okFlag = false
      if (verified) {
        okFlag = await grantComboAccess(comboPurchaseId) // idempotent SUCCESS + full bundle grant
      } else {
        await db.comboPurchase.updateMany({
          where: { id: comboPurchaseId, status: 'PENDING' },
          data: { status: 'FAILED' },
        })
      }
      const comboPurchase = await db.comboPurchase.findUnique({
        where: { id: comboPurchaseId },
        select: { trxId: true, comboId: true },
      })
      const url2 = new URL(`${origin}/checkout/combo/${comboIdParam || comboPurchase?.comboId || ''}`)
      url2.searchParams.set(okFlag ? 'paid' : 'failed', encodeURIComponent(comboPurchase?.trxId ?? ''))
      return NextResponse.redirect(url2.toString(), 302)
    }

    // ── Written-exam purchase callback (?examPurchase=&exam=) ──
    const examPurchaseId = q.get('examPurchase')
    const examIdParam = q.get('exam')
    if (examPurchaseId) {
      let okFlag = false
      if (verified) {
        okFlag = await finalizeExamPurchase(examPurchaseId)
      } else {
        await db.examPurchase.updateMany({
          where: { id: examPurchaseId, status: 'PENDING' },
          data: { status: 'FAILED' },
        })
      }
      const examPurchase = await db.examPurchase.findUnique({
        where: { id: examPurchaseId },
        select: { trxId: true, examId: true },
      })
      const url2 = new URL(`${origin}/checkout/exam/${examIdParam || examPurchase?.examId || ''}`)
      url2.searchParams.set(okFlag ? 'paid' : 'failed', encodeURIComponent(examPurchase?.trxId ?? ''))
      return NextResponse.redirect(url2.toString(), 302)
    }

    // ── Course order callback (?order=) ──
    const orderId = q.get('order') // our internal order id travels with the request
    if (!orderId) return new NextResponse('Missing order reference', { status: 400 })
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { id: true, courseId: true, trxId: true },
    })
    if (!order) return new NextResponse('Unknown order', { status: 404 })

    let okFlag = false
    if (verified) {
      okFlag = await finalizeOrder(order.id)
    } else {
      await db.order.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'FAILED' } })
    }
    return redirectBack(origin, order.courseId, order.trxId, okFlag)
  } catch (err) {
    console.error('[GET /api/payments/callback]', err)
    return new NextResponse('Callback error', { status: 500 })
  }
}

export async function POST(req: Request, ctx: Ctx) {
  // Some gateways POST the callback (SSLCommerz) — merge form + query.
  try {
    const form = await req.formData().catch(() => null)
    const u = new URL(req.url)
    if (form) {
      for (const [k, v] of form.entries()) {
        if (typeof v === 'string' && !u.searchParams.has(k)) u.searchParams.set(k, v)
      }
    }
    return GET(new Request(u.toString(), { headers: req.headers }), ctx)
  } catch {
    return new NextResponse('Callback error', { status: 500 })
  }
}

function safeCfg(s: string): unknown {
  try {
    return JSON.parse(s || '{}')
  } catch {
    return {}
  }
}

/**
 * POST /api/payments/initiate — start a LIVE gateway payment.
 * Body: { orderId } for a course order · OR · { purchaseId } for a paid
 * suggestion purchase. Both build each gateway's OFFICIAL API payload (per
 * developer docs) and return the redirect URL:
 *   BKASH      → grant token → create → bkashURL
 *   SSLCOMMERZ → session API → GatewayPageURL
 *   CUSTOM_*   → admin-configured custom gateway:
 *                 • payment_url template (placeholders {amount} {orderId}
 *                   {trxId} {invoice} {callback} {name} {phone} {email}
 *                   {course}) → redirect, OR
 *                 • api_url (POST JSON + auth header template) → read the
 *                   checkout URL from the JSON response (configurable field).
 * Errors carry actionable Bangla hints when credentials are missing.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAuth } from '@/lib/api-helpers'
import { originFromHeaders } from '@/lib/site-origin'

export const runtime = 'nodejs'

const schema = z
  .object({
    orderId: z.string().min(1).optional(),
    purchaseId: z.string().min(1).optional(),
    examPurchaseId: z.string().min(1).optional(),
    comboPurchaseId: z.string().min(1).optional(), // combo offers
  })
  .refine(
    (v) =>
      [Boolean(v.orderId), Boolean(v.purchaseId), Boolean(v.examPurchaseId), Boolean(v.comboPurchaseId)].filter(Boolean).length === 1,
    {
      message: 'Provide exactly one of orderId / purchaseId / examPurchaseId / comboPurchaseId',
    }
  )

function cfgOf(json: string): Record<string, string> {
  try {
    const p: unknown = JSON.parse(json || '{}')
    const out: Record<string, string> = {}
    if (p && typeof p === 'object') {
      for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
        out[k] = typeof v === 'string' ? v : String(v ?? '')
      }
    }
    return out
  } catch {
    return {}
  }
}

/** Normalised payment target — everything the gateway builders need. */
interface Intent {
  kind: 'ORDER' | 'PURCHASE' | 'EXAM_PURCHASE' | 'COMBO_PURCHASE'
  refId: string
  /** Suggestion id (PURCHASE only) — for the checkout redirect back. */
  suggestionId?: string
  /** WrittenExam id (EXAM_PURCHASE only) — for the checkout redirect back. */
  examId?: string
  method: string
  amount: string
  trxId: string
  invoiceNo: string | null
  title: string
  user: { name: string; email: string | null; phone: string | null }
  cb: (code: string, extra?: Record<string, string>) => string
  /** Persist gateway-side payment reference (bKash paymentID). */
  storeRef: (ref: string) => Promise<void>
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    // gateway callbacks follow the actual request host, so
    // payments keep working unchanged on ANY deployment domain.
    const base = originFromHeaders(req.headers)
    let intent: Intent

    if (parsed.orderId) {
      const order = await db.order.findUnique({
        where: { id: parsed.orderId },
        include: { course: { select: { id: true, title: true } }, user: { select: { name: true, email: true, phone: true } } },
      })
      if (!order || order.userId !== auth.id) return fail('Order not found.', 404)
      if (order.status !== 'PENDING') return fail('এই অর্ডারটি আর প্রসেস করা যাবে না।', 409)

      intent = {
        kind: 'ORDER',
        refId: order.id,
        method: order.method,
        amount: String(order.amount.toFixed(2)),
        trxId: order.trxId,
        invoiceNo: order.invoiceNo,
        title: order.course.title,
        user: order.user,
        cb: (code, extra = {}) =>
          `${base}/api/payments/callback/${code}?order=${order.id}${new URLSearchParams(extra).toString()}`,
        storeRef: (ref) =>
          db.order.update({ where: { id: order.id }, data: { adminNote: `bkash:${ref}` } }).then(() => undefined),
      }
    } else if (parsed.purchaseId) {
      const purchase = await db.suggestionPurchase.findUnique({
        where: { id: parsed.purchaseId! },
        include: { suggestion: { select: { id: true, title: true } }, user: { select: { name: true, email: true, phone: true } } },
      })
      if (!purchase || purchase.userId !== auth.id) return fail('Purchase not found.', 404)
      if (purchase.status !== 'PENDING') return fail('এই ক্রয়টি আর প্রসেস করা যাবে না।', 409)

      intent = {
        kind: 'PURCHASE',
        refId: purchase.id,
        suggestionId: purchase.suggestion.id,
        method: purchase.method,
        amount: String(purchase.amount.toFixed(2)),
        trxId: purchase.trxId,
        invoiceNo: purchase.invoiceNo,
        title: purchase.suggestion.title,
        user: purchase.user,
        cb: (code, extra = {}) =>
          `${base}/api/payments/callback/${code}?purchase=${purchase.id}&suggestion=${purchase.suggestion.id}${new URLSearchParams(extra).toString()}`,
        storeRef: (ref) =>
          db.suggestionPurchase
            .update({ where: { id: purchase.id }, data: { adminNote: `bkash:${ref}` } })
            .then(() => undefined),
      }
    } else if (parsed.examPurchaseId) {
      const examPurchase = await db.examPurchase.findUnique({
        where: { id: parsed.examPurchaseId },
        include: { exam: { select: { id: true, title: true } }, user: { select: { name: true, email: true, phone: true } } },
      })
      if (!examPurchase || examPurchase.userId !== auth.id) return fail('Purchase not found.', 404)
      if (examPurchase.status !== 'PENDING') return fail('এই ক্রয়টি আর প্রসেস করা যাবে না।', 409)

      intent = {
        kind: 'EXAM_PURCHASE',
        refId: examPurchase.id,
        examId: examPurchase.exam.id,
        method: examPurchase.method,
        amount: String(examPurchase.amount.toFixed(2)),
        trxId: examPurchase.trxId,
        invoiceNo: examPurchase.invoiceNo,
        title: examPurchase.exam.title,
        user: examPurchase.user,
        cb: (code, extra = {}) =>
          `${base}/api/payments/callback/${code}?examPurchase=${examPurchase.id}&exam=${examPurchase.exam.id}${new URLSearchParams(extra).toString()}`,
        storeRef: (ref) =>
          db.examPurchase
            .update({ where: { id: examPurchase.id }, data: { adminNote: `bkash:${ref}` } })
            .then(() => undefined),
      }
    } else {
      // combo purchase — one payment unlocks the whole bundle.
      const comboPurchase = await db.comboPurchase.findUnique({
        where: { id: parsed.comboPurchaseId },
        include: { combo: { select: { id: true, title: true } }, user: { select: { name: true, email: true, phone: true } } },
      })
      if (!comboPurchase || comboPurchase.userId !== auth.id) return fail('Purchase not found.', 404)
      if (comboPurchase.status !== 'PENDING') return fail('এই ক্রয়টি আর প্রসেস করা যাবে না।', 409)

      intent = {
        kind: 'COMBO_PURCHASE',
        refId: comboPurchase.id,
        method: comboPurchase.method,
        amount: String(comboPurchase.amount.toFixed(2)),
        trxId: comboPurchase.trxId,
        invoiceNo: comboPurchase.invoiceNo,
        title: comboPurchase.combo.title,
        user: comboPurchase.user,
        cb: (code, extra = {}) =>
          `${base}/api/payments/callback/${code}?comboPurchase=${comboPurchase.id}&combo=${comboPurchase.combo.id}${new URLSearchParams(extra).toString()}`,
        storeRef: (ref) =>
          db.comboPurchase
            .update({ where: { id: comboPurchase.id }, data: { adminNote: `bkash:${ref}` } })
            .then(() => undefined),
      }
    }

    // The gateway must be LIVE for an official redirect (order + purchase alike).
    const gateway = await db.paymentGateway.findUnique({ where: { code: intent.method } })
    if (!gateway || gateway.mode !== 'LIVE') {
      return fail('এই গেটওয়ে এখন LIVE নয় — SANDBOX মোডে চেষ্টা করুন।', 400)
    }
    const cfg = cfgOf(gateway.config)

    // ───────────── bKash Tokenized Checkout ─────────────
    if (intent.method === 'BKASH') {
      const bBase = 'https://tokenized.pay.bka.sh/v1.2.0'
      if (!cfg.app_key || !cfg.username) {
        return fail('bKash API ক্রেডেনশিয়াল অসম্পূর্ণ — অ্যাডমিন প্যানেলে সেটআপ করুন।', 422)
      }
      const tok = await fetch(`${bBase}/tokenized/checkout/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', username: cfg.username, password: cfg.password ?? '' },
        body: JSON.stringify({ app_key: cfg.app_key, app_secret: cfg.app_secret ?? '' }),
      })
      const tokJson = (await tok.json().catch(() => null)) as { id_token?: string; statusMessage?: string } | null
      if (!tokJson?.id_token) return fail('bKash টোকেন নেওয়া যায়নি — ক্রেডেনশিয়াল যাচাই করুন।', 502)
      const create = await fetch(`${bBase}/tokenized/checkout/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: tokJson.id_token,
          'X-App-Key': cfg.app_key,
        },
        body: JSON.stringify({
          mode: '0011',
          payerReference: intent.user.phone ?? intent.user.email ?? '1',
          callbackURL: intent.cb('BKASH'),
          amount: intent.amount,
          currency: 'BDT',
          intent: 'sale',
          merchantInvoiceNumber: intent.invoiceNo ?? intent.trxId,
        }),
      })
      const cj = (await create.json().catch(() => null)) as { bkashURL?: string; paymentID?: string; statusMessage?: string } | null
      if (!cj?.bkashURL) return fail(cj?.statusMessage || 'bKash পেমেন্ট তৈরি ব্যর্থ হয়েছে।', 502)
      await intent.storeRef(cj.paymentID ?? '')
      return ok({ redirectUrl: cj.bkashURL })
    }

    // ───────────── SSLCommerz Session API ─────────────
    if (intent.method === 'SSLCOMMERZ') {
      const sBase = 'https://securepay.sslcommerz.com'
      if (!cfg.store_id || !cfg.store_passwd) {
        return fail('SSLCommerz ক্রেডেনশিয়াল অসম্পূর্ণ — অ্যাডমিন প্যানেলে সেটআপ করুন।', 422)
      }
      const body = new URLSearchParams({
        store_id: cfg.store_id,
        store_passwd: cfg.store_passwd,
        total_amount: intent.amount,
        currency: cfg.currency || 'BDT',
        tran_id: intent.trxId,
        success_url: intent.cb('SSLCOMMERZ'),
        fail_url: intent.cb('SSLCOMMERZ'),
        cancel_url: intent.cb('SSLCOMMERZ'),
        cus_name: intent.user.name || 'Student',
        cus_email: intent.user.email ?? 'student@pathshala.com',
        cus_phone: intent.user.phone ?? '01700000000',
        cus_add1: 'Dhaka',
        cus_city: 'Dhaka',
        cus_country: 'Bangladesh',
        shipping_method: 'NO',
        num_of_item: '1',
        product_name: intent.title.slice(0, 100),
        product_category: 'Education',
        product_profile: 'general',
      })
      const res = await fetch(`${sBase}/gwprocess/v4/api.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
      const json = (await res.json().catch(() => null)) as { GatewayPageURL?: string; failedreason?: string } | null
      if (!json?.GatewayPageURL) return fail(json?.failedreason || 'SSLCommerz সেশন তৈরি ব্যর্থ হয়েছে।', 502)
      return ok({ redirectUrl: json.GatewayPageURL })
    }

    // ───────────── Custom gateway (admin-configured) ─────────────
    if (gateway.isCustom) {
      // Mode 1 — hosted payment page URL template: substitute placeholders
      // and hand the browser straight to the gateway.
      if (cfg.payment_url && /^https?:\/\//i.test(cfg.payment_url)) {
        const filled = cfg.payment_url
          .replaceAll('{amount}', encodeURIComponent(intent.amount))
          .replaceAll('{orderId}', encodeURIComponent(intent.refId))
          .replaceAll('{trxId}', encodeURIComponent(intent.trxId))
          .replaceAll('{invoice}', encodeURIComponent(intent.invoiceNo ?? intent.trxId))
          .replaceAll('{course}', encodeURIComponent(intent.title.slice(0, 120)))
          .replaceAll('{name}', encodeURIComponent(intent.user.name || 'Student'))
          .replaceAll('{phone}', encodeURIComponent(intent.user.phone ?? ''))
          .replaceAll('{email}', encodeURIComponent(intent.user.email ?? ''))
          .replaceAll('{callback}', encodeURIComponent(intent.cb(intent.method)))
          .replaceAll('{site}', encodeURIComponent(base))
        return ok({ redirectUrl: filled })
      }

      // Mode 2 — generic JSON API: POST our standard payload with the
      // admin-defined auth header, then read the checkout URL from the
      // response field the admin configured (or auto-detect common keys).
      if (cfg.api_url && /^https?:\/\//i.test(cfg.api_url)) {
        if (!cfg.api_key) {
          return fail('কাস্টম গেটওয়ের API কী অসম্পূর্ণ — অ্যাডমিন প্যানেলে সেটআপ করুন।', 422)
        }
        const headerName = cfg.auth_header_name || 'Authorization'
        const headerValue = (cfg.auth_header_value || 'Bearer {api_key}')
          .replaceAll('{api_key}', cfg.api_key ?? '')
          .replaceAll('{api_secret}', cfg.api_secret ?? '')
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          [headerName]: headerValue,
        }
        if (cfg.extra_header_name && cfg.extra_header_value) {
          headers[cfg.extra_header_name] = cfg.extra_header_value
            .replaceAll('{api_key}', cfg.api_key ?? '')
            .replaceAll('{api_secret}', cfg.api_secret ?? '')
        }
        const res = await fetch(cfg.api_url, {
          method: (cfg.api_method || 'POST').toUpperCase(),
          headers,
          body: JSON.stringify({
            amount: Number(intent.amount),
            amountStr: intent.amount,
            currency: cfg.currency || 'BDT',
            orderId: intent.refId,
            trxId: intent.trxId,
            invoiceNo: intent.invoiceNo ?? intent.trxId,
            course: intent.title,
            customer: {
              name: intent.user.name || 'Student',
              phone: intent.user.phone ?? '',
              email: intent.user.email ?? '',
            },
            callbackUrl: intent.cb(intent.method),
            returnUrl: intent.cb(intent.method),
            cancelUrl: intent.cb(intent.method),
            siteUrl: base,
          }),
        })
        const json = (await res.json().catch(() => null)) as unknown
        if (!json || typeof json !== 'object') {
          return fail('কাস্টম গেটওয়ে থেকে সঠিক উত্তর আসেনি।', 502)
        }
        const dig = (obj: unknown, path: string): string | null => {
          let cur: unknown = obj
          for (const seg of path.split('.').filter(Boolean)) {
            if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
              cur = (cur as Record<string, unknown>)[seg]
            } else {
              return null
            }
          }
          return typeof cur === 'string' && /^https?:\/\//i.test(cur) ? cur : null
        }
        const candidates = [
          cfg.response_url_field,
          'url',
          'redirectUrl',
          'redirect_url',
          'checkout_url',
          'checkoutUrl',
          'payment_url',
          'paymentUrl',
          'GatewayPageURL',
          'paymentURL',
          'data.url',
          'data.redirectUrl',
          'data.checkout_url',
        ].filter(Boolean) as string[]
        for (const path of candidates) {
          const found = dig(json, path)
          if (found) return ok({ redirectUrl: found })
        }
        return fail('কাস্টম গেটওয়ের উত্তরে পেমেন্ট URL পাওয়া যায়নি — Response URL Field যাচাই করুন।', 502)
      }

      return fail('কাস্টম গেটওয়ের লাইভ কনফিগারেশন অসম্পূর্ণ — Payment URL বা API এন্ডপয়েন্ট দিন।', 422)
    }

    return fail('এই গেটওয়ের লাইভ ইন্টিগ্রেশন প্রস্তুত নয়।', 400)
  } catch (err) {
    console.error('[POST /api/payments/initiate]', err)
    return fail('Server error', 500)
  }
}

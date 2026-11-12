/**
 * POST /api/written-exams/[id]/purchase — buy a PAID written exam.
 * Flow mirrors suggestion purchases exactly:
 *  • profile 100% complete (server-enforced)
 *  • SANDBOX gateway → client confirms via /api/exam-purchases/[id]/confirm
 *  • MANUAL  → invoice upfront → proof via /api/exam-purchases/[id]/submit
 *  • LIVE    → /api/payments/initiate { examPurchaseId } → gateway callback
 *              marks SUCCESS instantly (exam appears in My Exams)
 * Free exams need no purchase (start directly).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, makeTrxId, ok, parseBody, rateLimit, requireAuth } from '@/lib/api-helpers'
import { nextInvoiceNo } from '@/lib/invoice'
import { isProfileComplete } from '@/lib/student-classes'
import { validateCouponForAmount } from '@/lib/coupon'

export const runtime = 'nodejs'

const schema = z.object({
  method: z.string().min(2).max(40),
  couponCode: z.string().max(40).optional().nullable(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    if (rateLimit(req, 'purchase-exam', 8, 60_000)) {
      return fail('Too many requests — please slow down.', 429)
    }

    const { id } = await params
    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    if (!isProfileComplete(auth)) {
      return fail(
        'প্রোফাইল ১০০% সম্পূর্ণ করুন — তারপর কিনতে পারবেন। (Complete your profile to 100% first.)',
        422
      )
    }

    const exam = await db.writtenExam.findUnique({
      where: { id },
      select: { id: true, title: true, isPublished: true, isFree: true, price: true },
    })
    if (!exam || !exam.isPublished) return fail('Exam not found', 404)
    if (exam.isFree) return fail('এই পরীক্ষাটি ফ্রি — সরাসরি শুরু করুন। (This exam is free — start directly.)', 400)

    const listAmount = Number(exam.price ?? 0)
    if (!(listAmount > 0)) return fail('This exam has no price set.', 400)

    // ExamPurchase has @@unique([userId, examId]) — a PENDING or
    // FAILED row from an earlier attempt used to make `create` throw P2002
    // (HTTP 500 "Server error"). Resume/refresh the existing row instead,
    // exactly like the older /api/exams/[id]/purchase route:
    //   SUCCESS  → 409 (already purchased)
    //   PENDING  → resumed with the freshly chosen method/coupon (refresh-safe)
    //   FAILED   → reset and retried on the same row
    const existing = await db.examPurchase.findUnique({
      where: { userId_examId: { userId: auth.id, examId: id } },
    })
    if (existing?.status === 'SUCCESS') {
      return fail('আপনি ইতিমধ্যে এই পরীক্ষাটি কিনেছেন। (Already purchased.)', 409)
    }

    const gateway = await db.paymentGateway.findUnique({ where: { code: parsed.method } })
    if (!gateway || !gateway.enabled) return fail('এই পেমেন্ট মেথডটি এখন সক্রিয় নয়।', 400)

    // ── Coupon validation & discount snapshot (same rules as course orders) ──
    let discount = 0
    let appliedCouponCode: string | null = null
    if (parsed.couponCode?.trim()) {
      const result = await validateCouponForAmount(parsed.couponCode, listAmount, 'EXAM')
      if (!result.ok) return fail(result.message, 422)
      discount = result.discount
      appliedCouponCode = result.coupon.code
    }
    const amount = Math.max(0, listAmount - discount)

    const invoiceNo = await nextInvoiceNo()

    const purchaseSelect = {
      id: true,
      trxId: true,
      invoiceNo: true,
      amount: true,
      listAmount: true,
      discount: true,
      couponCode: true,
      method: true,
      status: true,
    } as const

    const resumeData = {
      amount,
      listAmount,
      discount,
      couponCode: appliedCouponCode,
      method: parsed.method,
      status: 'PENDING',
      payStatus: 'NONE',
      trxId: makeTrxId('PSE'),
      invoiceNo,
      senderNumber: null,
      submittedTrxId: null,
      submittedAt: null,
      adminNote: null,
    }

    const purchase = existing
      ? await db.examPurchase.update({
          where: { id: existing.id },
          data: resumeData,
          select: purchaseSelect,
        })
      : await db.examPurchase
          .create({
            data: {
              userId: auth.id,
              examId: id,
              ...resumeData,
            },
            select: purchaseSelect,
          })
          // Belt-and-braces: a simultaneous checkout in another tab
          // could win the unique (userId, examId) race — refresh that row
          // instead of leaking a 500 to the student.
          .catch(async (err: unknown) => {
            if (
              typeof err === 'object' &&
              err !== null &&
              'code' in err &&
              (err as { code?: string }).code === 'P2002'
            ) {
              const row = await db.examPurchase.findUnique({
                where: { userId_examId: { userId: auth.id, examId: id } },
              })
              if (row && row.status !== 'SUCCESS') {
                return db.examPurchase.update({
                  where: { id: row.id },
                  data: resumeData,
                  select: purchaseSelect,
                })
              }
            }
            throw err
          })

    return ok({ purchase, listAmount, discount, finalAmount: amount, couponCode: appliedCouponCode })
  } catch (err) {
    console.error('[POST /api/written-exams/[id]/purchase]', err)
    return fail('Server error', 500)
  }
}

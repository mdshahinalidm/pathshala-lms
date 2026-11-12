/**
 * POST /api/quizzes/[id]/purchase — buy a PAID live exam.
 *
 * Flow mirrors paid suggestions:
 *  • profile must be 100% complete (enforced server-side)
 *  • gateway must exist and be enabled; SANDBOX → client confirms via
 *    /api/exam-purchases/[id]/confirm; LIVE → client redirects through
 *    /api/payments/initiate { examPurchaseId }; MANUAL → invoice upfront,
 *    client submits proof via /api/exam-purchases/[id]/submit, admin
 *    approves in the panel
 *  • duplicate ownership (active purchase) is a 409
 *
 * Returns { purchase } (PENDING; SUCCESS only happens on confirm/review).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  fail,
  isResponse,
  makeTrxId,
  ok,
  parseBody,
  rateLimit,
  requireAuth,
} from '@/lib/api-helpers'
import { nextInvoiceNo } from '@/lib/invoice'
import { isProfileComplete } from '@/lib/student-classes'

export const runtime = 'nodejs'

const schema = z.object({
  method: z.string().min(2).max(40),
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

    // ── 100% profile completion is required to buy ──
    if (!isProfileComplete(auth)) {
      return fail(
        'প্রোফাইল ১০০% সম্পূর্ণ করুন — তারপর কিনতে পারবেন। (Complete your profile to 100% first.)',
        422
      )
    }

    const exam = await db.quiz.findUnique({
      where: { id },
      select: { id: true, title: true, type: true, isPublished: true, isFree: true, price: true },
    })
    if (!exam || exam.type !== 'EXAM' || !exam.isPublished) return fail('Exam not found', 404)
    if (exam.isFree) return fail('এই এক্সামটি ফ্রি — সরাসরি অংশ নিন। (This exam is free — join directly.)', 400)

    const amount = Number(exam.price ?? 0)
    if (!(amount > 0)) return fail('এই এক্সামের মূল্য নির্ধারিত নেই। (This exam has no price set.)', 400)

    // Already owned (active purchase)?
    const existing = await db.examPurchase.findFirst({
      where: {
        userId: auth.id,
        quizId: id,
        status: 'SUCCESS',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    })
    if (existing) return fail('আপনি ইতিমধ্যে এই এক্সামটি কিনেছেন। (Already purchased.)', 409)

    // Method must be an ENABLED gateway.
    const gateway = await db.paymentGateway.findUnique({ where: { code: parsed.method } })
    if (!gateway || !gateway.enabled) return fail('এই পেমেন্ট মেথডটি এখন সক্রিয় নয়।', 400)

    const invoiceNo = await nextInvoiceNo()
    const purchase = await db.examPurchase.create({
      data: {
        userId: auth.id,
        quizId: id,
        amount,
        method: gateway.code,
        status: 'PENDING',
        trxId: makeTrxId('PS'),
        invoiceNo,
      },
      select: {
        id: true,
        amount: true,
        method: true,
        status: true,
        trxId: true,
        invoiceNo: true,
        createdAt: true,
      },
    })

    return ok({ purchase, examTitle: exam.title })
  } catch (err) {
    console.error('[POST /api/quizzes/[id]/purchase]', err)
    return fail('Server error', 500)
  }
}

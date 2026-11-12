/**
 * POST /api/exams/[id]/purchase — buy a PAID written exam (spec #4).
 * Mirrors /api/suggestions/[id]/purchase: profile-100% gate, enabled-gateway
 * check, invoice number, PENDING row. Sandbox → client confirms; manual →
 * invoice → admin approves. ExamPurchase has @@unique([userId, examId]) so a
 * PENDING row is RESUMED (checkout refresh-safe), SUCCESS is a 409.
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

    const exam = await db.writtenExam.findUnique({
      where: { id },
      select: { id: true, title: true, price: true },
    })
    if (!exam) return fail('Exam not found', 404)
    if (!(Number(exam.price ?? 0) > 0)) return fail('এই পরীক্ষাটি ফ্রি — সরাসরি শুরু করতে পারেন।', 400)

    const amount = Number(exam.price)

    const existing = await db.examPurchase.findUnique({
      where: { userId_examId: { userId: auth.id, examId: id } },
    })
    if (existing?.status === 'SUCCESS') {
      return fail('আপনি ইতিমধ্যে এই পরীক্ষাটি কিনেছেন। (Already purchased.)', 409)
    }

    // Method must be an ENABLED gateway.
    const gateway = await db.paymentGateway.findUnique({ where: { code: parsed.method } })
    if (!gateway || !gateway.enabled) return fail('এই পেমেন্ট মেথডটি এখন সক্রিয় নয়।', 400)

    if (gateway.mode === 'LIVE' && !gateway.isManual) {
      return fail(
        'লাইভ গেটওয়ে পরীক্ষার জন্য এখনো সক্রিয় নয় — ম্যানুয়াল/স্যান্ডবক্স মেথড ব্যবহার করুন।',
        400
      )
    }

    const invoiceNo = await nextInvoiceNo()

    const purchase = existing
      ? await db.examPurchase.update({
          where: { id: existing.id },
          data: {
            amount,
            method: gateway.code,
            status: 'PENDING',
            payStatus: 'NONE',
            trxId: makeTrxId('PS'),
            invoiceNo,
            senderNumber: null,
            submittedTrxId: null,
            submittedAt: null,
            adminNote: null,
          },
          select: {
            id: true, amount: true, method: true, status: true,
            trxId: true, invoiceNo: true, createdAt: true,
          },
        })
      : await db.examPurchase.create({
          data: {
            userId: auth.id,
            examId: id,
            amount,
            method: gateway.code,
            status: 'PENDING',
            trxId: makeTrxId('PS'),
            invoiceNo,
          },
          select: {
            id: true, amount: true, method: true, status: true,
            trxId: true, invoiceNo: true, createdAt: true,
          },
        })

    return ok({ purchase, examTitle: exam.title })
  } catch (err) {
    console.error('[POST /api/exams/[id]/purchase]', err)
    return fail('Server error', 500)
  }
}

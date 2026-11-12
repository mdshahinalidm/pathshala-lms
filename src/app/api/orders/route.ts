/**
 * GET  /api/orders — own orders (ADMIN + ?scope=all → latest 200 of everyone)
 * POST /api/orders — create a PENDING order for a paid, published course.
 *                    Free courses are rejected (client should use /api/enroll-free).
 *                    Optional couponCode: validated (active, unexpired, under max
 *                    uses, minAmount ≤ listAmount) → discount computed against
 *                    listAmount (the course's current effective price) and the
 *                    snapshot {listAmount, discount, couponCode} is stored.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, makeTrxId, ok, parseBody, rateLimit, requireAuth } from '@/lib/api-helpers'
import { isProfileComplete } from '@/lib/student-classes'
import { nextInvoiceNo } from '@/lib/invoice'
import { ensureGatewaysSeeded } from '@/lib/payment-gateways'
import { validateCouponForAmount } from '@/lib/coupon'

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const scopeAll =
      new URL(req.url).searchParams.get('scope') === 'all' &&
      (auth.role === 'ADMIN' || auth.role === 'MANAGER' || auth.role === 'MODERATOR')

    const orders = await db.order.findMany({
      where: scopeAll ? {} : { userId: auth.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        course: { select: { title: true, thumbnail: true } },
        user: { select: { name: true, email: true } },
      },
    })
    return ok(orders)
  } catch (err) {
    console.error('[GET /api/orders]', err)
    return fail('Server error', 500)
  }
}

const orderCreateSchema = z.object({
  courseId: z.string().min(1),
  // BKASH | SSLCOMMERZ | ROCKET | MANUAL | STRIPE | CUSTOM_*
  method: z.string().min(2).max(30),
  couponCode: z.string().max(40).optional().nullable(),
})

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const limited = rateLimit(req, 'orders-create', 6, 60_000)
    if (limited) return limited

    const parsed = await parseBody(req, orderCreateSchema)
    if (isResponse(parsed)) return parsed

    // ── Gateway guard: the method must be an ENABLED gateway ──
    await ensureGatewaysSeeded()
    const gateway = await db.paymentGateway.findUnique({ where: { code: parsed.method.toUpperCase() } })
    if (!gateway || !gateway.enabled || gateway.mode === 'OFF') {
      return fail('This payment method is currently unavailable.', 400)
    }

    const course = await db.course.findUnique({ where: { id: parsed.courseId } })
    if (!course || !course.isPublished) return fail('Course not found or unavailable', 404)

    const existingEnrollment = await db.enrollment.findUnique({
      where: { userId_courseId: { userId: auth.id, courseId: course.id } },
      select: { id: true },
    })
    if (existingEnrollment) return fail('Already enrolled', 409)

    // Free = price 0 and no non-zero discount (discountPrice is nullable).
    const isFree = course.price === 0 && (course.discountPrice === null || course.discountPrice === 0)
    if (isFree) {
      return fail('This course is free — use the free enrollment endpoint (/api/enroll-free).', 400)
    }

    // ── PAID purchase: 100% profile completion required (server-enforced) ──
    if (!isProfileComplete(auth)) {
      return fail(
        'প্রোফাইল ১০০% সম্পূর্ণ করুন — তারপর কোর্স কিনতে পারবেন। (Complete your profile to 100% first.)',
        422
      )
    }

    // listAmount = the course's current effective price (after its own discount).
    const listAmount = course.discountPrice ?? course.price

    // ── Coupon validation & discount computation (shared rules) ──
    let discount = 0
    let appliedCouponCode: string | null = null

    const requestedCode = parsed.couponCode?.trim().toUpperCase() || null
    if (requestedCode) {
      const result = await validateCouponForAmount(requestedCode, listAmount, 'COURSE')
      if (!result.ok) return fail(result.message, 422)
      discount = result.discount
      appliedCouponCode = result.coupon.code
    }

    const amount = Math.max(0, listAmount - discount)

    // Invoice number is assigned UPFRONT so manual payers can reference it.
    const invoiceNo = await nextInvoiceNo()
    const order = await db.order.create({
      data: {
        userId: auth.id,
        courseId: course.id,
        amount,
        listAmount,
        discount,
        couponCode: appliedCouponCode,
        method: parsed.method.toUpperCase(),
        status: 'PENDING',
        trxId: makeTrxId('PS'),
        invoiceNo,
      },
    })
    return ok({
      order,
      amount,
      courseTitle: course.title,
      listAmount,
      discount,
      finalAmount: amount,
      couponCode: appliedCouponCode,
      invoiceNo,
      gatewayMode: gateway.mode, // LIVE → real redirect flow; SANDBOX → demo screen
    })
  } catch (err) {
    console.error('[POST /api/orders]', err)
    return fail('Server error', 500)
  }
}

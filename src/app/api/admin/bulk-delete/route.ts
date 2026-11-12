/**
 * POST /api/admin/bulk-delete — ONE hardened endpoint for "select → delete"
 * across the whole admin panel.
 *
 * Body: { resource: string, ids: string[] }
 *  - resource must be in the whitelist below (no dynamic table access).
 *  - ids are cuid strings (max 200 per call).
 *  - ADMIN-only + rate limited.
 *  - Self-protection: an admin can never delete their own account.
 *
 * Cascade behaviour comes from the Prisma schema (course → chapters/lessons/
 * enrollments/orders, quiz → questions/attempts, user → enrollments/orders…).
 */
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, rateLimit, requireOwner } from '@/lib/api-helpers'

export const runtime = 'nodejs'

type Delegate = {
  deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<{ count: number }>
}

const RESOURCES: Record<string, () => Delegate> = {
  courses: () => db.course as unknown as Delegate,
  users: () => db.user as unknown as Delegate,
  orders: () => db.order as unknown as Delegate,
  coupons: () => db.coupon as unknown as Delegate,
  notices: () => db.notice as unknown as Delegate,
  categories: () => db.category as unknown as Delegate,
  quizzes: () => db.quiz as unknown as Delegate,
  reviews: () => db.review as unknown as Delegate,
  messages: () => db.contactMessage as unknown as Delegate,
  live: () => db.liveClass as unknown as Delegate,
  suggestions: () => db.suggestion as unknown as Delegate,
  certificates: () => db.certificate as unknown as Delegate,
}

const schema = z.object({
  resource: z.string().min(1).max(40),
  ids: z.array(z.string().min(1).max(64)).min(1).max(200),
})

export async function POST(req: Request) {
  try {
    const admin = await requireOwner(req)
    if (isResponse(admin)) return admin
    if (rateLimit(req, 'bulk-delete', 20, 60_000)) {
      return fail('Too many requests — please slow down.', 429)
    }

    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    const delegateFactory = RESOURCES[parsed.resource]
    if (!delegateFactory) return fail('Unknown resource.', 422)

    // Self-protection: never delete the requesting admin's own account.
    let ids = parsed.ids
    if (parsed.resource === 'users') ids = ids.filter((id) => id !== admin.id)
    if (ids.length === 0) return ok({ deleted: 0 })

    let deleted = 0
    try {
      const result = await delegateFactory().deleteMany({ where: { id: { in: ids } } })
      deleted = result.count
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return fail('কিছু আইটেম পাওয়া যায়নি — লিস্ট রিফ্রেশ করুন।', 404)
      }
      throw e
    }

    return ok({ deleted })
  } catch (err) {
    console.error('[POST /api/admin/bulk-delete]', err)
    return fail('Server error', 500)
  }
}

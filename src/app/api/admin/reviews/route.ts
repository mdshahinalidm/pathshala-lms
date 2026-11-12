/**
 * GET /api/admin/reviews — admin review moderation list.
 * Optional ?status=approved|pending filters on isApproved.
 * Latest 200, newest first, with course + user context.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAdmin } from '@/lib/api-helpers'

const querySchema = z.object({
  status: z.enum(['approved', 'pending']).optional(),
})

/** GET /api/admin/reviews (admin) */
export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const url = new URL(req.url)
    const parsedQuery = querySchema.safeParse({
      status: url.searchParams.get('status') ?? undefined,
    })
    const status = parsedQuery.success ? parsedQuery.data.status : undefined

    const reviews = await db.review.findMany({
      where: status === 'approved' ? { isApproved: true } : status === 'pending' ? { isApproved: false } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        course: { select: { id: true, title: true } },
        user: { select: { name: true, email: true } },
      },
    })

    return ok(reviews)
  } catch (err) {
    console.error('[GET /api/admin/reviews]', err)
    return fail('Server error', 500)
  }
}

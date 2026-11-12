/**
 * PATCH  /api/admin/reviews/[id] — ADMIN approve/unapprove {isApproved:boolean}.
 * DELETE /api/admin/reviews/[id] — ADMIN remove a review permanently.
 * Both 404-guarded; PATCH returns the updated row with course/user include.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAdmin } from '@/lib/api-helpers'

const reviewPatchSchema = z.object({
  isApproved: z.boolean(),
})

const REVIEW_INCLUDE = {
  course: { select: { id: true, title: true } },
  user: { select: { name: true, email: true } },
} as const

// ───────────────────────────────── PATCH ────────────────────────────────

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const parsed = await parseBody(req, reviewPatchSchema)
    if (isResponse(parsed)) return parsed

    const existing = await db.review.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return fail('Review not found', 404)

    const review = await db.review.update({
      where: { id },
      data: { isApproved: parsed.isApproved },
      include: REVIEW_INCLUDE,
    })
    return ok(review)
  } catch (err) {
    console.error('[PATCH /api/admin/reviews/[id]]', err)
    return fail('Server error', 500)
  }
}

// ──────────────────────────────── DELETE ────────────────────────────────

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const existing = await db.review.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return fail('Review not found', 404)

    await db.review.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/reviews/[id]]', err)
    return fail('Server error', 500)
  }
}

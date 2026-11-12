/**
 * DELETE /api/exam-attempts/[id]/images/[imageId] — remove one answer image
 * BEFORE final submission (deadline-enforced, ownership-enforced).
 */
import { rm } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAuth } from '@/lib/api-helpers'

export const runtime = 'nodejs'

const UPLOAD_GRACE_MS = 10_000

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const { id, imageId } = await params
    const attempt = await db.examAttempt.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, deadlineAt: true },
    })
    if (!attempt || attempt.userId !== auth.id) return fail('Attempt not found.', 404)
    if (attempt.status !== 'IN_PROGRESS') return fail('পরীক্ষা জমা হয়েছে — মুছে ফেলা যাবে না।', 409)
    if (Date.now() > attempt.deadlineAt.getTime() + UPLOAD_GRACE_MS) {
      return fail('সময় শেষ। (Time is up.)', 403)
    }

    const img = await db.examAnswerImage.findUnique({ where: { id: imageId }, select: { id: true, attemptId: true, url: true, annotatedUrl: true } })
    if (!img || img.attemptId !== id) return fail('Image not found.', 404)

    await db.examAnswerImage.delete({ where: { id: imageId } })
    // best-effort disk cleanup (original + annotated variant)
    for (const u of [img.url, img.annotatedUrl]) {
      if (u && u.startsWith('/uploads/')) {
        await rm(path.join(process.cwd(), 'public', u), { force: true }).catch(() => {})
      }
    }
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/exam-attempts/[id]/images/[imageId]]', err)
    return fail('Server error', 500)
  }
}

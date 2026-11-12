/**
 * DELETE /api/exams/attempts/[attemptId]/images/[imageId] — remove an answer
 * image BEFORE final submission (spec #9). Owner-only; blocked once the
 * attempt is submitted/expired or past the upload deadline grace.
 * Deletes the disk file + the row.
 */
import { unlink } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAuth } from '@/lib/api-helpers'
import { ANSWER_GRACE_MS } from '@/lib/exam-helpers'

export const runtime = 'nodejs'

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ attemptId: string; imageId: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth
    const { attemptId, imageId } = await params

    const attempt = await db.examAttempt.findUnique({ where: { id: attemptId } })
    if (!attempt || attempt.userId !== auth.id) return fail('Attempt not found.', 404)

    if (attempt.status === 'SUBMITTED') return fail('পরীক্ষা জমা হয়ে গেছে — আর পরিবর্তন করা যাবে না।', 409)
    if (attempt.status === 'EXPIRED') return fail('এই পরীক্ষার সময় শেষ হয়ে গিয়েছিল।', 409)
    if (attempt.status === 'IN_PROGRESS' && Date.now() > attempt.endsAt.getTime() + ANSWER_GRACE_MS) {
      return fail('সময় শেষ — উত্তরপত্র পরিবর্তন করা যাবে না।', 403)
    }

    const image = await db.examAnswerImage.findUnique({ where: { id: imageId } })
    if (!image || image.attemptId !== attemptId) return fail('Image not found.', 404)

    await db.examAnswerImage.delete({ where: { id: imageId } })

    if (image.url.startsWith('/uploads/exam-answers/')) {
      const abs = path.join(process.cwd(), 'public', image.url)
      if (abs.startsWith(path.join(process.cwd(), 'public', 'uploads', 'exam-answers'))) {
        unlink(abs).catch(() => {})
      }
    }
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE attempts/[attemptId]/images/[imageId]]', err)
    return fail('Server error', 500)
  }
}

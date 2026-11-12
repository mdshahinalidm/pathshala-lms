/**
 * DELETE /api/quizzes/[id]/sheets/[sheetId] — remove a wrongly-picked
 * answer-sheet photo while the written-exam attempt is still running
 * Owner-only, only before the server-anchored deadline.
 */
import { unlink } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { ok, fail, requireAuth, isResponse, rateLimit } from '@/lib/api-helpers'
import { attemptEndsAt, EXAM_SUBMIT_GRACE_SEC } from '@/lib/exam-session'

export const runtime = 'nodejs'

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; sheetId: string }> }
) {
  try {
    const { id, sheetId } = await params
    const user = await requireAuth(req)
    if (isResponse(user)) return user

    const limited = rateLimit(req, `sheet-delete:${user.id}`, 60, 60_000)
    if (limited) return limited

    const sheet = await db.quizSheet.findUnique({
      where: { id: sheetId },
      include: { attempt: { include: { quiz: true } } },
    })
    if (!sheet || sheet.attempt.quizId !== id || sheet.attempt.userId !== user.id) {
      return fail('Sheet not found', 404)
    }
    if (sheet.attempt.scriptStatus !== 'IN_PROGRESS' || !sheet.attempt.startedAt) {
      return fail('এই অ্যাটেম্পটে আর পরিবর্তন করা যাবে না। (This attempt is closed.)', 409)
    }
    const endsAt = attemptEndsAt(sheet.attempt.startedAt, sheet.attempt.quiz.durationMin)
    if (Date.now() > endsAt.getTime() + EXAM_SUBMIT_GRACE_SEC * 1000) {
      return fail('সময় শেষ। (Time is up.)', 403, { code: 'EXAM_ENDED' })
    }

    await db.quizSheet.delete({ where: { id: sheet.id } })

    // Best-effort disk cleanup (the file may already be gone — ignore).
    if (sheet.imageUrl.startsWith('/uploads/')) {
      void unlink(path.join(process.cwd(), 'public', sheet.imageUrl)).catch(() => {})
    }

    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/quizzes/[id]/sheets/[sheetId]]', err)
    return fail('Server error', 500)
  }
}

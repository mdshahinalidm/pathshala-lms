/**
 * POST /api/quizzes/[id]/sheets — upload ONE answer-sheet photo (multipart)
 * into the student's running written-exam attempt.
 *
 * Rules (explicit user requirements):
 *  • IMAGES ONLY (JPG/PNG/WEBP/GIF/HEIC …)
 *  • NO size limit — every phone shoots at a different size, any size uploads
 *  • only while the server-anchored countdown is alive (grace window honored)
 *
 * Body (multipart/form-data): attemptId (string), image (File)
 * → { ok, data: { sheet: { id, imageUrl, order } } }
 */
import { db } from '@/lib/db'
import { ok, fail, requireAuth, isResponse, rateLimit } from '@/lib/api-helpers'
import { attemptEndsAt, effectiveDurationMin, saveSheetImage, EXAM_SUBMIT_GRACE_SEC } from '@/lib/exam-session'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireAuth(req)
    if (isResponse(user)) return user

    const limited = rateLimit(req, `sheet-upload:${user.id}`, 120, 60_000)
    if (limited) return limited

    const form = await req.formData().catch(() => null)
    if (!form) return fail('মাল্টিপার্ট ফর্ম ডেটা প্রয়োজন। (Multipart form data required.)', 400)

    const attemptId = String(form.get('attemptId') || '')
    const file = form.get('image')
    if (!attemptId) return fail('অ্যাটেম্পট আইডি প্রয়োজন। (Attempt id required.)', 422)
    if (!(file instanceof File)) return fail('ছবি পাওয়া যায়নি। (No image received.)', 400)
    if (file.size === 0) return fail('ছবিটি খালি। (The image is empty.)', 422)

    const mime = (file.type || '').toLowerCase()
    if (!mime.startsWith('image/')) {
      return fail(
        'শুধুমাত্র ছবি (JPG/PNG/WEBP) আপলোড করা যাবে। (Images only — JPG/PNG/WEBP.)',
        422
      )
    }
    // NO size cap on purpose — any size image uploads.

    const attempt = await db.quizAttempt.findUnique({
      where: { id: attemptId },
      include: { quiz: true, subject: true, sheets: { select: { id: true } } },
    })
    if (!attempt || attempt.userId !== user.id || attempt.quizId !== id) {
      return fail('অ্যাটেম্পট পাওয়া যায়নি। (Attempt not found.)', 404)
    }
    if (attempt.scriptStatus !== 'IN_PROGRESS' || !attempt.startedAt) {
      return fail('এই অ্যাটেম্পটে আর আপলোড করা যাবে না। (This attempt is no longer open.)', 409)
    }
    const endsAt = attemptEndsAt(
      attempt.startedAt,
      effectiveDurationMin(attempt.quiz, attempt.subject)
    )
    if (Date.now() > endsAt.getTime() + EXAM_SUBMIT_GRACE_SEC * 1000) {
      return fail('সময় শেষ — আর ছবি আপলোড করা যাবে না। (Time is up — uploading is closed.)', 403, {
        code: 'EXAM_ENDED',
      })
    }

    const imageUrl = await saveSheetImage(file)
    const sheet = await db.quizSheet.create({
      data: {
        attemptId: attempt.id,
        imageUrl,
        order: attempt.sheets.length,
      },
    })

    return ok({ sheet: { id: sheet.id, imageUrl: sheet.imageUrl, order: sheet.order } })
  } catch (err) {
    console.error('[POST /api/quizzes/[id]/sheets]', err)
    return fail('Server error', 500)
  }
}

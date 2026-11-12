/**
 * /api/admin/exam-submissions/[submissionId] — Result Center detail + marking.
 *
 * GET    — full submission: student profile header, exam context, ordered
 *          answer images WITH their annotation stroke layers (panel only).
 * PATCH  — three actions (MANAGER/ADMIN only — moderators are view-only):
 *          { obtainedMarks?, feedback?, action? }:
 *            • marks save        → reviewStatus MARKED (UNDER_REVIEW → MARKED)
 *            • action UNDER_REVIEW
 *            • action PUBLISH    → reviewStatus PUBLISHED + student notification
 *          { imageId, strokes } → save/reset the annotation layer of one
 *          answer image (original file is NEVER touched — overlay JSON only)
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAdmin, requireManager, sanitize } from '@/lib/api-helpers'

export const runtime = 'nodejs'

const patchSchema = z.object({
  obtainedMarks: z.number().min(0).max(1000).optional(),
  feedback: z.string().max(4000).optional(),
  action: z.enum(['UNDER_REVIEW', 'MARKED', 'PUBLISH']).optional(),
  imageId: z.string().max(64).optional(),
  strokes: z.string().max(300_000).optional(), // JSON string of the overlay layer
})

async function loadSubmission(id: string) {
  return db.examSubmission.findUnique({
    where: { id },
    include: {
      attempt: { select: { id: true, startedAt: true, endsAt: true, submittedAt: true, isAutoSubmitted: true } },
      exam: {
        select: {
          id: true, title: true, totalMarks: true,
          course: { select: { id: true, title: true } },
          category: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true, nameEn: true } },
        },
      },
      user: {
        select: {
          id: true, name: true, email: true, phone: true,
          avatarUrl: true, studentClass: true, institution: true,
        },
      },
    },
  })
}

export async function GET(req: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin
    const { submissionId } = await params

    const submission = await loadSubmission(submissionId)
    if (!submission) return fail('Submission not found.', 404)

    const images = await db.examAnswerImage.findMany({
      where: { attemptId: submission.attempt.id },
      orderBy: { order: 'asc' },
      select: {
        id: true, url: true, originalName: true, mime: true, size: true,
        order: true, strokes: true, annotatedAt: true, createdAt: true,
      },
    })

    return ok({
      submission: {
        id: submission.id,
        submittedAt: submission.submittedAt,
        publishedAt: submission.publishedAt,
        markedAt: submission.markedAt,
        reviewStatus: submission.reviewStatus,
        obtainedMarks: submission.obtainedMarks,
        feedback: submission.feedback,
        totalMarks: submission.exam.totalMarks,
      },
      attempt: submission.attempt,
      exam: submission.exam,
      student: submission.user,
      images: images.map((img) => ({
        ...img,
        strokes: safeStrokes(img.strokes),
        hasAnnotation: img.annotatedAt != null,
      })),
    })
  } catch (err) {
    console.error('[GET /api/admin/exam-submissions/[submissionId]]', err)
    return fail('Server error', 500)
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin
    const { submissionId } = await params
    const parsed = await parseBody(req, patchSchema)
    if (isResponse(parsed)) return parsed

    const submission = await loadSubmission(submissionId)
    if (!submission) return fail('Submission not found.', 404)

    // ── annotation layer save (per image) ──
    if (parsed.imageId) {
      if (typeof parsed.strokes !== 'string') return fail('Strokes payload required.', 422)
      const image = await db.examAnswerImage.findUnique({
        where: { id: parsed.imageId },
        select: { id: true, attemptId: true },
      })
      if (!image || image.attemptId !== submission.attempt.id) return fail('Image not found.', 404)
      await db.examAnswerImage.update({
        where: { id: parsed.imageId },
        data: { strokes: parsed.strokes, annotatedAt: new Date(), annotatedBy: admin.email ?? '' },
      })
      return ok({ annotated: true })
    }

    // ── marks / feedback / lifecycle ──
    const data: Record<string, unknown> = { markedByEmail: admin.email ?? '' }
    let marksChanged = false

    if (parsed.obtainedMarks !== undefined) {
      if (parsed.obtainedMarks > submission.exam.totalMarks) {
        return fail(`প্রাপ্ত নম্বর মোট নম্বরের (${submission.exam.totalMarks}) বেশি হতে পারে না।`, 422)
      }
      data.obtainedMarks = parsed.obtainedMarks
      marksChanged = true
    }
    if (parsed.feedback !== undefined) {
      data.feedback = parsed.feedback.trim() ? sanitize(parsed.feedback, 4000) : null
      marksChanged = true
    }
    if (marksChanged && !parsed.action) data.reviewStatus = 'MARKED'
    if (parsed.action === 'UNDER_REVIEW') data.reviewStatus = 'UNDER_REVIEW'
    if (parsed.action === 'MARKED') data.reviewStatus = 'MARKED'
    if (parsed.action === 'PUBLISH') {
      if (parsed.obtainedMarks === undefined && submission.obtainedMarks == null) {
        return fail('রেজাল্ট প্রকাশের আগে প্রাপ্ত নম্বর দিন।', 422)
      }
      data.reviewStatus = 'PUBLISHED'
      data.publishedAt = new Date()
    }
    data.markedAt = new Date()

    const updated = await db.examSubmission.update({
      where: { id: submission.id },
      data,
    })

    if (parsed.action === 'PUBLISH') {
      await db.notification.create({
        data: {
          userId: submission.userId,
          type: 'EXAM',
          title: '📝 রেজাল্ট প্রকাশিত হয়েছে',
          body: `"${submission.exam.title}" পরীক্ষার রেজাল্ট প্রকাশিত হয়েছে — আপনার প্রাপ্ত নম্বর: ${updated.obtainedMarks}/${submission.exam.totalMarks}। মূল্যায়িত উত্তরপত্র দেখুন।`,
          link: `/dashboard/results/${updated.id}`,
        },
      })
    }

    return ok({
      submission: {
        id: updated.id,
        reviewStatus: updated.reviewStatus,
        obtainedMarks: updated.obtainedMarks,
        feedback: updated.feedback,
        publishedAt: updated.publishedAt,
      },
    })
  } catch (err) {
    console.error('[PATCH /api/admin/exam-submissions/[submissionId]]', err)
    return fail('Server error', 500)
  }
}

function safeStrokes(json: string): unknown[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

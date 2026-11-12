/**
 * GET /api/exams/[id]/question-file — PROTECTED question media delivery.
 * Free exams: any signed-in-or-not viewer of a visible exam.
 * Paid exams: only buyers (SUCCESS purchase) / panel roles. The public
 * /uploads URL of question files is never handed to unauthorized students —
 * they stream through this gate instead (Cache-Control: private).
 *
 *   ?pdf=1     → the question PDF (inline, browser viewer)
 *   ?index=N   → the Nth question image
 */
import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fail, getAuthUser } from '@/lib/api-helpers'
import { isPanelRole } from '@/lib/roles'
import { examVisibleNow, hasExamAccess } from '@/lib/exam-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const url = new URL(req.url)
    const wantPdf = url.searchParams.get('pdf') === '1'
    const indexParam = url.searchParams.get('index')

    const auth = await getAuthUser(req)
    const isPanel = Boolean(auth && isPanelRole(auth.role))

    const exam = await db.writtenExam.findUnique({
      where: { id },
      select: {
        id: true,
        price: true,
        isPublished: true,
        publishAt: true,
        questionPdfUrl: true,
        questionImages: true,
      },
    })
    if (!exam) return fail('Exam not found', 404)
    if (!isPanel && !examVisibleNow(exam)) return fail('Exam not found', 404)

    if (!isPanel) {
      if (!auth) return fail('প্রশ্ন দেখতে লগইন করুন।', 401)
      if (!(await hasExamAccess(auth.id, exam))) {
        return fail('এই পরীক্ষার প্রশ্ন দেখতে হলে আগে কিনতে হবে।', 403)
      }
    }

    // resolve the stored /uploads/... URL
    let fileUrl: string | null = null
    if (wantPdf) {
      fileUrl = exam.questionPdfUrl
    } else {
      const idx = Number(indexParam)
      if (!Number.isInteger(idx) || idx < 0) return fail('Invalid index', 400)
      let images: string[] = []
      try {
        const arr = JSON.parse(exam.questionImages)
        if (Array.isArray(arr)) images = arr.filter((x) => typeof x === 'string')
      } catch {
        images = []
      }
      if (idx >= images.length) return fail('Question image not found', 404)
      fileUrl = images[idx]
    }
    if (!fileUrl) return fail('Question media not found', 404)

    // path-safety: only serve files that live inside public/uploads/
    if (!fileUrl.startsWith('/uploads/') || fileUrl.includes('..')) {
      return fail('Invalid media path', 400)
    }
    const abs = path.join(process.cwd(), 'public', fileUrl)
    if (!abs.startsWith(path.join(process.cwd(), 'public', 'uploads'))) {
      return fail('Invalid media path', 400)
    }

    try {
      const buf = await readFile(abs)
      const ext = (fileUrl.split('.').pop() ?? '').toLowerCase()
      const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream'
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(buf.length),
          'Content-Disposition': `inline; filename="question.${ext === 'pdf' ? 'pdf' : ext}"`,
          'Cache-Control': 'private, max-age=60',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch {
      return fail('File missing on disk', 404)
    }
  } catch (err) {
    console.error('[GET /api/exams/[id]/question-file]', err)
    return fail('Server error', 500)
  }
}

/**
 * GET /api/written-exams/[id]/question-file?url=/uploads/... — GATED question
 * media streaming for PAID exams (ownership enforced server-side). Free exams
 * render their media directly (already public URLs). This route exists so a
 * paid exam's question PDF/images can be fetched by the owner student without
 * exposing the static path to non-owners in the app UI.
 */
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { fail, getAuthUser, isResponse } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req)
    if (!auth) return fail('Login required.', 401)
    if (isResponse(auth)) return auth

    const { id } = await params
    const searchParams = new URL(req.url).searchParams
    const url = searchParams.get('url') ?? ''
    // (additive): `&download=1` → Content-Disposition: attachment so the
    // questions dialog can auto-download in place; default stays inline.
    const download = searchParams.get('download') === '1'
    if (!url.startsWith('/uploads/') || url.includes('..')) return fail('Invalid file.', 400)

    const exam = await db.writtenExam.findUnique({
      where: { id },
      select: { isFree: true, questionPdfUrl: true, questionImages: true },
    })
    if (!exam) return fail('Exam not found.', 404)

    // ownership check for paid exams
    if (!exam.isFree) {
      const owned = await db.examPurchase.findFirst({
        where: { userId: auth.id, examId: id, status: 'SUCCESS' },
        select: { id: true },
      })
      if (!owned) return fail('এই পরীক্ষাটি আপনার কেনা নেই। (You have not purchased this exam.)', 403)
    }

    // the requested file must belong to this exam
    const allowed = [exam.questionPdfUrl, ...safeImages(exam.questionImages).map((i) => i.url)]
    if (!allowed.includes(url)) return fail('File not part of this exam.', 403)

    const abs = path.join(process.cwd(), 'public', url)
    const st = await stat(abs).catch(() => null)
    if (!st || !st.isFile()) return fail('File missing.', 404)

    const ext = path.extname(abs).toLowerCase()
    const headers: Record<string, string> = {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Length': String(st.size),
      'Cache-Control': 'private, max-age=60',
    }
    if (download) headers['Content-Disposition'] = attachmentDisposition(abs)
    const stream = createReadStream(abs) as unknown as ReadableStream
    return new Response(stream, { status: 200, headers })
  } catch (err) {
    console.error('[GET /api/written-exams/[id]/question-file]', err)
    return fail('Server error', 500)
  }
}

/** `attachment; filename="<ascii-safe basename>"; filename*=UTF-8''<encoded>` */
function attachmentDisposition(abs: string): string {
  const base = path.basename(abs)
  const ascii = base.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'question'
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base)}`
}

function safeImages(raw: string): { url: string }[] {
  try {
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

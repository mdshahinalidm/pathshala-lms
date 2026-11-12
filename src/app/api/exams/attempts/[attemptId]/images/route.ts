/**
 * /api/exams/attempts/[attemptId]/images — student answer-sheet photos.
 *
 * GET  — list this attempt's images (owner only, ordered).
 * POST — upload ONE answer image (owner only):
 *        • JPG / PNG / WEBP only — magic-byte sniffed (mime never trusted)
 *        • NO dimension/resolution restriction (spec #8) — only a 40 MB
 *          per-image safety cap against abuse; originals preserved as-is
 *        • deadline enforced SERVER-side: uploads stop at endsAt + grace
 *        • streamed to disk with busboy (constant memory for big photos)
 */
import { createWriteStream } from 'fs'
import { mkdir, rm, unlink } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import type { ReadableStream as WebReadableStream } from 'stream/web'
import busboy from 'busboy'
import { db } from '@/lib/db'
import { fail, isResponse, ok, rateLimit, requireAuth } from '@/lib/api-helpers'
import { ANSWER_GRACE_MS, ANSWER_IMAGE_MAX_BYTES, sniffImage } from '@/lib/exam-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth
    const { attemptId } = await params

    const attempt = await db.examAttempt.findUnique({ where: { id: attemptId }, select: { id: true, userId: true } })
    if (!attempt || attempt.userId !== auth.id) return fail('Attempt not found.', 404)

    const images = await db.examAnswerImage.findMany({
      where: { attemptId },
      orderBy: { order: 'asc' },
      select: { id: true, url: true, originalName: true, mime: true, size: true, order: true, createdAt: true },
    })
    return ok({ images })
  } catch (err) {
    console.error('[GET attempts/[attemptId]/images]', err)
    return fail('Server error', 500)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  let absPath: string | null = null
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth
    if (rateLimit(req, 'answer-upload', 40, 60_000)) {
      return fail('Too many uploads — please slow down.', 429)
    }
    const { attemptId } = await params

    const attempt = await db.examAttempt.findUnique({ where: { id: attemptId } })
    if (!attempt || attempt.userId !== auth.id) return fail('Attempt not found.', 404)

    // ownership + lifecycle
    if (attempt.status === 'SUBMITTED') return fail('পরীক্ষা ইতিমধ্যে জমা হয়ে গেছে — আর পরিবর্তন করা যাবে না।', 409)
    if (attempt.status === 'EXPIRED') return fail('এই পরীক্ষার সময় শেষ হয়ে গিয়েছিল।', 409)
    if (attempt.status === 'IN_PROGRESS' && Date.now() > attempt.endsAt.getTime() + ANSWER_GRACE_MS) {
      return fail('সময় শেষ — আর নতুন উত্তরপত্র আপলোড করা যাবে না।', 403)
    }

    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return fail('Expected multipart/form-data upload.', 400)
    }
    if (!req.body) return fail('Empty upload body.', 400)

    const bb = busboy({
      headers: { 'content-type': contentType },
      limits: { files: 1, fileSize: ANSWER_IMAGE_MAX_BYTES, fields: 10, fieldSize: 32 * 1024 },
    })

    const st: {
      saved: { absPath: string; originalName: string; mime: string; size: number; head: Buffer } | null
    } = { saved: null }
    let writeDone: Promise<void> = Promise.resolve()
    let tooLarge = false
    let parseError: Error | null = null

    const done = new Promise<void>((resolve, reject) => {
      bb.on('file', (_name, stream, info) => {
        if (st.saved) {
          stream.resume()
          return
        }
        const originalName = (info.filename || 'photo.jpg').slice(0, 180)
        const mime = typeof info.mimeType === 'string' ? info.mimeType : ''

        const now = new Date()
        const folder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const relDir = `uploads/exam-answers/${folder}`
        const absDir = path.join(process.cwd(), 'public', relDir)
        const tail = `${randomUUID()}.bin` // extension fixed after magic-byte sniffing
        const target = path.join(absDir, tail)
        absPath = target

        let size = 0
        let head = Buffer.alloc(0)
        // count bytes + capture the first 12 for magic-byte sniffing
        const counter = new Transform({
          transform(chunk: Buffer, _enc, cb) {
            size += chunk.length
            if (head.length < 12) head = Buffer.concat([head, chunk.subarray(0, 12 - head.length)])
            cb(null, chunk)
          },
        })
        stream.on('limit', () => {
          tooLarge = true
        })

        writeDone = mkdir(absDir, { recursive: true })
          .then(() => pipeline(stream, counter, createWriteStream(target)))
          .then(() => {
            st.saved = { absPath: target, originalName, mime, size, head }
          })
          .catch((err) => {
            parseError = err instanceof Error ? err : new Error(String(err))
          })
      })
      bb.on('error', (err) => reject(err instanceof Error ? err : new Error(String(err))))
      bb.on('close', () => {
        void writeDone.then(
          () => resolve(),
          () => resolve()
        )
      })
    })
    done.catch(() => {})

    await pipeline(Readable.fromWeb(req.body as unknown as WebReadableStream), bb)
    await done
    await writeDone

    if (tooLarge) {
      if (absPath) await rm(absPath, { force: true })
      return fail('ছবিটি খুব বড় — একটি ছবি সর্বোচ্চ 40MB।', 413)
    }
    if (parseError) throw parseError
    const saved = st.saved
    if (!saved) return fail('No file received.', 422)
    if (saved.size === 0) {
      await rm(saved.absPath, { force: true })
      return fail('No file received.', 422)
    }

    const ext = sniffImage(saved.head)
    if (!ext) {
      await rm(saved.absPath, { force: true })
      return fail('শুধুমাত্র JPG / PNG / WebP ছবি গ্রহণ করা হয়।', 415)
    }

    // rename to the sniffed extension (content-true)
    const finalPath = saved.absPath.replace(/\.bin$/, `.${ext}`)
    try {
      const { rename } = await import('fs/promises')
      await rename(saved.absPath, finalPath)
    } catch {
      await rm(saved.absPath, { force: true })
      return fail('Server error', 500)
    }
    absPath = finalPath

    const url =
      '/' +
      path.relative(path.join(process.cwd(), 'public'), finalPath).split(path.sep).join('/')

    const maxOrder = await db.examAnswerImage.aggregate({
      where: { attemptId },
      _max: { order: true },
    })
    const order = (maxOrder._max.order ?? 0) + 1

    const image = await db.examAnswerImage.create({
      data: {
        attemptId,
        url,
        originalName: saved.originalName,
        mime: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`,
        size: saved.size,
        order,
      },
      select: { id: true, url: true, originalName: true, mime: true, size: true, order: true, createdAt: true },
    })
    return ok({ image })
  } catch (err) {
    if (absPath) await unlink(absPath).catch(() => {})
    console.error('[POST attempts/[attemptId]/images]', err)
    return fail('Server error', 500)
  }
}

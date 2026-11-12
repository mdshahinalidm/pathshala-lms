/**
 * POST /api/exam-attempts/[id]/images — upload ONE answer-sheet image.
 *
 * Requirements implemented here:
 *  • JPG/JPEG/PNG/WEBP only (MIME + extension validated)
 *  • NO image dimension/resolution restriction — any camera photo uploads
 *  • streamed to disk (busboy) — the file never sits in RAM
 *  • infra safety cap 30MB/image, max 60 images/attempt
 *  • SERVER-SIDE DEADLINE ENFORCEMENT: rejected after deadline+grace
 *  • ownership enforced (IDOR-safe)
 */
import { createWriteStream } from 'fs'
import { mkdir, rm } from 'fs/promises'
import path from 'path'
import { randomBytes } from 'crypto'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import type { ReadableStream as WebReadableStream } from 'stream/web'
import busboy from 'busboy'
import { db } from '@/lib/db'
import { fail, isResponse, ok, rateLimit, requireAuth } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 30 * 1024 * 1024 // 30MB — far above any phone camera photo
const MAX_IMAGES = 60
const UPLOAD_GRACE_MS = 10_000

const OK_MIME = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let absPath: string | null = null
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth
    if (rateLimit(req, 'exam-img', 60, 60_000)) return fail('Too many uploads — slow down.', 429)

    const { id } = await params
    const attempt = await db.examAttempt.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, deadlineAt: true },
    })
    if (!attempt || attempt.userId !== auth.id) return fail('Attempt not found.', 404)
    if (attempt.status !== 'IN_PROGRESS') {
      return fail('পরীক্ষা জমা হয়ে গেছে — আর আপলোড করা যাবে না। (Exam already submitted.)', 409)
    }
    if (Date.now() > attempt.deadlineAt.getTime() + UPLOAD_GRACE_MS) {
      return fail('সময় শেষ — আপলোড বন্ধ। (Time is up — uploads closed.)', 403)
    }

    const count = await db.examAnswerImage.count({ where: { attemptId: id } })
    if (count >= MAX_IMAGES) return fail(`সর্বোচ্চ ${MAX_IMAGES}টি ছবি জমা দেওয়া যাবে।`, 413)

    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return fail('Expected multipart/form-data upload.', 400)
    }
    if (!req.body) return fail('Empty upload body.', 400)

    const bb = busboy({
      headers: { 'content-type': contentType },
      limits: { files: 1, fileSize: MAX_BYTES, fields: 4, fieldSize: 64 * 1024 },
    })

    const st: { saved: { absPath: string; filename: string; originalName: string; mime: string; size: number } | null } = { saved: null }
    let writeDone: Promise<void> = Promise.resolve()
    let tooLarge = false
    let parseError: Error | null = null
    let badType = false

    const done = new Promise<void>((resolve, reject) => {
      bb.on('file', (_name, stream, info) => {
        if (st.saved) { stream.resume(); return }
        const originalName = (info.filename || 'answer.jpg').slice(0, 180)
        const mime = (typeof info.mimeType === 'string' ? info.mimeType : '').toLowerCase()
        const ext = extOf(originalName, mime)
        if (!OK_MIME.includes(mime) || !ext) { badType = true; stream.resume(); return }

        const now = new Date()
        const folder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const relDir = `uploads/exam-answers/${folder}`
        const absDir = path.join(process.cwd(), 'public', relDir)
        const tail = `${randomBytes(6).toString('hex')}.${ext}`
        const target = path.join(absDir, tail)
        absPath = target

        let size = 0
        const counter = new Transform({
          transform(chunk: Buffer, _enc, cb) { size += chunk.length; cb(null, chunk) },
        })
        stream.on('limit', () => { tooLarge = true })
        writeDone = mkdir(absDir, { recursive: true })
          .then(() => pipeline(stream, counter, createWriteStream(target)))
          .then(() => { st.saved = { absPath: target, filename: tail, originalName, mime, size } })
          .catch((err) => { parseError = err instanceof Error ? err : new Error(String(err)) })
      })
      bb.on('error', (err) => reject(err instanceof Error ? err : new Error(String(err))))
      bb.on('close', () => { void writeDone.then(() => resolve(), () => resolve()) })
    })
    done.catch(() => {})

    await pipeline(Readable.fromWeb(req.body as unknown as WebReadableStream), bb)
    await done
    await writeDone

    if (tooLarge) {
      if (absPath) await rm(absPath, { force: true })
      return fail('ছবিটি খুব বড় — সর্বোচ্চ 30MB।', 413)
    }
    if (badType) return fail('শুধু JPG/JPEG/PNG/WEBP আপলোড করা যাবে। (Only JPG/JPEG/PNG/WEBP images are allowed.)', 415)
    if (parseError) throw parseError
    const saved = st.saved
    if (!saved || saved.size === 0) {
      if (saved) await rm(saved.absPath, { force: true })
      return fail('No image received.', 422)
    }

    const url = '/' + path.relative(path.join(process.cwd(), 'public'), saved.absPath).split(path.sep).join('/')
    const img = await db.examAnswerImage.create({
      data: {
        attemptId: id,
        order: count,
        url,
        fileName: saved.originalName,
        mimeType: saved.mime,
        fileSize: saved.size,
      },
      select: { id: true, order: true, url: true, fileName: true, fileSize: true },
    })
    return ok({ image: img }, 201)
  } catch (err) {
    if (absPath) await rm(absPath, { force: true }).catch(() => {})
    console.error('[POST /api/exam-attempts/[id]/images]', err)
    return fail('Server error', 500)
  }
}

function extOf(name: string, mime: string): string | null {
  const tail = (name.split('.').pop() ?? '').toLowerCase()
  if (tail === 'jpg' || tail === 'jpeg') return 'jpg'
  if (tail === 'png') return 'png'
  if (tail === 'webp') return 'webp'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return null
}

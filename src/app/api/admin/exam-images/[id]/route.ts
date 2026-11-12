/**
 * PUT /api/admin/exam-images/[id] — save the ANNOTATED version of an answer
 * sheet (admin marking). The ORIGINAL uploaded image is never modified:
 *  - annotationData = JSON stroke list (undo/redo source of truth)
 *  - annotatedUrl   = flattened PNG (original + annotations), stored separately
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
import { fail, isResponse, ok, requireManager } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 30 * 1024 * 1024

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let absPath: string | null = null
  try {
    const auth = await requireManager(req)
    if (isResponse(auth)) return auth

    const { id } = await params
    const img = await db.examAnswerImage.findUnique({
      where: { id },
      select: { id: true, attemptId: true, url: true, annotatedUrl: true },
    })
    if (!img) return fail('Image not found.', 404)

    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return fail('Expected multipart/form-data upload.', 400)
    }
    if (!req.body) return fail('Empty upload body.', 400)

    const bb = busboy({
      headers: { 'content-type': contentType },
      limits: { files: 1, fileSize: MAX_BYTES, fields: 2, fieldSize: 1024 * 1024 },
    })
    const fields: Record<string, string> = {}
    const st: { saved: { absPath: string; mime: string; size: number } | null } = { saved: null }
    let writeDone: Promise<void> = Promise.resolve()
    let tooLarge = false
    let parseError: Error | null = null

    const done = new Promise<void>((resolve, reject) => {
      bb.on('field', (name, val) => { fields[name] = val })
      bb.on('file', (_name, stream, info) => {
        if (st.saved) { stream.resume(); return }
        const mime = (typeof info.mimeType === 'string' ? info.mimeType : 'image/png').toLowerCase()
        if (!mime.startsWith('image/png') && !mime.startsWith('image/jpeg') && !mime.startsWith('image/webp')) {
          stream.resume()
          return
        }
        const now = new Date()
        const folder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const relDir = `uploads/exam-annotated/${folder}`
        const absDir = path.join(process.cwd(), 'public', relDir)
        const target = path.join(absDir, `${randomBytes(6).toString('hex')}.png`)
        absPath = target
        let size = 0
        const counter = new Transform({
          transform(chunk: Buffer, _enc, cb) { size += chunk.length; cb(null, chunk) },
        })
        stream.on('limit', () => { tooLarge = true })
        writeDone = mkdir(absDir, { recursive: true })
          .then(() => pipeline(stream, counter, createWriteStream(target)))
          .then(() => { st.saved = { absPath: target, mime, size } })
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
      return fail('ছবিটি খুব বড়।', 413)
    }
    if (parseError) throw parseError
    const saved = st.saved
    if (!saved || saved.size === 0) {
      if (saved) await rm(saved.absPath, { force: true })
      return fail('No image received.', 422)
    }

    const url = '/' + path.relative(path.join(process.cwd(), 'public'), saved.absPath).split(path.sep).join('/')
    const annotationData = (fields.annotationData || '').slice(0, 1024 * 1024) || null

    const updated = await db.examAnswerImage.update({
      where: { id },
      data: { annotatedUrl: url, annotatedAt: new Date(), annotationData },
      select: { id: true, annotatedUrl: true },
    })

    // clean the PREVIOUS annotated file (original is never touched)
    const prev = img.annotatedUrl
    if (prev && prev !== url && prev.startsWith('/uploads/')) {
      await rm(path.join(process.cwd(), 'public', prev), { force: true }).catch(() => {})
    }

    return ok({ image: updated })
  } catch (err) {
    if (absPath) await rm(absPath, { force: true }).catch(() => {})
    console.error('[PUT /api/admin/exam-images/[id]]', err)
    return fail('Server error', 500)
  }
}

/**
 * upload-server — shared helpers for the admin upload endpoints
 * (/api/admin/upload single-shot and /api/admin/upload/chunk chunked).
 *
 * The chunked endpoint lets ANY size video upload smoothly:
 *   - the browser sends small 4MB parts (no giant request body anywhere,
 *     so no proxy/memory pressure and no mid-flight server crash),
 *   - parts land on disk as they arrive (survives dev-server restarts),
 *   - the client can query status and resume exactly where it stopped,
 *   - progress = bytes the server actually accepted (perfect %).
 */
import { mkdir } from 'fs/promises'
import path from 'path'
import type { MediaAsset } from '@prisma/client'

export const CHUNK_SIZE = 4 * 1024 * 1024 // 4MB per part — small enough for every hop
export const MAX_CHUNK_BYTES = 8 * 1024 * 1024 // hard cap per received part
export const MAX_SESSION_BYTES = 2 * 1024 * 1024 * 1024 // 2GB per upload session
export const MAX_SESSION_PARTS = Math.ceil(MAX_SESSION_BYTES / CHUNK_SIZE) // 512 parts
export const SINGLE_SHOT_MAX_BYTES = 512 * 1024 * 1024 // legacy one-request cap

export function uploadsRoot(): string {
  return path.join(process.cwd(), 'public', 'uploads')
}

/** Temp home for in-flight chunk sessions — OUTSIDE public/ (never web-servable). */
export function tmpRoot(): string {
  return path.join(process.cwd(), '.uploads-tmp')
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

/** Validate the uploadId (uuid-ish, generated server-side at init). */
export function isValidUploadId(id: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)
}

export type UploadKind = MediaAsset['kind']

/** Map mime/extension/kind-hint → MediaAsset.kind. */
export function detectKind(mime: string, ext: string, hint: string): UploadKind {
  const m = mime.toLowerCase()
  if (m.startsWith('image/')) return 'IMAGE'
  if (m.startsWith('video/') || m === 'application/mp4') return 'VIDEO'
  if (m === 'application/pdf' || ext === 'pdf') return 'PDF'
  // extension fallbacks when the browser sent no useful mime
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'heic'].includes(ext)) return 'IMAGE'
  if (
    ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', '3gp', 'mpg', 'mpeg', 'ts', 'vob', 'mxf', 'rm', 'rmvb', 'asf', 'divx', 'f4v', 'm4v'].includes(ext)
  )
    return 'VIDEO'
  // trust the caller's hint last (media library filter tabs)
  if (hint === 'image') return 'IMAGE'
  if (hint === 'video') return 'VIDEO'
  if (hint === 'pdf') return 'PDF'
  return 'FILE'
}

/** Extract + sanitize the extension (1-8 chars, alphanumeric only). */
export function safeExt(name: string, mime: string): string {
  const tail = (name.split('.').pop() ?? '').toLowerCase()
  if (tail && /^[a-z0-9]{1,8}$/.test(tail) && name.includes('.')) {
    return tail
  }
  // derive from mime when the filename has no usable extension
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
  }
  return map[mime.toLowerCase()] ?? 'bin'
}

/** Slugify the base filename (keep it recognizable, drop anything unsafe). */
export function safeBase(name: string): string {
  const noExt = name.replace(/\.[^.]+$/, '')
  const slug = noExt
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  return slug || 'file'
}

/** Build the final storage path: public/uploads/<YYYY-MM>/<8-hex>-<safe>.<ext>. */
export function finalTarget(originalName: string, mime: string, now = new Date()) {
  const folder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const relDir = `uploads/${folder}`
  const absDir = path.join(uploadsRoot(), folder)
  const tail = `${Math.random().toString(16).slice(2, 10)}-${safeBase(originalName)}.${safeExt(originalName, mime)}`
  const absPath = path.join(absDir, tail)
  const url = `/${relDir}/${tail}`
  return { absDir, absPath, url }
}

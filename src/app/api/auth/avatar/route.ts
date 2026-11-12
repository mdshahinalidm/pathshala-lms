/**
 * POST /api/auth/avatar — student profile photo upload (authenticated).
 *
 * Security:
 *  • images only (JPEG / PNG / WebP) — mime + magic-byte sniffed
 *  • ≤ 4 MB
 *  • randomized filename, extension derived from sniffed type
 *  • saved under public/uploads/avatars/ (served from /uploads/avatars/*)
 *  • previous avatar file is best-effort deleted when replaced
 *
 * Returns { url, size, user, completion, missing } — the avatarUrl is
 * PERSISTED immediately (single source of truth): the session user returned
 * here is already 100%-complete when the photo was the last missing field,
 * so no client ever needs a follow-up "press Save" step to be counted as
 * complete (root fix for the "profile still incomplete after upload" bug).
 */
import { mkdir, writeFile, unlink } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { fail, isResponse, ok, rateLimit, requireAuth } from '@/lib/api-helpers'
import { missingProfileFields, profileCompletion } from '@/lib/student-classes'

export const runtime = 'nodejs'

const MAX_BYTES = 4 * 1024 * 1024
const AVATAR_DIR = path.join(process.cwd(), 'public', 'uploads', 'avatars')

/** Magic-byte sniffing — never trust the client mime alone. */
function sniffImage(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'png'
  }
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    if (rateLimit(req, 'avatar-upload', 10, 10 * 60_000)) {
      return fail('Too many uploads — please slow down.', 429)
    }

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return fail('Invalid upload — send multipart/form-data with a "file" field.', 400)
    }

    const file = form.get('file')
    if (!(file instanceof File)) return fail('No file provided ("file" field required).', 422)
    if (file.size === 0) return fail('Empty file.', 422)
    if (file.size > MAX_BYTES) return fail('Image too large — maximum 4 MB.', 413)

    const buf = Buffer.from(await file.arrayBuffer())
    const ext = sniffImage(buf)
    if (!ext) return fail('Only JPG, PNG or WebP images are allowed.', 422)

    await mkdir(AVATAR_DIR, { recursive: true })
    const name = `${randomUUID()}.${ext}`
    await writeFile(path.join(AVATAR_DIR, name), buf)

    const url = `/uploads/avatars/${name}`

    // ── Persist IMMEDIATELY (root fix for the completion bug): the photo is
    // part of the 100% completion rule, so it must never live only in client
    // state waiting for a separate "Save" that may never happen. The fresh
    // user row travels back to the client, which refreshes the auth store —
    // every completion gate (profile meter, checkout, dashboard) updates
    // instantly from the same single source of truth.
    const user = await db.user.update({
      where: { id: auth.id },
      data: { avatarUrl: url },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        avatarUrl: true,
        studentClass: true,
        institution: true,
      },
    })

    // Best-effort cleanup of the replaced avatar file — only AFTER the row
    // points at the new file, so a failed update can never strand the user
    // with a URL whose file was already deleted.
    if (auth.avatarUrl && auth.avatarUrl.startsWith('/uploads/avatars/')) {
      const old = path.join(AVATAR_DIR, path.basename(auth.avatarUrl))
      unlink(old).catch(() => {})
    }

    return ok({ url, size: buf.length, user, completion: profileCompletion(user), missing: missingProfileFields(user) })
  } catch (err) {
    console.error('[POST /api/auth/avatar]', err)
    return fail('Server error', 500)
  }
}

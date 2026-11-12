/**
 * /api/subjects — Subject management (Categories section of the admin panel).
 *
 * GET    — all subjects with course counts (PUBLIC — used by course pages).
 * POST   — ADMIN creates a subject. Slug auto-derived from nameEn||name
 *          (same rule as categories); pure-Bangla names get a `sub-<hex>` fallback.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireManager, sanitize } from '@/lib/api-helpers'

const subjectCreateSchema = z.object({
  name: z.string().min(1, 'Name must be at least 1 character').max(60),
  nameEn: z.string().max(60).optional(),
})

/** Spec slugify: lowercase, [^a-z0-9]+ → '-', trim '-'. Bangla → empty. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

async function uniqueSubjectSlug(base: string): Promise<string> {
  let slug = base
  for (let n = 2; ; n++) {
    const exists = await db.subject.findUnique({ where: { slug }, select: { id: true } })
    if (!exists) return slug
    slug = `${base}-${n}`
  }
}

function randomHex6(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** GET /api/subjects (public — course filters / labels) */
export async function GET() {
  try {
    const subjects = await db.subject.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { courses: true } } },
    })
    return ok(subjects)
  } catch (err) {
    console.error('[GET /api/subjects]', err)
    return fail('Server error', 500)
  }
}

/** POST /api/subjects (admin) */
export async function POST(req: Request) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const parsed = await parseBody(req, subjectCreateSchema)
    if (isResponse(parsed)) return parsed

    const name = sanitize(parsed.name, 60)
    const nameEn = parsed.nameEn ? sanitize(parsed.nameEn, 60) : undefined
    const slug = await uniqueSubjectSlug(slugify(nameEn || name) || `sub-${randomHex6()}`)

    const subject = await db.subject.create({ data: { name, nameEn, slug } })
    return ok(subject)
  } catch (err) {
    console.error('[POST /api/subjects]', err)
    return fail('Server error', 500)
  }
}

/**
 * GET  /api/categories — all categories with course counts.
 * POST /api/categories — ADMIN creates a category. Slug is auto-derived from
 *        nameEn||name (lowercase, non [a-z0-9] → '-', trimmed). A pure-Bangla
 *        name with no nameEn yields an empty slug → `cat-<6 hex>` fallback.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireManager, sanitize } from '@/lib/api-helpers'

const categoryCreateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(60),
  nameEn: z.string().max(60).optional(),
  icon: z.string().max(40).optional(),
})

/** Spec slugify: lowercase, [^a-z0-9]+ → '-', trim '-'. Bangla → empty. */
function slugifyCategory(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/** Unique slug: base, then base-2, base-3, ... */
async function uniqueCategorySlug(base: string): Promise<string> {
  let slug = base
  for (let n = 2; ; n++) {
    const exists = await db.category.findUnique({ where: { slug }, select: { id: true } })
    if (!exists) return slug
    slug = `${base}-${n}`
  }
}

/** 6 random hex chars (crypto-safe). */
function randomHex6(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** GET /api/categories */
export async function GET() {
  try {
    const categories = await db.category.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { courses: true } } },
    })
    return ok(categories)
  } catch (err) {
    console.error('[GET /api/categories]', err)
    return fail('Server error', 500)
  }
}

/** POST /api/categories (admin) */
export async function POST(req: Request) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const parsed = await parseBody(req, categoryCreateSchema)
    if (isResponse(parsed)) return parsed

    const name = sanitize(parsed.name, 60)
    if (name.length < 2) return fail('Name must be at least 2 characters', 422)
    const nameEn = parsed.nameEn ? sanitize(parsed.nameEn, 60) || null : null
    const icon = parsed.icon ? sanitize(parsed.icon, 40) || null : null

    const slugBase = slugifyCategory(nameEn || name)
    const slug = await uniqueCategorySlug(slugBase || `cat-${randomHex6()}`)

    const category = await db.category.create({
      data: { name, nameEn, icon, slug },
      include: { _count: { select: { courses: true } } },
    })
    return ok(category)
  } catch (err) {
    console.error('[POST /api/categories]', err)
    return fail('Server error', 500)
  }
}

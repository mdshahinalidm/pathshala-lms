/**
 * /api/admin/instructors — Instructor section (Admin → Instructors).
 *
 * GET  (ADMIN/MANAGER/MODERATOR)  → all instructors + course counts.
 * POST (ADMIN/MANAGER)            → create an instructor. The photo comes
 *      from the media uploader (/api/admin/upload) as a site-relative URL.
 *
 * Instructors appear on the public About page ("Our Team") and are the ONLY
 * source for the course-creation instructor dropdown.
 */
import { db } from '@/lib/db'
import { ok, fail, requireAdmin, requireManager, isResponse, parseBody, sanitize } from '@/lib/api-helpers'
import { instructorCreateSchema, instructorSelect } from '@/lib/instructors'

/** GET /api/admin/instructors (panel roles) */
export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const instructors = await db.instructor.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      select: instructorSelect,
    })
    return ok(instructors)
  } catch (err) {
    console.error('[GET /api/admin/instructors]', err)
    return fail('Server error', 500)
  }
}

/** POST /api/admin/instructors (ADMIN/MANAGER) */
export async function POST(req: Request) {
  try {
    const manager = await requireManager(req)
    if (isResponse(manager)) return manager

    const parsed = await parseBody(req, instructorCreateSchema)
    if (isResponse(parsed)) return parsed

    const name = sanitize(parsed.name, 80)
    if (name.length < 2) return fail('Name must be at least 2 characters', 422)

    const instructor = await db.instructor.create({
      data: {
        name,
        nameEn: parsed.nameEn ? sanitize(parsed.nameEn, 80) : null,
        designation: parsed.designation ? sanitize(parsed.designation, 120) : '',
        designationEn: parsed.designationEn ? sanitize(parsed.designationEn, 120) : null,
        bio: parsed.bio ? sanitize(parsed.bio, 2000) : null,
        bioEn: parsed.bioEn ? sanitize(parsed.bioEn, 2000) : null,
        photoUrl: parsed.photoUrl ? sanitize(parsed.photoUrl, 500) : null,
        email: parsed.email ? parsed.email : null,
        phone: parsed.phone ? sanitize(parsed.phone, 20) : null,
        isActive: parsed.isActive ?? true,
        order: parsed.order ?? 0,
      },
      select: instructorSelect,
    })

    return ok(instructor, 201)
  } catch (err) {
    console.error('[POST /api/admin/instructors]', err)
    return fail('Server error', 500)
  }
}

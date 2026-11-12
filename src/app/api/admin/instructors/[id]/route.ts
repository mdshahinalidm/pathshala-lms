/**
 * /api/admin/instructors/[id] — edit / delete an instructor (ADMIN/MANAGER).
 *
 * PATCH updates the instructor AND syncs the display snapshot
 * (instructorName/instructorTitle/instructorBio/instructorImage) into every
 * course linked via instructorId, so course cards/detail pages and the About
 * page always show the same up-to-date profile without any design change.
 *
 * DELETE removes the instructor row; linked courses KEEP their last snapshot
 * (onDelete: SetNull on Course.instructorId) — nothing is lost.
 */
import { db } from '@/lib/db'
import { ok, fail, requireManager, isResponse, parseBody, sanitize } from '@/lib/api-helpers'
import { instructorCreateSchema } from '@/lib/instructors'

/** PATCH /api/admin/instructors/[id] (ADMIN/MANAGER) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const manager = await requireManager(req)
    if (isResponse(manager)) return manager

    const existing = await db.instructor.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!existing) return fail('Instructor not found', 404)

    const parsed = await parseBody(req, instructorCreateSchema.partial())
    if (isResponse(parsed)) return parsed

    const data = {
      ...(parsed.name !== undefined
        ? { name: (() => { const n = sanitize(parsed.name, 80); return n.length >= 2 ? n : undefined })() }
        : {}),
      ...(parsed.nameEn !== undefined ? { nameEn: parsed.nameEn ? sanitize(parsed.nameEn, 80) : null } : {}),
      ...(parsed.designation !== undefined
        ? { designation: parsed.designation ? sanitize(parsed.designation, 120) : '' }
        : {}),
      ...(parsed.designationEn !== undefined
        ? { designationEn: parsed.designationEn ? sanitize(parsed.designationEn, 120) : null }
        : {}),
      ...(parsed.bio !== undefined ? { bio: parsed.bio ? sanitize(parsed.bio, 2000) : null } : {}),
      ...(parsed.bioEn !== undefined ? { bioEn: parsed.bioEn ? sanitize(parsed.bioEn, 2000) : null } : {}),
      ...(parsed.photoUrl !== undefined
        ? { photoUrl: parsed.photoUrl ? sanitize(parsed.photoUrl, 500) : null }
        : {}),
      ...(parsed.email !== undefined ? { email: parsed.email ? parsed.email : null } : {}),
      ...(parsed.phone !== undefined ? { phone: parsed.phone ? sanitize(parsed.phone, 20) : null } : {}),
      ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
      ...(parsed.order !== undefined ? { order: parsed.order } : {}),
    }

    if (data.name === undefined && 'name' in data) {
      return fail('Name must be at least 2 characters', 422)
    }

    const instructor = await db.$transaction(async (tx) => {
      const updated = await tx.instructor.update({
        where: { id },
        data,
        select: {
          id: true,
          name: true,
          nameEn: true,
          designation: true,
          designationEn: true,
          bio: true,
          bioEn: true,
          photoUrl: true,
          email: true,
          phone: true,
          isActive: true,
          order: true,
        },
      })

      // Sync the display snapshot into linked courses (name/title/bio/photo).
      await tx.course.updateMany({
        where: { instructorId: id },
        data: {
          instructorName: updated.name,
          instructorTitle: updated.designation || null,
          instructorBio: updated.bio,
          instructorImage: updated.photoUrl,
        },
      })

      return updated
    })

    return ok(instructor)
  } catch (err) {
    console.error('[PATCH /api/admin/instructors/[id]]', err)
    return fail('Server error', 500)
  }
}

/** DELETE /api/admin/instructors/[id] (ADMIN/MANAGER) */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const manager = await requireManager(req)
    if (isResponse(manager)) return manager

    const existing = await db.instructor.findUnique({
      where: { id },
      select: { id: true, _count: { select: { courses: true } } },
    })
    if (!existing) return fail('Instructor not found', 404)

    // Course.instructorId → SetNull; snapshot fields remain on the course.
    await db.instructor.delete({ where: { id } })
    return ok({ deleted: true, linkedCoursesKeptSnapshot: existing._count.courses })
  } catch (err) {
    console.error('[DELETE /api/admin/instructors/[id]]', err)
    return fail('Server error', 500)
  }
}

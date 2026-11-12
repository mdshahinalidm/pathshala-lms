/**
 * GET /api/instructors — PUBLIC list of active instructors for the About
 * page ("Our Team"). Ordered by `order` then creation time. Only isActive
 * rows are exposed; contact fields stay server-side.
 */
import { db } from '@/lib/db'
import { fail, ok } from '@/lib/api-helpers'

export async function GET() {
  try {
    const instructors = await db.instructor.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        nameEn: true,
        designation: true,
        designationEn: true,
        bio: true,
        bioEn: true,
        photoUrl: true,
      },
    })
    return ok(instructors)
  } catch (err) {
    console.error('[GET /api/instructors]', err)
    return fail('Server error', 500)
  }
}

/**
 * GET /api/broadcasts — notices visible to the logged-in student.
 * A broadcast is visible when it targets ALL students (empty class list)
 * or the student's own class is in targetClasses. Latest 50.
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAuth } from '@/lib/api-helpers'
import { parseTargetClasses } from '@/lib/student-classes'

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const rows = await db.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    // Class-filter in the app layer: targetClasses is a JSON string array.
    const visible = rows
      .filter((b) => {
        const targets = parseTargetClasses(b.targetClasses)
        return targets.length === 0 || (auth.studentClass && targets.includes(auth.studentClass as never))
      })
      .slice(0, 50)
      .map(({ targetClasses, ...b }) => ({ ...b, targetClasses: parseTargetClasses(targetClasses) }))

    return ok({ broadcasts: visible })
  } catch (err) {
    console.error('[GET /api/broadcasts]', err)
    return fail('Server error', 500)
  }
}

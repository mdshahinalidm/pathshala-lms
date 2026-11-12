/**
 * GET /api/certificates
 *   default      → the current user's certificates (with course title/slug).
 *   ?scope=all   → ADMIN only: every certificate incl. student name/email.
 * Certificates are auto-issued when an enrollment reaches 100% progress
 * (see PATCH /api/enrollments) — this endpoint is read-only.
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAuth } from '@/lib/api-helpers'

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const scopeAll =
      new URL(req.url).searchParams.get('scope') === 'all' &&
      (auth.role === 'ADMIN' || auth.role === 'MANAGER' || auth.role === 'MODERATOR')

    const certificates = await db.certificate.findMany({
      where: scopeAll ? {} : { userId: auth.id },
      orderBy: { issuedAt: 'desc' },
      take: 500,
      include: {
        course: { select: { id: true, title: true, slug: true } },
        ...(scopeAll ? { user: { select: { id: true, name: true, email: true } } } : {}),
      },
    })
    return ok(certificates)
  } catch (err) {
    console.error('[GET /api/certificates]', err)
    return fail('Server error', 500)
  }
}

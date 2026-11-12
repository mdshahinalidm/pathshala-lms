/**
 * GET /api/auth/me — current session user (null when logged out).
 * Also returns profileCompletion (0–100) + missing field keys so the
 * client can enforce the "100% profile before buying" rule.
 */
import { getAuthUser, fail, ok } from '@/lib/api-helpers'
import { missingProfileFields, profileCompletion } from '@/lib/student-classes'

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req)
    if (!user) return ok({ user: null, completion: 0, missing: [] })
    return ok({
      user,
      completion: profileCompletion(user),
      missing: missingProfileFields(user),
    })
  } catch (err) {
    console.error('[GET /api/auth/me]', err)
    return fail('Server error', 500)
  }
}

/**
 * POST /api/auth/logout — clears the JWT auth cookie.
 */
import { AUTH_COOKIE, authCookieOptions } from '@/lib/auth-jwt'
import { fail, ok } from '@/lib/api-helpers'

export async function POST() {
  try {
    const res = ok({})
    res.cookies.set(AUTH_COOKIE, '', { ...authCookieOptions(), maxAge: 0 })
    return res
  } catch (err) {
    console.error('[POST /api/auth/logout]', err)
    return fail('Server error', 500)
  }
}

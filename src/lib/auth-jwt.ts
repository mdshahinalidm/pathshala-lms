/**
 * Edge-safe JWT utilities (works in middleware + node route handlers).
 * Uses `jose` (Web Crypto) so the same code runs at the edge and in node.
 */
import { SignJWT, jwtVerify } from 'jose'

export const AUTH_COOKIE = 'ps_token'
export const TOKEN_TTL = '7d'

export interface JwtPayload {
  sub: string // user id
  role: 'STUDENT' | 'ADMIN' | 'MANAGER' | 'MODERATOR'
  name: string
  sid?: string // session id — device limiting (only latest login valid)
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || 'pathshala-dev-secret-change-me-in-production-0123456789'
  return new TextEncoder().encode(secret)
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ role: payload.role, name: payload.name, sid: payload.sid ?? null })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer('pathshala')
    .setExpirationTime(TOKEN_TTL)
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: 'pathshala' })
    if (!payload.sub) return null
    return {
      sub: payload.sub,
      role: (payload.role as 'STUDENT' | 'ADMIN' | 'MANAGER' | 'MODERATOR') || 'STUDENT',
      name: (payload.name as string) || 'Student',
      sid: (payload.sid as string) || undefined,
    }
  } catch {
    return null
  }
}

export function getCookieToken(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader) return null
  const cookies = cookieHeader.split(';')
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split('=')
    if (key === AUTH_COOKIE) return decodeURIComponent(rest.join('='))
  }
  return null
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  }
}

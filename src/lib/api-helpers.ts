/**
 * Server-side API helpers: uniform JSON responses, auth extraction,
 * input sanitization, validation and rate limiting.
 */
import { NextResponse } from 'next/server'
import { ZodSchema } from 'zod'
import { db } from '@/lib/db'
import { getCookieToken } from '@/lib/auth-jwt'
import { resolveSessionUser } from '@/lib/auth-session'

export interface AuthUser {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  isVerified: boolean
  isBlocked: boolean
  avatarUrl?: string | null
  studentClass?: string | null
  institution?: string | null
}

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200 })
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

/**
 * Extract the authenticated user (DB-backed) from the request cookie.
 * Delegates to resolveSessionUser — THE single source of truth shared with
 * the /admin gate, so JWT-only vs DB-backed rules can never disagree
 * (that mismatch caused the admin-panel infinite redirect loop).
 */
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  return resolveSessionUser(getCookieToken(req))
}

export async function requireAuth(req: Request): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser(req)
  if (!user) return fail('Unauthorized — please log in.', 401)
  return user
}

/**
 * Panel access: ADMIN, MANAGER (site manager) or MODERATOR — every staff
 * account is created by the owner from Admin → Admin Control. Every
 * /api/admin/** route accepts all three; routes that need content-management
 * rights use requireManager, and routes that must stay owner-only
 * additionally call requireOwner.
 */
export async function requireAdmin(req: Request): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser(req)
  if (!user) return fail('Unauthorized — please log in.', 401)
  if (user.role !== 'ADMIN' && user.role !== 'MANAGER' && user.role !== 'MODERATOR') {
    return fail('Forbidden — admin access required.', 403)
  }
  return user
}

/**
 * Content-management actions (create/edit/delete courses, quizzes, notices,
 * suggestions, broadcasts, live classes, media, enrollments…): ADMIN or
 * MANAGER — a MODERATOR is read/moderate-only and is rejected here.
 */
export async function requireManager(req: Request): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser(req)
  if (!user) return fail('Unauthorized — please log in.', 401)
  if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
    return fail('Forbidden — manager access required.', 403)
  }
  return user
}

/** OWNER-only actions (user/manager management, settings, gateways). */
export async function requireOwner(req: Request): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser(req)
  if (!user) return fail('Unauthorized — please log in.', 401)
  if (user.role !== 'ADMIN') return fail('Forbidden — owner (admin) access required.', 403)
  return user
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse
}

/** Parse + validate JSON body with zod. Returns error response on failure. */
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T | NextResponse> {
  try {
    const json = await req.json()
    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      const first = parsed.error.issues?.[0]
      return fail(first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input', 422)
    }
    return parsed.data
  } catch {
    return fail('Invalid JSON body', 400)
  }
}

/** Strip HTML/script payloads and cap length (input sanitization). */
export function sanitize(input: unknown, maxLen = 5000): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .slice(0, maxLen)
}

/**
 * Sanitize admin-authored HTML CODE while PRESERVING benign markup
 * (links, bold, spans…). Used for fields the admin explicitly writes as
 * code (footer copyright): "whatever the admin saves is shown verbatim".
 * Dangerous constructs are still removed: <script>/<style>/<iframe>,
 * inline event handlers (onclick=…) and javascript: URLs.
 */
export function sanitizeHtml(input: unknown, maxLen = 5000): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<(script|style|iframe)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, maxLen)
}

// ── naive in-memory sliding-window rate limiter (per process) ──
const buckets = new Map<string, number[]>()

export function rateLimit(req: Request, key: string, limit = 10, windowMs = 60_000): NextResponse | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  const k = `${key}:${ip}`
  const now = Date.now()
  const hits = (buckets.get(k) || []).filter((t) => now - t < windowMs)
  if (hits.length >= limit) {
    return fail('Too many requests — please slow down.', 429)
  }
  hits.push(now)
  buckets.set(k, hits)
  if (buckets.size > 5000) buckets.clear()
  return null
}

export function makeTrxId(prefix = 'PS') {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`
}

/**
 * PUT /api/auth/profile — update own profile (authenticated).
 *
 * Fields: name · email · phone · studentClass · institution.
 * avatarUrl is validated (must be an /uploads/avatars/ path returned by
 * POST /api/auth/avatar) — arbitrary external URLs are rejected.
 * Returns { user, completion, missing } so the UI can show the profile
 * completion meter (100% required before buying paid items).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAuth, sanitize } from '@/lib/api-helpers'
import {
  isValidClass,
  missingProfileFields,
  profileCompletion,
} from '@/lib/student-classes'

const BD_PHONE = /^01[3-9]\d{8}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80, 'Name too long').optional(),
  phone: z
    .string()
    .regex(BD_PHONE, 'Invalid Bangladeshi mobile number (e.g. 01712345678)')
    .optional()
    .or(z.literal('')),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(120, 'Email too long')
    .refine((v) => v === '' || EMAIL_RE.test(v), 'Invalid email address')
    .optional(),
  studentClass: z
    .string()
    .refine((v) => v === '' || isValidClass(v), 'Select a valid class')
    .optional(),
  institution: z.string().max(120, 'Institution name too long').optional(),
  avatarUrl: z.string().max(300).optional(),
})

export async function PUT(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const parsed = await parseBody(req, profileSchema)
    if (isResponse(parsed)) return parsed

    const data: {
      name?: string
      phone?: string | null
      email?: string | null
      studentClass?: string | null
      institution?: string | null
      avatarUrl?: string | null
    } = {}

    if (parsed.name !== undefined) {
      const name = sanitize(parsed.name, 80)
      if (name.length < 2) return fail('Name must be at least 2 characters', 422)
      data.name = name
    }

    if (parsed.phone !== undefined) {
      if (parsed.phone === '') {
        data.phone = null
      } else {
        const clash = await db.user.findFirst({
          where: { phone: parsed.phone, NOT: { id: auth.id } },
          select: { id: true },
        })
        if (clash) return fail('This phone number is already in use.', 409)
        data.phone = parsed.phone
      }
    }

    if (parsed.email !== undefined) {
      if (parsed.email === '') {
        data.email = null
      } else {
        const clash = await db.user.findFirst({
          where: { email: parsed.email, NOT: { id: auth.id } },
          select: { id: true },
        })
        if (clash) return fail('This email is already in use.', 409)
        data.email = parsed.email
      }
    }

    if (parsed.studentClass !== undefined) {
      data.studentClass = parsed.studentClass === '' ? null : parsed.studentClass
    }

    if (parsed.institution !== undefined) {
      const inst = sanitize(parsed.institution, 120)
      data.institution = inst.trim() === '' ? null : inst.trim()
    }

    if (parsed.avatarUrl !== undefined) {
      // Security: only paths served by POST /api/auth/avatar are accepted.
      if (
        parsed.avatarUrl !== '' &&
        !/^\/uploads\/avatars\/[A-Za-z0-9._-]+$/.test(parsed.avatarUrl)
      ) {
        return fail('Invalid avatar — upload a new image instead.', 422)
      }
      data.avatarUrl = parsed.avatarUrl === '' ? null : parsed.avatarUrl
    }

    if (Object.keys(data).length === 0) return fail('Nothing to update', 422)

    const user = await db.user.update({
      where: { id: auth.id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        avatarUrl: true,
        studentClass: true,
        institution: true,
      },
    })
    return ok({ user, completion: profileCompletion(user), missing: missingProfileFields(user) })
  } catch (err) {
    console.error('[PUT /api/auth/profile]', err)
    return fail('Server error', 500)
  }
}

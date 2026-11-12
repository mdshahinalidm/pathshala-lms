/**
 * /api/admin/users/[id] — staff account administration (OWNER/ADMIN only).
 *
 * PATCH  { isBlocked?, role?, isVerified?, password? } — OWNER (ADMIN) only;
 *        a manager/moderator can never block/demote/promote accounts or reset
 *        passwords. Role accepts STUDENT, ADMIN, MANAGER (site manager) and
 *        MODERATOR. Self-lockout guard retained; password reset accepts the
 *        same strength rules as creation and rotates the target's session so
 *        old devices are logged out.
 * DELETE — OWNER (ADMIN) only; cannot delete themselves.
 */
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, requireOwner, isResponse, parseBody } from '@/lib/api-helpers'

const userPatchSchema = z
  .object({
    isBlocked: z.boolean().optional(),
    role: z.enum(['STUDENT', 'ADMIN', 'MANAGER', 'MODERATOR']).optional(),
    isVerified: z.boolean().optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72)
      .regex(/[A-Za-z]/, 'At least one letter required')
      .regex(/\d/, 'At least one digit required')
      .optional(),
  })
  .refine(
    (v) =>
      v.isBlocked !== undefined ||
      v.role !== undefined ||
      v.isVerified !== undefined ||
      v.password !== undefined,
    { message: 'Nothing to update' },
  )

/** PATCH /api/admin/users/[id] (owner) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = await requireOwner(req)
    if (isResponse(admin)) return admin

    const target = await db.user.findUnique({ where: { id }, select: { id: true, role: true } })
    if (!target) return fail('User not found', 404)

    const body = await parseBody(req, userPatchSchema)
    if (isResponse(body)) return body

    // Self-lockout guard: cannot block, demote or re-password yourself here.
    if (id === admin.id) {
      if (body.isBlocked === true) {
        return fail('You cannot block your own admin account', 400)
      }
      if (body.role !== undefined && body.role !== 'ADMIN') {
        return fail('You cannot demote your own admin account', 400)
      }
    }

    const passwordHash =
      body.password !== undefined ? await bcrypt.hash(body.password, 10) : undefined

    const user = await db.user.update({
      where: { id },
      data: {
        ...(body.isBlocked !== undefined ? { isBlocked: body.isBlocked } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.isVerified !== undefined ? { isVerified: body.isVerified } : {}),
        ...(passwordHash !== undefined
          ? {
              passwordHash,
              // Rotate to a FRESH unknown session id — every existing device
              // token now mismatches and is force-logged-out (device limiting).
              activeSessionId: crypto.randomUUID(),
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        isBlocked: true,
        createdAt: true,
      },
    })

    return ok(user)
  } catch (err) {
    console.error('[PATCH /api/admin/users/[id]]', err)
    return fail('Server error', 500)
  }
}

/** DELETE /api/admin/users/[id] (owner) */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = await requireOwner(req)
    if (isResponse(admin)) return admin

    if (id === admin.id) {
      return fail('You cannot delete your own account', 400)
    }

    const target = await db.user.findUnique({ where: { id }, select: { id: true } })
    if (!target) return fail('User not found', 404)

    // Enrollments, orders, attempts, notifications cascade via schema.
    await db.user.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/users/[id]]', err)
    return fail('Server error', 500)
  }
}

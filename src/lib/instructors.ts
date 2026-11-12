/**
 * Shared schema/select for the Instructor section — imported by both
 * /api/admin/instructors routes (Next.js route files may only export HTTP
 * handlers, so shared pieces live here).
 */
import { z } from 'zod'
import { db } from '@/lib/db'

export const instructorSelect = {
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
  createdAt: true,
  _count: { select: { courses: true } },
} as const

export const instructorMediaUrl = z
  .string()
  .max(500)
  .refine(
    (v) => v === '' || /^(https?:\/\/|\/(uploads|images)\/)\S+$/i.test(v),
    'Photo must be an uploaded/media URL',
  )

export const instructorCreateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80),
  nameEn: z.string().max(80).optional().nullable(),
  designation: z.string().max(120).optional().nullable(),
  designationEn: z.string().max(120).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  bioEn: z.string().max(2000).optional().nullable(),
  photoUrl: instructorMediaUrl.optional().nullable(),
  email: z
    .union([z.string().trim().toLowerCase().email('Valid email required').max(120), z.literal('')])
    .optional()
    .nullable(),
  phone: z.string().max(20).optional().nullable(),
  isActive: z.boolean().optional(),
  order: z.number().int().min(0).max(9999).optional(),
})

/**
 * Resolve an instructor id into the course display snapshot. Returns null
 * when the id is empty; THROWS is never expected (caller validates exists).
 */
export async function resolveInstructorSnapshot(
  instructorId?: string | null,
): Promise<{
  instructorId: string
  instructorName: string
  instructorTitle: string | null
  instructorBio: string | null
  instructorImage: string | null
} | null> {
  if (!instructorId) return null
  const ins = await db.instructor.findUnique({
    where: { id: instructorId },
    select: { id: true, name: true, designation: true, bio: true, photoUrl: true },
  })
  if (!ins) return null
  return {
    instructorId: ins.id,
    instructorName: ins.name,
    instructorTitle: ins.designation || null,
    instructorBio: ins.bio,
    instructorImage: ins.photoUrl,
  }
}

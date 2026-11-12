/**
 * enrollment.ts — course validity helpers (ONE shared rule).
 *
 * A course's access duration (validity) is chosen by the admin:
 *   isLifetime=true            → never expires
 *   validityMonths=N (1|2|3|6|12…) → expires N months after enrollment
 *   neither set (legacy rows)  → treated as lifetime (no data loss, no surprise expiry)
 *
 * expiresAt is computed ONCE at enrollment time and stored on the Enrollment
 * row — later course edits never retroactively shorten a student's access.
 */
import { db } from '@/lib/db'
import type { Course } from '@prisma/client'

/** Add N calendar months, clamping day-overflows (Jan 31 + 1mo → Feb 28). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() < day) d.setDate(0) // clamp to last day of the target month
  return d
}

/** Compute the enrollment expiry for a course (null = lifetime). */
export function enrollmentExpiryFor(course: Pick<Course, 'isLifetime' | 'validityMonths'>, enrolledAt = new Date()): Date | null {
  if (course.isLifetime || !course.validityMonths || course.validityMonths <= 0) return null
  return addMonths(enrolledAt, course.validityMonths)
}

/** Create an enrollment with the course-validity expiry applied (idempotent). */
export async function enrollWithValidity(userId: string, courseId: string): Promise<void> {
  const existing = await db.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true },
  })
  if (existing) return
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { isLifetime: true, validityMonths: true },
  })
  await db.enrollment.create({
    data: {
      userId,
      courseId,
      expiresAt: course ? enrollmentExpiryFor(course) : null,
    },
  })
}

/** A "still enrolled" filter: excludes expired enrollments (lifetime/null never expires). */
export const ACTIVE_ENROLLMENT_FILTER = {
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
} as const

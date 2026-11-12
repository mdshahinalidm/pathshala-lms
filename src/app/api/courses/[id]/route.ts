/**
 * /api/courses/[id] — id may be a cuid OR a slug (matched with OR).
 *
 * GET    — course detail. Non-enrolled, non-admin viewers get MASKED lesson
 *          content (videoUrl/content nulled unless the lesson isPreview).
 * PUT    — ADMIN full update: course fields + chapters/lessons sync inside a
 *          transaction (removed chapters/lessons deleted, existing upserted,
 *          new created). Also accepts optional benefits/requirements arrays
 *          (only overwritten when the key is present in the body).
 * PATCH  — ADMIN lightweight partial update (whitelisted fields only; never
 *          touches chapters/lessons).
 * DELETE — ADMIN delete (DB cascades chapters/lessons/enrollments/orders).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, getAuthUser, isResponse, ok, parseBody, requireManager, sanitize } from '@/lib/api-helpers'
import { ensureFirstVideoPreview } from '@/lib/course-preview'
import { resolveInstructorSnapshot } from '@/lib/instructors'

const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const

const lessonSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Lesson title required').max(120),
  type: z.enum(['VIDEO', 'PDF', 'TEXT']),
  videoUrl: z.string().max(1000).optional().nullable(),
  content: z.string().max(20000).optional().nullable(),
  duration: z.number().int().min(0).max(86_400).optional().nullable(),
  isPreview: z.boolean(),
  order: z.number().int().min(0).max(1000),
})

const chapterSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Chapter title required').max(120),
  order: z.number().int().min(0).max(1000),
  lessons: z.array(lessonSchema).max(200),
})

const courseUpdateSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(120),
  subtitle: z.string().max(200).optional().nullable(),
  description: z.string().max(8000),
  price: z.number().min(0).max(1_000_000),
  discountPrice: z.number().min(0).max(1_000_000).optional().nullable(),
  thumbnail: z.string().max(500).optional().nullable(),
  level: z.enum(LEVELS).optional(),
  isPublished: z.boolean(),
  isFeatured: z.boolean(),
  categoryId: z.string().optional().nullable(),
  instructorId: z.string().min(1).optional().nullable(),
  instructorName: z.string().min(2).max(80),
  instructorTitle: z.string().max(120).optional().nullable(),
  instructorBio: z.string().max(1000).optional().nullable(),
  chapters: z.array(chapterSchema).max(100),
  benefits: z.array(z.string().min(1).max(200)).max(12).optional(),
  requirements: z.array(z.string().min(1).max(200)).max(12).optional(),
  // ── Course validity ──
  isLifetime: z.boolean().optional(), // Lifetime Access → never expires
  validityMonths: z.number().int().min(1).max(60).optional().nullable(), // 1|2|3|6|12
  // ── Subject assignment (pivot-synced, proper relational structure) ──
  subjectIds: z.array(z.string().min(1)).max(20).optional(),
})

/** Sanitize a benefits/requirements array and serialize to a JSON string column. */
function stringListToJson(items: string[]): string {
  return JSON.stringify(items.map((s) => sanitize(s, 200)).filter((s) => s.length > 0))
}

// ───────────────────────────────── GET ─────────────────────────────────

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const course = await db.course.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        category: { select: { name: true, nameEn: true, slug: true, icon: true } },
        subjects: { include: { subject: { select: { id: true, name: true, nameEn: true, slug: true } } } },
        chapters: { orderBy: { order: 'asc' }, include: { lessons: { orderBy: { order: 'asc' } } } },
        reviews: {
          // show ADMIN-APPROVED reviews only — seed reviews (userId
          // null) stay visible and approved student reviews now appear here
          // once moderated (isApproved was set by the admin panel).
          where: { isApproved: true },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { id: true, userName: true, userRole: true, rating: true, comment: true, createdAt: true },
        },
        _count: { select: { enrollments: true } },
      },
    })
    if (!course) return fail('Course not found', 404)

    const viewer = await getAuthUser(req)
    const isAdmin = viewer?.role === 'ADMIN'
    let isEnrolled = false
    let enrollmentExpired = false
    if (viewer) {
      const enrollment = await db.enrollment.findUnique({
        where: { userId_courseId: { userId: viewer.id, courseId: course.id } },
        select: { id: true, expiresAt: true },
      })
      // Expired access no longer counts as enrolled (lifetime/null never expires).
      const active = Boolean(enrollment) && (!enrollment?.expiresAt || enrollment.expiresAt.getTime() > Date.now())
      isEnrolled = active
      enrollmentExpired = Boolean(enrollment) && !active
    }

    const lessonsTotal = course.chapters.reduce((sum, ch) => sum + ch.lessons.length, 0)

    // Content masking: unenrolled non-admin viewers only see preview lessons'
    // media/PDF/text content. Titles, types, durations and preview flags stay
    // visible so the curriculum can still be browsed.
    const masked = !isEnrolled && !isAdmin
    const chapters = course.chapters.map((ch) => ({
      ...ch,
      lessons: ch.lessons.map((l) => {
        if (!masked || l.isPreview) return l
        return {
          ...l,
          videoUrl: null,
          content: l.type === 'PDF' || l.type === 'TEXT' ? null : l.content,
        }
      }),
    }))

    const { reviews, ...courseRest } = course
    return ok({
      course: {
        ...courseRest,
        chapters,
        lessonsTotal,
        categoryName: course.category?.name ?? null,
      },
      isEnrolled,
      enrollmentExpired,
      lessonsTotal,
      reviews,
    })
  } catch (err) {
    console.error('[GET /api/courses/[id]]', err)
    return fail('Server error', 500)
  }
}

// ───────────────────────────────── PUT ─────────────────────────────────

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const parsed = await parseBody(req, courseUpdateSchema)
    if (isResponse(parsed)) return parsed

    const existing = await db.course.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: { id: true, chapters: { select: { id: true, lessons: { select: { id: true } } } } },
    })
    if (!existing) return fail('Course not found', 404)

    const title = sanitize(parsed.title, 120)
    if (title.length < 2) return fail('Title must be at least 2 characters', 422)

    let categoryId: string | null = null
    if (parsed.categoryId) {
      const cat = await db.category.findUnique({ where: { id: parsed.categoryId }, select: { id: true } })
      if (!cat) return fail('Category not found', 422)
      categoryId = cat.id
    }

    // Instructor selection (Admin → Instructors). When set, snapshot syncs
    // from the Instructor record; when absent the legacy fields apply.
    const instructor = await resolveInstructorSnapshot(parsed.instructorId)
    if (parsed.instructorId && !instructor) return fail('Instructor not found', 422)

    const existingChapterIds = new Set(existing.chapters.map((c) => c.id))
    const existingLessonIdsByChapter = new Map<string, Set<string>>(
      existing.chapters.map((c) => [c.id, new Set(c.lessons.map((l) => l.id))]),
    )

    const course = await db.$transaction(async (tx) => {
      // 1) course fields
      await tx.course.update({
        where: { id: existing.id },
        data: {
          title,
          subtitle: parsed.subtitle ? sanitize(parsed.subtitle, 200) : null,
          description: sanitize(parsed.description, 8000),
          price: parsed.price,
          discountPrice: parsed.discountPrice ?? null,
          thumbnail: parsed.thumbnail ? sanitize(parsed.thumbnail, 500) : null,
          level: parsed.level ?? 'BEGINNER',
          isPublished: parsed.isPublished,
          isFeatured: parsed.isFeatured,
          categoryId,
          ...(instructor
            ? {
                instructorId: instructor.instructorId,
                instructorName: instructor.instructorName,
                instructorTitle: instructor.instructorTitle,
                instructorBio: instructor.instructorBio,
              }
            : {
                instructorName: sanitize(parsed.instructorName, 80),
                instructorTitle: parsed.instructorTitle ? sanitize(parsed.instructorTitle, 120) : null,
                instructorBio: parsed.instructorBio ? sanitize(parsed.instructorBio, 1000) : null,
              }),
          // Only overwrite when the key is present in the body.
          ...(parsed.benefits !== undefined ? { benefits: stringListToJson(parsed.benefits) } : {}),
          ...(parsed.requirements !== undefined
            ? { requirements: stringListToJson(parsed.requirements) }
            : {}),
          // Validity: Lifetime wins over months (mutually exclusive by design).
          ...(parsed.isLifetime !== undefined ? { isLifetime: parsed.isLifetime } : {}),
          ...(parsed.validityMonths !== undefined && !parsed.isLifetime
            ? { validityMonths: parsed.validityMonths }
            : parsed.isLifetime
              ? { validityMonths: null }
              : {}),
        },
      })

      // 1b) Subject assignment — full sync of the pivot (safe: pivot only,
      //     courses/lessons never touched).
      if (parsed.subjectIds !== undefined) {
        const uniqueIds = [...new Set(parsed.subjectIds)]
        const valid = await db.subject.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true },
        })
        const validIds = new Set(valid.map((s) => s.id))
        await tx.courseSubject.deleteMany({ where: { courseId: existing.id } })
        if (validIds.size > 0) {
          await tx.courseSubject.createMany({
            data: [...validIds].map((subjectId) => ({ courseId: existing.id, subjectId })),
          })
        }
      }

      // 2) delete chapters missing from the payload (cascades their lessons)
      const keepChapterIds = parsed.chapters
        .filter((c) => c.id && existingChapterIds.has(c.id))
        .map((c) => c.id as string)
      await tx.chapter.deleteMany({
        where: {
          courseId: existing.id,
          ...(keepChapterIds.length > 0 ? { id: { notIn: keepChapterIds } } : {}),
        },
      })

      // 3) upsert payload chapters + sync their lessons
      for (const ch of parsed.chapters) {
        if (ch.id && existingChapterIds.has(ch.id)) {
          const chapterId = ch.id
          await tx.chapter.update({
            where: { id: chapterId },
            data: { title: sanitize(ch.title, 120) || ch.title, order: ch.order },
          })

          const existingLessonIds = existingLessonIdsByChapter.get(chapterId) ?? new Set<string>()
          const keepLessonIds = ch.lessons
            .filter((l) => l.id && existingLessonIds.has(l.id))
            .map((l) => l.id as string)
          await tx.lesson.deleteMany({
            where: { chapterId, ...(keepLessonIds.length > 0 ? { id: { notIn: keepLessonIds } } : {}) },
          })

          for (const l of ch.lessons) {
            const lessonData = {
              title: sanitize(l.title, 120) || l.title,
              type: l.type,
              videoUrl: l.videoUrl ? sanitize(l.videoUrl, 1000) : null,
              content: l.content != null ? sanitize(l.content, 20000) : null,
              duration: l.duration ?? null,
              isPreview: l.isPreview,
              order: l.order,
            }
            if (l.id && existingLessonIds.has(l.id)) {
              await tx.lesson.update({ where: { id: l.id }, data: lessonData })
            } else {
              await tx.lesson.create({ data: { ...lessonData, chapterId } })
            }
          }
        } else {
          // New chapter (id from another course is ignored → treated as new).
          await tx.chapter.create({
            data: {
              title: sanitize(ch.title, 120) || ch.title,
              order: ch.order,
              courseId: existing.id,
              lessons: {
                create: ch.lessons.map((l) => ({
                  title: sanitize(l.title, 120) || l.title,
                  type: l.type,
                  videoUrl: l.videoUrl ? sanitize(l.videoUrl, 1000) : null,
                  content: l.content != null ? sanitize(l.content, 20000) : null,
                  duration: l.duration ?? null,
                  isPreview: l.isPreview,
                  order: l.order,
                })),
              },
            },
          })
        }
      }

      // 4) Guarantee: a course with no preview lesson gets its first video
      //     marked as free preview (admin-built courses used to save locked).
      await ensureFirstVideoPreview(existing.id)

      return tx.course.findUnique({
        where: { id: existing.id },
        include: {
          category: { select: { name: true, nameEn: true, slug: true } },
          chapters: { orderBy: { order: 'asc' }, include: { lessons: { orderBy: { order: 'asc' } } } },
          subjects: { include: { subject: { select: { id: true, name: true, nameEn: true, slug: true } } } },
        },
      })
    })

    return ok(course)
  } catch (err) {
    console.error('[PUT /api/courses/[id]]', err)
    return fail('Server error', 500)
  }
}

// ──────────────────────────────── PATCH ────────────────────────────────

/**
 * PATCH — ADMIN lightweight partial update. Used for quick toggles
 * (publish/feature), price edits, instructor blocks, benefits/requirements…
 * NEVER touches chapters/lessons (those are full-replace via PUT).
 */
const coursePatchSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(120).optional(),
  titleEn: z.string().max(120).nullable().optional(),
  subtitle: z.string().max(200).nullable().optional(),
  description: z.string().max(8000).optional(),
  price: z.number().min(0).max(1_000_000).optional(),
  discountPrice: z.number().min(0).max(1_000_000).nullable().optional(),
  level: z.enum(LEVELS).optional(),
  language: z.enum(['bn', 'en']).optional(),
  isPublished: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  thumbnail: z.string().max(500).nullable().optional(),
  instructorName: z.string().min(2, 'Instructor name must be at least 2 characters').max(80).optional(),
  instructorTitle: z.string().max(120).nullable().optional(),
  instructorBio: z.string().max(1000).nullable().optional(),
  instructorImage: z.string().max(500).nullable().optional(),
  subject: z.string().max(80).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  instructorId: z.string().min(1).nullable().optional(),
  benefits: z.array(z.string().min(1).max(200)).max(12).optional(),
  requirements: z.array(z.string().min(1).max(200)).max(12).optional(),
  isLifetime: z.boolean().optional(),
  validityMonths: z.number().int().min(1).max(60).nullable().optional(),
  subjectIds: z.array(z.string().min(1)).max(20).optional(),
})

type CoursePatchData = Partial<{
  title: string
  titleEn: string | null
  subtitle: string | null
  description: string
  price: number
  discountPrice: number | null
  level: (typeof LEVELS)[number]
  language: 'bn' | 'en'
  isPublished: boolean
  isFeatured: boolean
  thumbnail: string | null
  instructorName: string
  instructorTitle: string | null
  instructorBio: string | null
  instructorImage: string | null
  subject: string | null
  categoryId: string | null
  instructorId: string | null
  isLifetime: boolean
  validityMonths: number | null
  benefits: string
  requirements: string
}>

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const parsed = await parseBody(req, coursePatchSchema)
    if (isResponse(parsed)) return parsed

    const existing = await db.course.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: { id: true },
    })
    if (!existing) return fail('Course not found', 404)

    const data: CoursePatchData = {}

    if (parsed.title !== undefined) {
      const title = sanitize(parsed.title, 120)
      if (title.length < 2) return fail('Title must be at least 2 characters', 422)
      data.title = title
    }
    if (parsed.titleEn !== undefined) {
      data.titleEn = parsed.titleEn === null ? null : sanitize(parsed.titleEn, 120) || null
    }
    if (parsed.subtitle !== undefined) {
      data.subtitle = parsed.subtitle === null ? null : sanitize(parsed.subtitle, 200) || null
    }
    if (parsed.description !== undefined) data.description = sanitize(parsed.description, 8000)
    if (parsed.price !== undefined) data.price = parsed.price
    if (parsed.discountPrice !== undefined) data.discountPrice = parsed.discountPrice
    if (parsed.level !== undefined) data.level = parsed.level
    if (parsed.language !== undefined) data.language = parsed.language
    if (parsed.isPublished !== undefined) data.isPublished = parsed.isPublished
    if (parsed.isFeatured !== undefined) data.isFeatured = parsed.isFeatured
    if (parsed.thumbnail !== undefined) {
      data.thumbnail = parsed.thumbnail === null ? null : sanitize(parsed.thumbnail, 500) || null
    }
    if (parsed.instructorName !== undefined) {
      const instructorName = sanitize(parsed.instructorName, 80)
      if (instructorName.length < 2) {
        return fail('Instructor name must be at least 2 characters', 422)
      }
      data.instructorName = instructorName
    }
    if (parsed.instructorTitle !== undefined) {
      data.instructorTitle =
        parsed.instructorTitle === null ? null : sanitize(parsed.instructorTitle, 120) || null
    }
    if (parsed.instructorBio !== undefined) {
      data.instructorBio =
        parsed.instructorBio === null ? null : sanitize(parsed.instructorBio, 1000) || null
    }
    if (parsed.instructorImage !== undefined) {
      data.instructorImage =
        parsed.instructorImage === null ? null : sanitize(parsed.instructorImage, 500) || null
    }
    if (parsed.subject !== undefined) {
      data.subject = parsed.subject === null ? null : sanitize(parsed.subject, 80) || null
    }
    if (parsed.categoryId !== undefined) {
      if (parsed.categoryId === null) {
        data.categoryId = null
      } else {
        const cat = await db.category.findUnique({
          where: { id: parsed.categoryId },
          select: { id: true },
        })
        if (!cat) return fail('Category not found', 422)
        data.categoryId = cat.id
      }
    }
    // Instructor: null unlinks (legacy snapshot kept), a valid id re-links
    // AND syncs the display snapshot from the Instructor record.
    if (parsed.instructorId !== undefined) {
      if (parsed.instructorId === null) {
        data.instructorId = null
      } else {
        const snapshot = await resolveInstructorSnapshot(parsed.instructorId)
        if (!snapshot) return fail('Instructor not found', 422)
        data.instructorId = snapshot.instructorId
        data.instructorName = snapshot.instructorName
        data.instructorTitle = snapshot.instructorTitle
        data.instructorBio = snapshot.instructorBio
        data.instructorImage = snapshot.instructorImage
      }
    }
    if (parsed.benefits !== undefined) {
      data.benefits = stringListToJson(parsed.benefits)
    }
    if (parsed.requirements !== undefined) {
      data.requirements = stringListToJson(parsed.requirements)
    }
    if (parsed.isLifetime !== undefined) {
      data.isLifetime = parsed.isLifetime
      if (parsed.isLifetime) data.validityMonths = null // lifetime wins
    }
    if (parsed.validityMonths !== undefined && !parsed.isLifetime) {
      data.validityMonths = parsed.validityMonths
    }

    const course = await db.course.update({
      where: { id: existing.id },
      data,
      include: {
        category: { select: { name: true, nameEn: true, slug: true } },
        _count: { select: { enrollments: true, chapters: true } },
      },
    })

    // Subject assignment sync (pivot only — courses/lessons untouched).
    if (parsed.subjectIds !== undefined) {
      const uniqueIds = [...new Set(parsed.subjectIds)]
      const valid = await db.subject.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } })
      await db.courseSubject.deleteMany({ where: { courseId: existing.id } })
      if (valid.length > 0) {
        await db.courseSubject.createMany({
          data: valid.map((s) => ({ courseId: existing.id, subjectId: s.id })),
        })
      }
    }

    // Convenience parity with the list/detail contracts (read-only).
    const chapterCounts = await db.chapter.findMany({
      where: { courseId: course.id },
      select: { _count: { select: { lessons: true } } },
    })
    const lessonsTotal = chapterCounts.reduce((sum, ch) => sum + ch._count.lessons, 0)

    return ok({ ...course, lessonsTotal })
  } catch (err) {
    console.error('[PATCH /api/courses/[id]]', err)
    return fail('Server error', 500)
  }
}

// ──────────────────────────────── DELETE ────────────────────────────────

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const { id } = await params
    const existing = await db.course.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: { id: true },
    })
    if (!existing) return fail('Course not found', 404)

    await db.course.delete({ where: { id: existing.id } })
    return ok({ deleted: existing.id })
  } catch (err) {
    console.error('[DELETE /api/courses/[id]]', err)
    return fail('Server error', 500)
  }
}

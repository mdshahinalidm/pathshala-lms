/**
 * GET  /api/courses — public catalog with filters:
 *      search (title/subtitle/instructorName), category (slug), level,
 *      price ('free'|'paid'), featured=1, limit, all=1 (ADMIN only, includes drafts)
 * POST /api/courses — ADMIN creates a course, incl. nested chapters/lessons.
 *
 * Note: SQLite `contains` maps to LIKE, which is already case-insensitive for
 * ASCII; Prisma's `mode: 'insensitive'` is NOT supported on SQLite.
 */
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, getAuthUser, isResponse, ok, parseBody, requireManager, sanitize } from '@/lib/api-helpers'
import { ensureFirstVideoPreview } from '@/lib/course-preview'
import { resolveInstructorSnapshot } from '@/lib/instructors'

const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const
type Level = (typeof LEVELS)[number]

const courseCreateSchema = z.object({
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
  instructorImage: z.string().max(500).optional().nullable(),
  subject: z.string().max(80).optional().nullable(),
  benefits: z.array(z.string().min(1).max(200)).max(12).optional(),
  requirements: z.array(z.string().min(1).max(200)).max(12).optional(),
  isLifetime: z.boolean().optional(),
  validityMonths: z.number().int().min(1).max(60).optional().nullable(),
  subjectIds: z.array(z.string().min(1)).max(20).optional(),
  chapters: z
    .array(
      z.object({
        title: z.string().min(1, 'Chapter title required').max(120),
        order: z.number().int().min(0).max(1000),
        lessons: z
          .array(
            z.object({
              title: z.string().min(1, 'Lesson title required').max(120),
              type: z.enum(['VIDEO', 'PDF', 'TEXT']),
              videoUrl: z.string().max(1000).optional().nullable(),
              content: z.string().max(20000).optional().nullable(),
              duration: z.number().int().min(0).max(86_400).optional().nullable(),
              isPreview: z.boolean(),
              order: z.number().int().min(0).max(1000),
            }),
          )
          .max(200),
      }),
    )
    .max(100)
    .optional(),
})

/** Sanitize a benefits/requirements array and serialize to a JSON string column. */
function stringListToJson(items: string[] | undefined): string {
  return JSON.stringify((items ?? []).map((s) => sanitize(s, 200)).filter((s) => s.length > 0))
}

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return base || 'course'
}

/** Unique slug: base, then base-2, base-3, ... */
async function uniqueSlug(base: string): Promise<string> {
  let slug = base
  for (let n = 2; ; n++) {
    const exists = await db.course.findUnique({ where: { slug }, select: { id: true } })
    if (!exists) return slug
    slug = `${base}-${n}`
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() || ''
    const categorySlug = searchParams.get('category')?.trim() || ''
    const levelParam = searchParams.get('level')?.trim() || ''
    const price = searchParams.get('price')?.trim() || ''
    const featured = searchParams.get('featured') === '1'
    const all = searchParams.get('all') === '1'
    const limitRaw = Number(searchParams.get('limit'))
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 100) : undefined

    const viewer = await getAuthUser(req)
    const isAdmin = viewer?.role === 'ADMIN'

    const where: Prisma.CourseWhereInput = {}
    if (!all || !isAdmin) where.isPublished = true

    const level: Level | '' = (LEVELS as readonly string[]).includes(levelParam)
      ? (levelParam as Level)
      : ''
    if (level) where.level = level
    if (featured) where.isFeatured = true

    const andConditions: Prisma.CourseWhereInput[] = []
    if (search) {
      andConditions.push({
        OR: [
          { title: { contains: search } },
          { subtitle: { contains: search } },
          { instructorName: { contains: search } },
        ],
      })
    }
    // Accept both slug (deep links like ?cat=class-9) and raw category id.
    if (categorySlug) {
      andConditions.push({ OR: [{ category: { slug: categorySlug } }, { categoryId: categorySlug }] })
    }
    if (price === 'free') {
      andConditions.push({ OR: [{ price: 0 }, { discountPrice: 0 }] })
    } else if (price === 'paid') {
      andConditions.push({ OR: [{ price: { gt: 0 } }, { discountPrice: { gt: 0 } }] })
    }
    if (andConditions.length > 0) where.AND = andConditions

    const courses = await db.course.findMany({
      where,
      include: {
        category: { select: { name: true, nameEn: true, slug: true } },
        subjects: { select: { subject: { select: { name: true, nameEn: true } } } },
        _count: { select: { enrollments: true, chapters: true, reviews: true } },
      },
      orderBy: { createdAt: 'desc' },
      ...(limit ? { take: limit } : {}),
    })

    // Prisma _count cannot count through nested relations (chapters→lessons),
    // so compute lessonsTotal per course with one grouped query.
    const chapterCounts = await db.chapter.findMany({
      where: { courseId: { in: courses.map((c) => c.id) } },
      select: { courseId: true, _count: { select: { lessons: true } } },
    })
    const lessonsByCourse = new Map<string, number>()
    for (const ch of chapterCounts) {
      lessonsByCourse.set(ch.courseId, (lessonsByCourse.get(ch.courseId) || 0) + ch._count.lessons)
    }

    // Average rating per course (approved reviews only) — one grouped query.
    const ratingRows = await db.review.groupBy({
      by: ['courseId'],
      where: { courseId: { in: courses.map((c) => c.id) }, isApproved: true },
      _avg: { rating: true },
    })
    const ratingByCourse = new Map<string, number>()
    for (const r of ratingRows) {
      if (r.courseId && r._avg.rating != null) ratingByCourse.set(r.courseId, Math.round(r._avg.rating * 10) / 10)
    }

    const list = courses.map((c) => {
      // Subject is always English — prefer pivot subjects (set from the course
      // builder), fall back to the legacy free-text column.
      const pivotNames = (c.subjects ?? [])
        .map((cs) => cs.subject.nameEn || cs.subject.name)
        .filter(Boolean)
      return {
        ...c,
        subject: pivotNames.length > 0 ? pivotNames.join(', ') : c.subject,
        categoryName: c.category?.name ?? null,
        lessonsTotal: lessonsByCourse.get(c.id) ?? 0,
        ratingAvg: ratingByCourse.get(c.id) ?? null,
      }
    })
    return ok(list)
  } catch (err) {
    console.error('[GET /api/courses]', err)
    return fail('Server error', 500)
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const parsed = await parseBody(req, courseCreateSchema)
    if (isResponse(parsed)) return parsed

    const title = sanitize(parsed.title, 120)
    if (title.length < 2) return fail('Title must be at least 2 characters', 422)

    let categoryId: string | null = null
    if (parsed.categoryId) {
      const cat = await db.category.findUnique({ where: { id: parsed.categoryId }, select: { id: true } })
      if (!cat) return fail('Category not found', 422)
      categoryId = cat.id
    }

    // Instructor: selected from Admin → Instructors (dropdown). When set, the
    // profile snapshot is synced from the Instructor record — the legacy
    // free-text fields stay untouched otherwise (backward compatible).
    const instructor = await resolveInstructorSnapshot(parsed.instructorId)
    if (parsed.instructorId && !instructor) return fail('Instructor not found', 422)

    const slug = await uniqueSlug(slugify(title))

    const course = await db.course.create({
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
              instructorImage: instructor.instructorImage,
            }
          : {
              instructorName: sanitize(parsed.instructorName, 80),
              instructorTitle: parsed.instructorTitle ? sanitize(parsed.instructorTitle, 120) : null,
              instructorBio: parsed.instructorBio ? sanitize(parsed.instructorBio, 1000) : null,
              instructorImage: parsed.instructorImage ? sanitize(parsed.instructorImage, 500) : null,
            }),
        subject: parsed.subject ? sanitize(parsed.subject, 80) : null,
        benefits: stringListToJson(parsed.benefits),
        requirements: stringListToJson(parsed.requirements),
        isLifetime: parsed.isLifetime ?? false,
        validityMonths: parsed.isLifetime ? null : parsed.validityMonths ?? null,
        slug,
        ...(parsed.subjectIds && parsed.subjectIds.length > 0
          ? {
              subjects: {
                create: [...new Set(parsed.subjectIds)].map((subjectId) => ({ subjectId })),
              },
            }
          : {}),
        chapters: {
          create: (parsed.chapters ?? []).map((ch) => ({
            title: sanitize(ch.title, 120) || ch.title,
            order: ch.order,
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
          })),
        },
      },
      include: {
        category: { select: { name: true, nameEn: true, slug: true } },
        chapters: { orderBy: { order: 'asc' }, include: { lessons: { orderBy: { order: 'asc' } } } },
      },
    })
    const lessonsTotal = course.chapters.reduce((n, ch) => n + ch.lessons.length, 0)
    // Guarantee: a course with no preview lesson gets its first video marked
    // as free preview (admin-built courses used to save 100% locked).
    await ensureFirstVideoPreview(course.id)
    return ok({ ...course, lessonsTotal })
  } catch (err) {
    console.error('[POST /api/courses]', err)
    return fail('Server error', 500)
  }
}

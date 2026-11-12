/**
 * /api/notices — notice board.
 *
 * GET  ?banner=1 → latest 6 banner titles {id,title} (home marquee)
 *      default   → latest 50 full notices
 * POST (admin) create notice + broadcast a Notification to every
 *      non-blocked STUDENT.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  fail,
  requireManager,
  isResponse,
  parseBody,
  sanitize,
} from '@/lib/api-helpers'

const noticeSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(150),
  body: z.string().min(10, 'Body must be at least 10 characters').max(4000),
  type: z.enum(['URGENT', 'GENERAL', 'EVENT']),
  isBanner: z.boolean(),
  imageUrl: z.string().max(600).optional(),
  pdfUrl: z.string().max(600).optional(),
  pdfName: z.string().max(200).optional(),
})

/** GET /api/notices */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const bannerOnly = url.searchParams.get('banner') === '1'

    if (bannerOnly) {
      const banners = await db.notice.findMany({
        where: { isBanner: true },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, title: true },
      })
      return ok(banners)
    }

    const notices = await db.notice.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return ok(notices)
  } catch (err) {
    console.error('[GET /api/notices]', err)
    return fail('Server error', 500)
  }
}

/** POST /api/notices (admin) */
export async function POST(req: Request) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const body = await parseBody(req, noticeSchema)
    if (isResponse(body)) return body

    const title = sanitize(body.title, 150)
    const text = sanitize(body.body, 4000)
    if (title.length < 3 || text.length < 10) {
      return fail('Title/body is invalid after sanitization', 422)
    }
    const imageUrl = body.imageUrl ? sanitize(body.imageUrl, 600) : null
    const pdfUrl = body.pdfUrl ? sanitize(body.pdfUrl, 600) : null
    const pdfName = body.pdfName ? sanitize(body.pdfName, 200) : null

    const notice = await db.notice.create({
      data: {
        title,
        body: text,
        type: body.type,
        isBanner: body.isBanner,
        imageUrl: imageUrl || null,
        pdfUrl: pdfUrl || null,
        pdfName: pdfName || null,
      },
    })

    // Broadcast to every non-blocked student.
    const students = await db.user.findMany({
      where: { role: 'STUDENT', isBlocked: false },
      select: { id: true },
    })
    let notifiedCount = 0
    if (students.length > 0) {
      const res = await db.notification.createMany({
        data: students.map((s) => ({
          userId: s.id,
          type: 'NOTICE',
          title: `📢 ${notice.title}`,
          body: notice.body.slice(0, 160),
          link: '/notices',
        })),
      })
      notifiedCount = res.count
    }

    return ok({ ...notice, notifiedCount })
  } catch (err) {
    console.error('[POST /api/notices]', err)
    return fail('Server error', 500)
  }
}

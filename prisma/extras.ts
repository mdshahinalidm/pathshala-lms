/**
 * Extras seed — demo Coupons + LiveClasses (idempotent upserts).
 * Run: bun prisma/extras.ts   (safe to re-run; never deletes existing data)
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // ── Coupons ──
  await db.coupon.upsert({
    where: { code: 'FIRST50' },
    update: {},
    create: {
      code: 'FIRST50',
      type: 'PERCENT',
      value: 50,
      minAmount: 500,
      maxUses: 500,
      isActive: true,
    },
  })
  await db.coupon.upsert({
    where: { code: 'SAVE200' },
    update: {},
    create: {
      code: 'SAVE200',
      type: 'FIXED',
      value: 200,
      minAmount: 1000,
      maxUses: null,
      isActive: true,
    },
  })

  // ── Live classes (attach to two seeded courses) ──
  const physics = await db.course.findUnique({ where: { slug: 'ssc-physics' } })
  const webdev = await db.course.findUnique({ where: { slug: 'web-development' } })

  const upcoming = (days: number, hour: number) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(hour, 0, 0, 0)
    return d
  }

  if (physics) {
    const exists = await db.liveClass.findFirst({ where: { courseId: physics.id, title: { contains: 'মাসিক লাইভ সমাধান' } } })
    if (!exists) {
      await db.liveClass.create({
        data: {
          title: 'এসএসসি পদার্থবিজ্ঞান — মাসিক লাইভ সমাধান ক্লাস',
          provider: 'ZOOM',
          joinUrl: 'https://zoom.us/j/1234567890',
          scheduledAt: upcoming(3, 19),
          durationMin: 90,
          notes: 'অধ্যায় ১-৪ এর বোর্ড প্রশ্ন সমাধান + প্রশ্নোত্তর সেশন।',
          courseId: physics.id,
          isPublished: true,
        },
      })
    }
  }
  if (webdev) {
    const exists = await db.liveClass.findFirst({ where: { courseId: webdev.id, title: { contains: 'Career Q&A' } } })
    if (!exists) {
      await db.liveClass.create({
        data: {
          title: 'ওয়েব ডেভেলপমেন্ট — Career Q&A Live',
          provider: 'MEET',
          joinUrl: 'https://meet.google.com/abc-defg-hij',
          scheduledAt: upcoming(5, 20),
          durationMin: 60,
          notes: 'পোর্টফোলিও রিভিউ + জব ইন্টারভিউ প্রস্তুতি টিপস।',
          courseId: webdev.id,
          isPublished: true,
        },
      })
    }
  }

  const coupons = await db.coupon.count()
  const lives = await db.liveClass.count()
  console.log(`[extras] coupons: ${coupons}, liveClasses: ${lives} ✓`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())

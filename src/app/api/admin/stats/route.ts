/**
 * /api/admin/stats — dashboard analytics for admins (v3).
 *
 * v2 shape (PRESERVED, all fields unchanged):
 * totals               → revenue, sales, students, courses, enrollments,
 *                        pendingOrders, materials  +  drafts, unreadMessages
 * salesByDay           → last 14 days (today inclusive), Bangla short labels
 *                        ({date,label,count,revenue} — v1 shape preserved)
 * enrollmentsByDay     → last 14 days (today inclusive) enrollment counts
 *                        ({day:'MM-DD', label, count})
 * revenueByCourse      → top 5 courses by successful-order revenue
 * categoryDistribution → enrollments per course category
 * recentOrders         → latest 8 orders (any status) with user + course
 *
 * v3 additions:
 * revenueToday / revenueWeek / revenueMonth  → SUCCESS-order revenue inside
 *   three windows computed with the SERVER'S LOCAL time:
 *     today → since local midnight (00:00) of the current day
 *     week  → ROLLING last 7 days (now − 7d … now)
 *     month → ROLLING last 30 days (now − 30d … now)
 *   (Bangla display labels are handled client-side.)
 * ordersToday / ordersWeek / ordersMonth      → SUCCESS-order counts in the
 *   same three windows.
 * activeStudents        → STUDENT-role users having ≥1 enrollment
 * monthlySales          → last 6 CALENDAR months (current month inclusive)
 *                        [{month:'2025-05', label:'মে', count, revenue}]
 *                        — label = Bangla short month from BN_MONTHS
 * recentActivity        → latest 12 events merged from (a) SUCCESS orders
 *                        → 'purchase', (b) reviews → 'review', (c)
 *                        enrollments → 'enrollment'; newest first; shape
 *                        {id, type, userName, itemTitle, amount?, createdAt}
 *
 * v4 additions (Admin Analytics page — READ-ONLY, computed with read-only
 * Prisma queries; no v2/v3 field is touched):
 * series.revenueDaily    → last 30 days (today inclusive), daily SUCCESS
 *                          revenue summed across ALL paid product kinds
 *                          (course orders + exam purchases + suggestion
 *                          purchases + combo purchases)
 *                          [{date:'MM-DD', label:'3 অক্টো', revenue}]
 * series.enrollmentsDaily → last 30 days daily enrollment counts
 *                          [{date:'MM-DD', label, count}]
 * series.topCourses      → top 8 courses by lifetime enrollment count
 *                          [{title, enrollments}]
 * series.revenueByType   → lifetime SUCCESS revenue per product kind
 *                          [{type:'courses'|'exams'|'suggestions'|'combos',
 *                            revenue}]
 * series.studentsByClass → STUDENT headcount per class key (all 9 taxonomy
 *                          keys in order + 'NOT_SET' for unset class)
 *                          [{key:'CLASS_9', count}]
 */
import { db } from '@/lib/db'
import { ok, fail, requireAdmin, isResponse } from '@/lib/api-helpers'
import { CLASS_OPTIONS } from '@/lib/student-classes'

/** Bangla short month labels, Jan..Dec. */
const BN_MONTHS = [
  'জানু', 'ফেব', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্ট', 'অক্টো', 'নভে', 'ডিসে',
]

const DAY_MS = 24 * 60 * 60 * 1000

/** Local-date key "MM-DD". */
function dayKey(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Local calendar-month key "YYYY-MM". */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface ActivityEvent {
  id: string
  type: 'purchase' | 'review' | 'enrollment'
  userName: string
  itemTitle: string
  amount?: number
  createdAt: string // ISO
}

/** GET /api/admin/stats (admin) */
export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const now = new Date()
    // ── v3 revenue windows (server-local time) ──
    // today → local midnight; week → rolling 7 days; month → rolling 30 days.
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(now.getTime() - 7 * DAY_MS)
    const monthStart = new Date(now.getTime() - 30 * DAY_MS)
    /** SUCCESS orders created at/after `gte`. */
    const successSince = (gte: Date) => ({ status: 'SUCCESS', createdAt: { gte } })

    // ── Totals + v3 window aggregates (single parallel round-trip) ──
    const [
      revenueAgg, sales, students, courses, enrollments, pendingOrders, materials, drafts,
      unreadMessages, todayAgg, weekAgg, monthAgg, ordersToday, ordersWeek, ordersMonth,
      activeStudents,
    ] = await Promise.all([
      db.order.aggregate({ _sum: { amount: true }, where: { status: 'SUCCESS' } }),
      db.order.count({ where: { status: 'SUCCESS' } }),
      db.user.count({ where: { role: 'STUDENT' } }),
      db.course.count(),
      db.enrollment.count(),
      db.order.count({ where: { status: 'PENDING' } }),
      db.suggestion.count(),
      db.course.count({ where: { isPublished: false } }),
      db.contactMessage.count({ where: { isRead: false } }),
      db.order.aggregate({ _sum: { amount: true }, where: successSince(startOfToday) }),
      db.order.aggregate({ _sum: { amount: true }, where: successSince(weekStart) }),
      db.order.aggregate({ _sum: { amount: true }, where: successSince(monthStart) }),
      db.order.count({ where: successSince(startOfToday) }),
      db.order.count({ where: successSince(weekStart) }),
      db.order.count({ where: successSince(monthStart) }),
      // v3: STUDENT-role users having at least one enrollment
      db.user.count({ where: { role: 'STUDENT', enrollments: { some: {} } } }),
    ])
    const totals = {
      revenue: Math.round(revenueAgg._sum.amount ?? 0),
      sales,
      students,
      courses,
      enrollments,
      pendingOrders,
      materials,
      drafts,
      unreadMessages,
    }
    const revenueToday = Math.round(todayAgg._sum.amount ?? 0)
    const revenueWeek = Math.round(weekAgg._sum.amount ?? 0)
    const revenueMonth = Math.round(monthAgg._sum.amount ?? 0)

    // ── 30-day window (today inclusive) — shared fetches. The 14-day
    // v2 series below still bucket only their own 14 keys, so widening the
    // fetch window is output-neutral for them while letting the v4 30-day
    // series reuse the same rows (fewer round-trips).
    const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
    const [recentSuccessOrders, recentEnrollments] = await Promise.all([
      db.order.findMany({
        where: { status: 'SUCCESS', createdAt: { gte: rangeStart } },
        select: { amount: true, createdAt: true },
      }),
      db.enrollment.findMany({
        where: { enrolledAt: { gte: rangeStart } },
        select: { enrolledAt: true },
      }),
    ])

    const salesByDay: { date: string; label: string; count: number; revenue: number }[] = []
    const enrollmentsByDay: { day: string; label: string; count: number }[] = []
    const salesBuckets = new Map<string, { count: number; revenue: number }>()
    const enrollBuckets = new Map<string, number>()
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13 + i)
      const key = dayKey(d)
      salesBuckets.set(key, { count: 0, revenue: 0 })
      enrollBuckets.set(key, 0)
      salesByDay.push({
        date: key,
        label: `${d.getDate()} ${BN_MONTHS[d.getMonth()]}`,
        count: 0,
        revenue: 0,
      })
      enrollmentsByDay.push({
        day: key,
        label: `${d.getDate()} ${BN_MONTHS[d.getMonth()]}`,
        count: 0,
      })
    }
    // salesByDay entries hold copied primitives — write through the map instead.
    for (const o of recentSuccessOrders) {
      const bucket = salesBuckets.get(dayKey(o.createdAt))
      if (bucket) {
        bucket.count += 1
        bucket.revenue += o.amount
      }
    }
    for (const day of salesByDay) {
      const bucket = salesBuckets.get(day.date)!
      day.count = bucket.count
      day.revenue = Math.round(bucket.revenue)
    }
    for (const e of recentEnrollments) {
      const key = dayKey(e.enrolledAt)
      enrollBuckets.set(key, (enrollBuckets.get(key) ?? 0) + 1)
    }
    for (const day of enrollmentsByDay) {
      day.count = enrollBuckets.get(day.day) ?? 0
    }

    // ── v4 series: 30-day revenue trend across every paid product kind ──
    // Paid = payment rows with status SUCCESS. The course-order rows are the
    // recentSuccessOrders fetched above; the other three kinds are fetched
    // for the same 30-day window.
    const [examRows, suggestionRows, comboRows] = await Promise.all([
      db.examPurchase.findMany({
        where: { status: 'SUCCESS', createdAt: { gte: rangeStart } },
        select: { amount: true, createdAt: true },
      }),
      db.suggestionPurchase.findMany({
        where: { status: 'SUCCESS', createdAt: { gte: rangeStart } },
        select: { amount: true, createdAt: true },
      }),
      db.comboPurchase.findMany({
        where: { status: 'SUCCESS', createdAt: { gte: rangeStart } },
        select: { amount: true, createdAt: true },
      }),
    ])

    const revenueDaily: { date: string; label: string; revenue: number }[] = []
    const revenueBuckets = new Map<string, number>()
    for (let i = 0; i < 30; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29 + i)
      const key = dayKey(d)
      revenueBuckets.set(key, 0)
      revenueDaily.push({
        date: key,
        label: `${d.getDate()} ${BN_MONTHS[d.getMonth()]}`,
        revenue: 0,
      })
    }
    const addDailyRevenue = (rows: { amount: number; createdAt: Date }[]) => {
      for (const r of rows) {
        const key = dayKey(r.createdAt)
        if (revenueBuckets.has(key)) {
          revenueBuckets.set(key, (revenueBuckets.get(key) ?? 0) + r.amount)
        }
      }
    }
    addDailyRevenue(recentSuccessOrders)
    addDailyRevenue(examRows)
    addDailyRevenue(suggestionRows)
    addDailyRevenue(comboRows)
    for (const d of revenueDaily) {
      d.revenue = Math.round(revenueBuckets.get(d.date) ?? 0)
    }

    // ── v4 series: 30-day daily enrollments (shared enrollment fetch) ──
    const enrollmentsDaily: { date: string; label: string; count: number }[] = []
    const enrollBuckets30 = new Map<string, number>()
    for (let i = 0; i < 30; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29 + i)
      const key = dayKey(d)
      enrollBuckets30.set(key, 0)
      enrollmentsDaily.push({
        date: key,
        label: `${d.getDate()} ${BN_MONTHS[d.getMonth()]}`,
        count: 0,
      })
    }
    for (const e of recentEnrollments) {
      const key = dayKey(e.enrolledAt)
      if (enrollBuckets30.has(key)) {
        enrollBuckets30.set(key, (enrollBuckets30.get(key) ?? 0) + 1)
      }
    }
    for (const d of enrollmentsDaily) {
      d.count = enrollBuckets30.get(d.date) ?? 0
    }

    // ── v4 series: top 8 courses by lifetime enrollment count ──
    const enrollGroups = await db.enrollment.groupBy({
      by: ['courseId'],
      _count: { courseId: true },
      orderBy: { _count: { courseId: 'desc' } },
      take: 8,
    })
    const topCourseRows = enrollGroups.length
      ? await db.course.findMany({
          where: { id: { in: enrollGroups.map((g) => g.courseId) } },
          select: { id: true, title: true },
        })
      : []
    const topCourseTitleMap = new Map(topCourseRows.map((c) => [c.id, c.title]))
    const topCourses = enrollGroups.map((g) => ({
      title: topCourseTitleMap.get(g.courseId) ?? 'Unknown course',
      enrollments: g._count.courseId,
    }))

    // ── v4 series: lifetime SUCCESS revenue split by product kind ──
    const [courseAgg, examAgg, suggestionAgg, comboAgg] = await Promise.all([
      db.order.aggregate({ _sum: { amount: true }, where: { status: 'SUCCESS' } }),
      db.examPurchase.aggregate({ _sum: { amount: true }, where: { status: 'SUCCESS' } }),
      db.suggestionPurchase.aggregate({ _sum: { amount: true }, where: { status: 'SUCCESS' } }),
      db.comboPurchase.aggregate({ _sum: { amount: true }, where: { status: 'SUCCESS' } }),
    ])
    const revenueByType = [
      { type: 'courses', revenue: Math.round(courseAgg._sum.amount ?? 0) },
      { type: 'exams', revenue: Math.round(examAgg._sum.amount ?? 0) },
      { type: 'suggestions', revenue: Math.round(suggestionAgg._sum.amount ?? 0) },
      { type: 'combos', revenue: Math.round(comboAgg._sum.amount ?? 0) },
    ]

    // ── v4 series: STUDENT headcount per class key (taxonomy order + NOT_SET) ──
    const classGroups = await db.user.groupBy({
      by: ['studentClass'],
      where: { role: 'STUDENT' },
      _count: { _all: true },
    })
    const classCountMap = new Map(
      classGroups.map((g) => [g.studentClass ?? 'NOT_SET', g._count._all])
    )
    const studentsByClass = [
      ...CLASS_OPTIONS.map((c) => ({ key: c.value, count: classCountMap.get(c.value) ?? 0 })),
      { key: 'NOT_SET', count: classCountMap.get('NOT_SET') ?? 0 },
    ]

    // ── v3 monthlySales: last 6 calendar months (current month inclusive) ──
    // month = 'YYYY-MM', label = Bangla short month; buckets are pre-seeded so
    // empty months still render as zero-bars on the client chart.
    const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const [monthlyOrders, actOrders, actReviews, actEnrollments] = await Promise.all([
      db.order.findMany({
        where: { status: 'SUCCESS', createdAt: { gte: sixMonthsStart } },
        select: { amount: true, createdAt: true },
      }),
      // ── v3 recentActivity inputs: latest 12 of each event kind ──
      db.order.findMany({
        where: { status: 'SUCCESS' },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          id: true,
          amount: true,
          createdAt: true,
          user: { select: { name: true } },
          course: { select: { title: true } },
        },
      }),
      db.review.findMany({
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: { id: true, userName: true, createdAt: true, course: { select: { title: true } } },
      }),
      db.enrollment.findMany({
        orderBy: { enrolledAt: 'desc' },
        take: 12,
        select: {
          id: true,
          enrolledAt: true,
          user: { select: { name: true } },
          course: { select: { title: true } },
        },
      }),
    ])

    const monthBuckets = new Map<string, { count: number; revenue: number }>()
    const monthlySales: { month: string; label: string; count: number; revenue: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = monthKey(d)
      monthBuckets.set(key, { count: 0, revenue: 0 })
      monthlySales.push({ month: key, label: BN_MONTHS[d.getMonth()], count: 0, revenue: 0 })
    }
    for (const o of monthlyOrders) {
      const bucket = monthBuckets.get(monthKey(o.createdAt))
      if (bucket) {
        bucket.count += 1
        bucket.revenue += o.amount
      }
    }
    for (const m of monthlySales) {
      const bucket = monthBuckets.get(m.month)!
      m.count = bucket.count
      m.revenue = Math.round(bucket.revenue)
    }

    // ── v3 recentActivity: merge purchase / review / enrollment, newest first ──
    const recentActivity: ActivityEvent[] = [
      ...actOrders.map((o) => ({
        id: o.id,
        type: 'purchase' as const,
        userName: o.user?.name ?? '—',
        itemTitle: o.course?.title ?? '—',
        amount: Math.round(o.amount),
        createdAt: o.createdAt.toISOString(),
      })),
      ...actReviews.map((r) => ({
        id: r.id,
        type: 'review' as const,
        userName: r.userName,
        itemTitle: r.course?.title ?? '—',
        createdAt: r.createdAt.toISOString(),
      })),
      ...actEnrollments.map((e) => ({
        id: e.id,
        type: 'enrollment' as const,
        userName: e.user?.name ?? '—',
        itemTitle: e.course?.title ?? '—',
        createdAt: e.enrolledAt.toISOString(),
      })),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12)

    // ── revenueByCourse: top 5 by SUCCESS revenue ──
    const grouped = await db.order.groupBy({
      by: ['courseId'],
      where: { status: 'SUCCESS' },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    })
    const top5 = grouped.slice(0, 5)
    const coursesForTitles = top5.length
      ? await db.course.findMany({
          where: { id: { in: top5.map((g) => g.courseId) } },
          select: { id: true, title: true },
        })
      : []
    const titleMap = new Map(coursesForTitles.map((c) => [c.id, c.title]))
    const revenueByCourse = top5.map((g) => ({
      title: titleMap.get(g.courseId) ?? 'Unknown course',
      revenue: Math.round(g._sum.amount ?? 0),
    }))

    // ── categoryDistribution: enrollments per category name ──
    const enrolledCourses = await db.enrollment.findMany({
      select: { course: { select: { category: { select: { name: true } } } } },
    })
    const catCounts = new Map<string, number>()
    for (const e of enrolledCourses) {
      const name = e.course?.category?.name ?? 'অন্যান্য'
      catCounts.set(name, (catCounts.get(name) ?? 0) + 1)
    }
    const categoryDistribution = [...catCounts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    // ── recentOrders: latest 8 (any status) for the orders table ──
    const recentOrders = await db.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        trxId: true,
        amount: true,
        method: true,
        status: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
        course: { select: { title: true } },
      },
    })

    return ok({
      totals,
      salesByDay,
      enrollmentsByDay,
      revenueByCourse,
      categoryDistribution,
      recentOrders,
      // ── v3 additions ──
      revenueToday,
      revenueWeek,
      revenueMonth,
      ordersToday,
      ordersWeek,
      ordersMonth,
      activeStudents,
      monthlySales,
      recentActivity,
      // ── v4 analytics series (Admin Analytics page) ──
      series: {
        revenueDaily,
        enrollmentsDaily,
        topCourses,
        revenueByType,
        studentsByClass,
      },
    })
  } catch (err) {
    console.error('[GET /api/admin/stats]', err)
    return fail('Server error', 500)
  }
}

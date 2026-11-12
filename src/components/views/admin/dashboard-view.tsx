'use client'

/**
 * DashboardView (admin home) — "Earnings & Overview" strip on top, fed by
 * GET /api/admin/stats v3:
 *   • 3 live revenue counters — আজ / এই সপ্তাহ / এই মাস (revenueToday/Week/Month
 *     + ordersToday/Week/Month), big Bangla ৳ amounts with emerald/amber accents
 *   • Active-students card (activeStudents) + total courses
 *   • 6-month sales chart (monthlySales — revenue bars + order-count line)
 *   • Recent-activity feed (recentActivity: purchase / review / enrollment)
 * The proven analytics sections (KPI cards, 14-day charts, category pie,
 * revenue-by-course ranking, recent orders) keep rendering below unchanged
 * via <AnalyticsView />.
 */
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  CalendarDays,
  GraduationCap,
  RefreshCcw,
  ShieldX,
  ShoppingBag,
  ShoppingCart,
  Star,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import AnalyticsView from '@/components/views/admin/analytics-view'
import { apiGet } from '@/lib/api-client'
import { digitsBn, fmtBDT } from '@/lib/format'
import type { Lang } from '@/lib/i18n'
import { useAuth } from '@/store/auth-store'
import { useUI } from '@/store/ui-store'
import { isPanelRole } from '@/lib/roles'

/* ── Types (v3 stats additions) ── */

interface MonthlyPoint {
  month: string
  label: string
  count: number
  revenue: number
}
interface ActivityEvent {
  id: string
  type: 'purchase' | 'review' | 'enrollment'
  userName: string
  itemTitle: string
  amount?: number
  createdAt: string
}
interface DashboardStats {
  revenueToday: number
  revenueWeek: number
  revenueMonth: number
  ordersToday: number
  ordersWeek: number
  ordersMonth: number
  activeStudents: number
  monthlySales: MonthlyPoint[]
  recentActivity: ActivityEvent[]
  totals: {
    students: number
    courses: number
    revenue: number
    enrollments: number
    sales: number
    pendingOrders: number
    materials: number
  }
}

/* Platform-totals KPI tones (Colorful 2.0 — matches the analytics KPI kit) */
const TOTALS_KPI = [
  { bar: 'grad-emerald', chip: 'grad-emerald shadow-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400' },
  { bar: 'grad-violet', chip: 'grad-violet shadow-violet-500/30', text: 'text-violet-600 dark:text-violet-400' },
  { bar: 'grad-amber', chip: 'grad-amber shadow-amber-500/30', text: 'text-amber-600 dark:text-amber-400' },
  { bar: 'grad-rose', chip: 'grad-rose shadow-rose-500/30', text: 'text-rose-600 dark:text-rose-400' },
] as const

/** Platform-totals card — same design as the analytics KpiCard. */
function TotalsKpiCard({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  index,
}: {
  icon: LucideIcon
  tone: (typeof TOTALS_KPI)[number]
  label: string
  value: string
  sub: React.ReactNode
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.07 }}
    >
      <Card className="relative overflow-hidden">
        <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${tone.bar}`} />
        <CardContent className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold tracking-tight ${tone.text}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md ${tone.chip}`}
          >
            <Icon className="h-5 w-5" />
          </span>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ── Helpers ── */

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--popover)',
  color: 'var(--popover-foreground)',
  fontSize: 12,
  boxShadow: '0 10px 30px rgb(0 0 0 / 0.10)',
} as const

/** 1490 → "৳১,৪৯০" — Bangla digits with Indian-style grouping. */
function bdtBn(n: number): string {
  return `৳${digitsBn(Math.round(n).toLocaleString('en-IN'))}`
}

/** Relative time — '৫ মিনিট আগে' / '5 min ago'. */
function timeAgo(iso: string, lang: Lang): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (lang === 'bn') {
    if (mins < 1) return 'এইমাত্র'
    if (mins < 60) return `${digitsBn(mins)} মিনিট আগে`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${digitsBn(hrs)} ঘণ্টা আগে`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${digitsBn(days)} দিন আগে`
    return `${digitsBn(Math.floor(days / 30))} মাস আগে`
  }
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`
  const months = Math.floor(days / 30)
  return `${months} month${months > 1 ? 's' : ''} ago`
}

/** One activity-feed line — "রাকিব — এসএসসি পদার্থবিজ্ঞান কিনেছে (৳১,৪৯০)". */
function activityLine(ev: ActivityEvent, lang: Lang): string {
  if (ev.type === 'purchase') {
    const amt = ev.amount !== undefined ? ` (${bdtBn(ev.amount)})` : ''
    return lang === 'bn'
      ? `${ev.userName} — ${ev.itemTitle} কিনেছে${amt}`
      : `${ev.userName} purchased ${ev.itemTitle}${amt}`
  }
  if (ev.type === 'review') {
    return lang === 'bn'
      ? `${ev.userName} — ${ev.itemTitle}-এ রিভিউ দিয়েছে`
      : `${ev.userName} reviewed ${ev.itemTitle}`
  }
  return lang === 'bn'
    ? `${ev.userName} — ${ev.itemTitle}-এ ভর্তি হয়েছে`
    : `${ev.userName} enrolled in ${ev.itemTitle}`
}

const ACT_META: Record<ActivityEvent['type'], { icon: LucideIcon; cls: string }> = {
  purchase: {
    icon: ShoppingBag,
    cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  review: {
    icon: Star,
    cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  enrollment: {
    icon: UserPlus,
    cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
}

/* ── Small components ── */

function AccessDenied() {
  const { tx } = useUI()
  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldX className="h-7 w-7" />
        </span>
        <h2 className="text-lg font-semibold">{tx('প্রবেশাধিকার নেই', 'Access denied')}</h2>
        <p className="text-sm text-muted-foreground">
          {tx('এই পেজটি শুধুমাত্র অ্যাডমিনদের জন্য।', 'This page is for administrators only.')}
        </p>
      </CardContent>
    </Card>
  )
}

function RevenueCard({
  icon: Icon,
  tint,
  label,
  amount,
  orders,
  index,
}: {
  icon: LucideIcon
  tint: string
  label: string
  amount: number
  orders: number
  index: number
}) {
  const { tx } = useUI()
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.07 }}
    >
      <Card className="relative overflow-hidden">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: `linear-gradient(90deg, ${tint}, transparent)` }}
        />
        <CardContent className="flex items-start justify-between gap-3 pt-5">
          <div className="min-w-0 space-y-1">
            <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{bdtBn(amount)}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                +{digitsBn(orders)}
              </span>{' '}
              {tx('টি অর্ডার', 'orders')}
            </p>
          </div>
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
            style={{ backgroundImage: `linear-gradient(135deg, ${tint}, ${tint}99)` }}
          >
            <Icon className="h-5 w-5" />
          </span>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function ActiveStudentsCard({
  active,
  totalStudents,
  courses,
  index,
}: {
  active: number
  totalStudents: number
  courses: number
  index: number
}) {
  const { tx } = useUI()
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.07 }}
    >
      <Card className="relative overflow-hidden">
        <span
          aria-hidden
          className="grad-violet absolute inset-x-0 top-0 h-1"
        />
        <CardContent className="flex items-start justify-between gap-3 pt-5">
          <div className="min-w-0 space-y-1">
            <p className="truncate text-xs font-medium text-muted-foreground">
              {tx('সক্রিয় শিক্ষার্থী', 'Active students')}
            </p>
            <p className="grad-text-festive text-2xl font-bold tracking-tight">{digitsBn(active)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {digitsBn(courses)} {tx('টি কোর্স', 'courses')} ·{' '}
              {tx('মোট', 'of')} {digitsBn(totalStudents)} {tx('জন', '')}
            </p>
          </div>
          <span className="grad-violet flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md">
            <Users className="h-5 w-5" />
          </span>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ── Main view ── */

export default function DashboardView() {
  const { user, status, initialized } = useAuth()
  const { lang, tx } = useUI()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiGet<DashboardStats>('/api/admin/stats')
      setStats(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return <AccessDenied />
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <Skeleton className="h-80 rounded-2xl lg:col-span-3" />
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
        </div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-7 w-7" />
          </span>
          <h2 className="text-lg font-semibold">{tx('সমস্যা হয়েছে', 'Something went wrong')}</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button className="mt-2 gap-2" onClick={() => void load()}>
            <RefreshCcw className="h-4 w-4" /> {tx('আবার চেষ্টা', 'Retry')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Earnings & Overview ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">
            {tx('আয়ের হিসাব ও ওভারভিউ', 'Earnings & Overview')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'রিয়েল-টাইম আয়, সক্রিয় শিক্ষার্থী ও সাম্প্রতিক কার্যক্রম',
              'Live revenue, active students and recent activity'
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => void load()}>
          <RefreshCcw className="h-4 w-4" /> {tx('রিফ্রেশ', 'Refresh')}
        </Button>
      </div>

      {/* Live revenue counters + active students */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <RevenueCard
          index={0}
          icon={Wallet}
          tint="#10b981"
          label={tx('আজ', 'Today')}
          amount={stats.revenueToday}
          orders={stats.ordersToday}
        />
        <RevenueCard
          index={1}
          icon={CalendarDays}
          tint="#f59e0b"
          label={tx('এই সপ্তাহ', 'This week')}
          amount={stats.revenueWeek}
          orders={stats.ordersWeek}
        />
        <RevenueCard
          index={2}
          icon={TrendingUp}
          tint="#14b8a6"
          label={tx('এই মাস', 'This month')}
          amount={stats.revenueMonth}
          orders={stats.ordersMonth}
        />
        <ActiveStudentsCard
          index={3}
          active={stats.activeStudents}
          totalStudents={stats.totals.students}
          courses={stats.totals.courses}
        />
      </div>

      {/* ── Platform totals (মোট আয় / বিক্রয় / শিক্ষার্থী / এনরোলমেন্ট) ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TotalsKpiCard
          index={0}
          icon={TrendingUp}
          tone={TOTALS_KPI[0]}
          label={tx('মোট আয়', 'Total Revenue')}
          value={bdtBn(stats.totals.revenue)}
          sub={
            <span className="font-medium text-amber-600 dark:text-amber-400">
              +{digitsBn(stats.totals.pendingOrders)} {tx('পেন্ডিং', 'pending')}
            </span>
          }
        />
        <TotalsKpiCard
          index={1}
          icon={ShoppingCart}
          tone={TOTALS_KPI[1]}
          label={tx('মোট বিক্রয়', 'Total Sales')}
          value={digitsBn(stats.totals.sales)}
          sub={
            <span>
              {digitsBn(stats.totals.courses)} {tx('টি কোর্স তালিকাভুক্ত', 'courses listed')}
            </span>
          }
        />
        <TotalsKpiCard
          index={2}
          icon={Users}
          tone={TOTALS_KPI[2]}
          label={tx('মোট শিক্ষার্থী', 'Total Students')}
          value={digitsBn(stats.totals.students)}
          sub={
            <span>
              {digitsBn(stats.totals.materials)} {tx('টি সাজেশন', 'suggestions')}
            </span>
          }
        />
        <TotalsKpiCard
          index={3}
          icon={GraduationCap}
          tone={TOTALS_KPI[3]}
          label={tx('সক্রিয় এনরোলমেন্ট', 'Active Enrollments')}
          value={digitsBn(stats.totals.enrollments)}
          sub={
            <span>
              {digitsBn(stats.totals.courses)} {tx('টি কোর্সে সক্রিয়', 'across courses')}
            </span>
          }
        />
      </div>

      {/* Monthly sales chart + recent activity feed */}
      {/* min-w-0 on children: recharts' min-content width would otherwise
          stretch the 1-col mobile track and overflow narrow viewports. */}
      <div className="grid gap-4 lg:grid-cols-5">
        <motion.div
          className="lg:col-span-3 min-w-0"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
        >
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">
                {tx('মাসিক বিক্রয়', 'Monthly Sales')}
              </CardTitle>
              <CardDescription>
                {tx(
                  'গত ৬ মাসের আয় ও অর্ডার সংখ্যা',
                  'Revenue and order count over the last 6 months'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={stats.monthlySales}
                    margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    />
                    <YAxis
                      yAxisId="rev"
                      width={48}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))
                      }
                    />
                    <YAxis
                      yAxisId="cnt"
                      orientation="right"
                      width={36}
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value, name) =>
                        name === 'revenue'
                          ? fmtBDT(Number(value))
                          : `${digitsBn(Number(value))} ${tx('টি অর্ডার', 'orders')}`
                      }
                      cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                    />
                    <Bar
                      yAxisId="rev"
                      dataKey="revenue"
                      fill="var(--chart-2)"
                      radius={[6, 6, 0, 0]}
                      barSize={28}
                    />
                    <Line
                      yAxisId="cnt"
                      type="monotone"
                      dataKey="count"
                      stroke="var(--chart-4)"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: 'var(--chart-4)' }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          className="lg:col-span-2 min-w-0"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">
                {tx('সাম্প্রতিক কার্যক্রম', 'Recent Activity')}
              </CardTitle>
              <CardDescription>
                {tx('সর্বশেষ ১২টি ইভেন্ট', 'Latest 12 events')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.recentActivity.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  {tx('এখনো কোনো কার্যক্রম নেই', 'No activity yet')}
                </p>
              ) : (
                <div className="max-h-96 space-y-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
                  {stats.recentActivity.map((ev) => {
                    const { icon: Icon, cls } = ACT_META[ev.type] ?? ACT_META.enrollment
                    return (
                      <div
                        key={`${ev.type}-${ev.id}`}
                        className="flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-muted/60"
                      >
                        <span
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cls}`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm" title={activityLine(ev, lang)}>
                            {activityLine(ev, lang)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {timeAgo(ev.createdAt, lang)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── Existing analytics content (KPIs, 14-day charts, orders) ── */}
      <AnalyticsView />
    </div>
  )
}

'use client'

/**
 * AnalyticsView (Admin Panel 2.0) — detailed analytics page.
 * Data: GET /api/admin/stats (v4 `series` optional, null-safe on v2 payloads).
 *
 * NOTE: the quick-actions row and the 4 KPI cards (revenue/sales/students/
 * enrollments) were REMOVED permanently — they duplicated the admin dashboard.
 * This page is charts-first: 30-day revenue trend, revenue split by product
 * kind, 30-day daily enrollments, students by class, top-8 courses by
 * enrollment, top-5 courses by revenue, category donut, 6-month composed
 * trend, and the latest-8 orders table.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  ArrowRight,
  RefreshCcw,
  ShieldX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiGet } from '@/lib/api-client'
import { digitsBn, fmtBDT, fmtDateTime, orderStatusStyle } from '@/lib/format'
import { useAuth } from '@/store/auth-store'
import { go, useUI } from '@/store/ui-store'
import { isPanelRole } from '@/lib/roles'

/* ── Types ── */

interface Totals {
  revenue: number
  sales: number
  students: number
  courses: number
  enrollments: number
  pendingOrders: number
  materials: number
  drafts?: number
  unreadMessages?: number
}
interface SalesPoint {
  day: string
  label: string
  revenue: number
  sales: number
}
interface EnrollPoint {
  day: string
  label: string
  count: number
}
interface RevenuePoint {
  title: string
  revenue: number
}
interface CategoryPoint {
  name: string
  value: number
}
interface MonthlyPoint {
  month: string
  label: string
  count: number
  revenue: number
}
interface RecentOrder {
  id: string
  trxId: string
  amount: number
  method: string
  status: string
  createdAt: string
  user: { name: string; email: string | null } | null
  course: { title: string } | null
}
/** v4 analytics series (optional — the view stays renderable without it). */
interface SeriesPayload {
  revenueDaily: { date: string; label: string; revenue: number }[]
  enrollmentsDaily: { date: string; label: string; count: number }[]
  topCourses: { title: string; enrollments: number }[]
  revenueByType: { type: string; revenue: number }[]
  studentsByClass: { key: string; count: number }[]
}
interface AdminStats {
  totals: Totals
  salesByDay: SalesPoint[]
  enrollmentsByDay?: EnrollPoint[]
  revenueByCourse: RevenuePoint[]
  categoryDistribution: CategoryPoint[]
  recentOrders?: RecentOrder[]
  monthlySales?: MonthlyPoint[]
  series?: SeriesPayload
}

/* ── Helpers ── */

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--popover)',
  color: 'var(--popover-foreground)',
  fontSize: 12,
  boxShadow: '0 10px 30px rgb(0 0 0 / 0.10)',
} as const

function methodStyle(method: string): string {
  switch (method) {
    case 'BKASH':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
    case 'NAGAD':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
    case 'SSLCOMMERZ':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    case 'STRIPE':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

/* Revenue-split palette — the admin emerald/teal/amber/violet family. */
const TYPE_META: Record<string, { bn: string; en: string; color: string }> = {
  courses: { bn: 'কোর্স', en: 'Courses', color: '#10b981' },
  combos: { bn: 'কম্বো', en: 'Combos', color: '#14b8a6' },
  suggestions: { bn: 'সাজেশন', en: 'Suggestions', color: '#f59e0b' },
  exams: { bn: 'পরীক্ষা', en: 'Exams', color: '#8b5cf6' },
}

/* Compact class labels for the students-by-class bar chart X axis —
   the full bilingual label shows in the tooltip. */
const CLASS_SHORT: Record<string, { bn: string; en: string; full: { bn: string; en: string } }> = {
  CLASS_9: { bn: '৯ম', en: '9th', full: { bn: 'নবম শ্রেণি', en: 'Class 9' } },
  CLASS_10: { bn: '১০ম', en: '10th', full: { bn: 'দশম শ্রেণি', en: 'Class 10' } },
  CLASS_11: { bn: '১১শ', en: '11th', full: { bn: 'একাদশ শ্রেণি', en: 'Class 11' } },
  CLASS_12: { bn: '১২শ', en: '12th', full: { bn: 'দ্বাদশ শ্রেণি', en: 'Class 12' } },
  HONOURS_1ST: { bn: 'সম্মান ১ম', en: 'Hon 1st', full: { bn: 'সম্মান ১ম বর্ষ', en: 'Honours 1st Year' } },
  HONOURS_2ND: { bn: 'সম্মান ২য়', en: 'Hon 2nd', full: { bn: 'সম্মান ২য় বর্ষ', en: 'Honours 2nd Year' } },
  HONOURS_3RD: { bn: 'সম্মান ৩য়', en: 'Hon 3rd', full: { bn: 'সম্মান ৩য় বর্ষ', en: 'Honours 3rd Year' } },
  HONOURS_4TH: { bn: 'সম্মান ৪র্থ', en: 'Hon 4th', full: { bn: 'সম্মান ৪র্থ বর্ষ', en: 'Honours 4th Year' } },
  OTHER: { bn: 'অন্যান্য', en: 'Other', full: { bn: 'অন্যান্য', en: 'Other' } },
  NOT_SET: { bn: 'নির্ধারিত নয়', en: 'Not set', full: { bn: 'নির্ধারিত নয়', en: 'Not set' } },
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
        <Button className="mt-2" onClick={() => go('#/login')}>
          {tx('লগইন করুন', 'Go to login')}
        </Button>
      </CardContent>
    </Card>
  )
}

function ChartCard({
  title,
  description,
  children,
  delay = 0,
  className,
}: {
  title: string
  description: string
  children: React.ReactNode
  delay?: number
  /** Extra classes for the outer wrapper (e.g. min-w-0 inside CSS grids —
      keeps recharts' min-content width from stretching mobile tracks). */
  className?: string
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </motion.div>
  )
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold">{digitsBn(value)}</span>
    </span>
  )
}

/* ── Main view ── */

export default function AnalyticsView() {
  const { user, status, initialized } = useAuth()
  const { t, tx } = useUI()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiGet<AdminStats>('/api/admin/stats')
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

  const barData = useMemo(
    () =>
      (stats?.revenueByCourse ?? []).map((r) => ({
        ...r,
        short: r.title.length > 18 ? `${r.title.slice(0, 17)}…` : r.title,
      })),
    [stats]
  )

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return <AccessDenied />
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-56" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
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
          <h2 className="text-lg font-semibold">{t('error')}</h2>
          <p className="text-sm text-muted-foreground">{error || t('loading')}</p>
          <Button className="mt-2 gap-2" onClick={() => void load()}>
            <RefreshCcw className="h-4 w-4" /> {t('retry')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const totals = stats.totals
  const recentOrders = stats.recentOrders ?? []
  const monthlySales = stats.monthlySales ?? []
  const series = stats.series

  // ── v4 series → chart data (null-safe: the view renders on v2 payloads too) ──
  const revenueDaily = series?.revenueDaily ?? []
  const enrollDaily = series?.enrollmentsDaily ?? []
  const topCoursesData = (series?.topCourses ?? []).map((c) => ({
    ...c,
    short: c.title.length > 18 ? `${c.title.slice(0, 17)}…` : c.title,
  }))
  const revenueByTypeData = (series?.revenueByType ?? [])
    .filter((r) => r.revenue > 0)
    .map((r) => ({
      ...r,
      name: tx(TYPE_META[r.type]?.bn ?? r.type, TYPE_META[r.type]?.en ?? r.type),
      color: TYPE_META[r.type]?.color ?? 'var(--chart-3)',
    }))
  const studentsByClassData = (series?.studentsByClass ?? []).map((c) => ({
    ...c,
    short: tx(CLASS_SHORT[c.key]?.bn ?? c.key, CLASS_SHORT[c.key]?.en ?? c.key),
    full: tx(
      CLASS_SHORT[c.key]?.full.bn ?? c.key,
      CLASS_SHORT[c.key]?.full.en ?? c.key
    ),
  }))

  return (
    <div className="space-y-6">
      {/* Page heading + refresh (quick actions & KPI cards live on the
          dashboard — deliberately NOT duplicated here) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">
            {tx('অ্যানালিটিক্স ড্যাশবোর্ড', 'Analytics Dashboard')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'বিস্তারিত চার্ট ও ডায়াগ্রামে প্ল্যাটফর্মের সম্পূর্ণ চিত্র',
              'The complete platform picture in detailed charts and diagrams'
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => void load()}>
          <RefreshCcw className="h-4 w-4" /> {t('refresh')}
        </Button>
      </div>

      {/* Small chips */}
      <div className="flex flex-wrap gap-2">
        <StatChip label={tx('কোর্স', 'Courses')} value={totals.courses} />
        <StatChip label={tx('খসড়া', 'Drafts')} value={totals.drafts ?? 0} />
        <StatChip label={tx('সাজেশন', 'Suggestions')} value={totals.materials} />
        <StatChip
          label={tx('অপঠিত মেসেজ', 'Unread messages')}
          value={totals.unreadMessages ?? 0}
        />
      </div>

      {/* ── Charts row 1: 30-day revenue trend (wide) + revenue by product type ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 min-w-0">
          <ChartCard
            title={tx('রাজস্বের ধারা (৩০ দিন)', 'Revenue Trend (30 days)')}
            description={tx(
              'গত ৩০ দিনের দৈনিক আয় — কোর্স, পরীক্ষা, সাজেশন ও কম্বো মিলিয়ে',
              'Daily revenue over the last 30 days — courses, exams, suggestions and combos combined'
            )}
          >
            <div className="h-64 w-full lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueDaily} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGradient30" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))
                    }
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => fmtBDT(Number(value))}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--chart-1)"
                    strokeWidth={2.5}
                    fill="url(#revenueGradient30)"
                    activeDot={{ r: 5, fill: 'var(--chart-1)' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <ChartCard
          className="min-w-0"
          title={tx('আয়ের খাতভিত্তিক বিভাজন', 'Revenue by Product Type')}
          description={tx(
            'কোন খাতে কত আয় — কোর্স, কম্বো, সাজেশন ও পরীক্ষা',
            'Revenue split across courses, combos, suggestions and exams'
          )}
          delay={0.08}
        >
          {revenueByTypeData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {tx('এখনো কোনো ডেটা নেই', 'No data yet')}
            </p>
          ) : (
            <div className="h-64 w-full lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueByTypeData}
                    dataKey="revenue"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={3}
                    strokeWidth={2}
                    stroke="var(--background)"
                  >
                    {revenueByTypeData.map((entry) => (
                      <Cell key={entry.type} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => fmtBDT(Number(value))}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Charts row 2: daily enrollments (30d bars) + students by class ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          className="min-w-0"
          title={tx('দৈনিক ভর্তি (৩০ দিন)', 'Daily Enrollments (30 days)')}
          description={tx(
            'গত ৩০ দিনে প্রতিদিন কত জন ভর্তি হয়েছে',
            'How many students enrolled each day over the last 30 days'
          )}
          delay={0.05}
        >
          {enrollDaily.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {tx('এখনো কোনো ডেটা নেই', 'No data yet')}
            </p>
          ) : (
            <div className="h-64 w-full lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={enrollDaily} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => `${digitsBn(Number(value))} ${tx('টি ভর্তি', 'enrollments')}`}
                    cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--chart-3)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title={tx('শ্রেণিভিত্তিক শিক্ষার্থী', 'Students by Class')}
          description={tx(
            'প্রতিটি শ্রেণি/বর্ষে কত জন শিক্ষার্থী আছে',
            'How many registered students are in each class'
          )}
          delay={0.1}
        >
          {studentsByClassData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {tx('এখনো কোনো ডেটা নেই', 'No data yet')}
            </p>
          ) : (
            <div className="h-64 w-full lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={studentsByClassData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="short"
                    interval={0}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => `${digitsBn(Number(value))} ${tx('জন', 'students')}`}
                    labelFormatter={(label) => {
                      const hit = studentsByClassData.find((c) => c.short === label)
                      return hit ? hit.full : String(label)
                    }}
                    cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--chart-2)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Charts row 3: top courses by enrollment vs by revenue ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          className="min-w-0"
          title={tx('সর্বাধিক ভর্তি কোর্স (শীর্ষ ৮)', 'Most Enrolled Courses (Top 8)')}
          description={tx(
            'ভর্তি সংখ্যা অনুযায়ী শীর্ষ ৮টি কোর্স',
            'Top 8 courses ranked by enrollment count'
          )}
          delay={0.05}
        >
          {topCoursesData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {tx('এখনো কোনো ডেটা নেই', 'No data yet')}
            </p>
          ) : (
            <div className="h-64 w-full lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topCoursesData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="short"
                    width={140}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => `${digitsBn(Number(value))} ${tx('টি ভর্তি', 'enrollments')}`}
                    cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                  />
                  <Bar
                    dataKey="enrollments"
                    fill="var(--chart-1)"
                    radius={[0, 6, 6, 0]}
                    barSize={14}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          className="min-w-0"
          title={t('revenue_by_course')}
          description={tx('সর্বোচ্চ আয়ের ৫টি কোর্স', 'Top 5 courses by revenue')}
          delay={0.1}
        >
          {barData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {tx('এখনো কোনো ডেটা নেই', 'No data yet')}
            </p>
          ) : (
            <div className="h-64 w-full lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="short"
                    width={140}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => fmtBDT(Number(value))}
                    cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="var(--chart-2)"
                    radius={[0, 6, 6, 0]}
                    barSize={16}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Charts row 4: category distribution + monthly sales trend ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          className="min-w-0"
          title={tx('ক্যাটাগরি বিভাজন', 'Category Distribution')}
          description={tx('ক্যাটাগরিভিত্তিক ভর্তির হার', 'Enrollments per category')}
          delay={0.05}
        >
          {(stats.categoryDistribution ?? []).length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {tx('এখনো কোনো ডেটা নেই', 'No data yet')}
            </p>
          ) : (
            <div className="h-64 w-full lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.categoryDistribution}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={3}
                    strokeWidth={2}
                    stroke="var(--background)"
                  >
                    {stats.categoryDistribution.map((entry, i) => (
                      <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => `${digitsBn(Number(value))} ${tx('টি', 'items')}`}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {monthlySales.length > 0 && (
          <ChartCard
            className="min-w-0"
            title={tx('মাসিক বিক্রয় ধারা', 'Monthly Sales Trend')}
            description={tx(
              'গত ৬ মাসের আয় ও অর্ডার সংখ্যা',
              'Revenue and order count over the last 6 months'
            )}
            delay={0.1}
          >
            <div className="h-64 w-full lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={monthlySales}
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
          </ChartCard>
        )}
      </div>

      {/* Recent orders */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.12 }}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {tx('সাম্প্রতিক অর্ডার', 'Recent Orders')}
              </CardTitle>
              <CardDescription>
                {tx('সর্বশেষ ৮টি পেমেন্ট', 'Latest 8 payments')}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => go('#/admin/orders')}>
              {tx('সব অর্ডার', 'All orders')} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {tx('এখনো কোনো অর্ডার নেই', 'No orders yet')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tx('ট্রানজেকশন', 'TrxID')}</TableHead>
                      <TableHead>{tx('শিক্ষার্থী', 'Student')}</TableHead>
                      <TableHead>{tx('কোর্স', 'Course')}</TableHead>
                      <TableHead>{t('amount')}</TableHead>
                      <TableHead>{tx('মাধ্যম', 'Method')}</TableHead>
                      <TableHead>{tx('স্ট্যাটাস', 'Status')}</TableHead>
                      <TableHead>{tx('তারিখ', 'Date')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOrders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">{o.trxId}</TableCell>
                        <TableCell>
                          <div className="max-w-[160px]">
                            <p className="truncate text-sm font-medium">
                              {o.user?.name ?? '—'}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {o.user?.email ?? ''}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="max-w-[180px] truncate text-sm">
                            {o.course?.title ?? '—'}
                          </p>
                        </TableCell>
                        <TableCell className="font-bold">{fmtBDT(o.amount)}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${methodStyle(o.method)}`}
                          >
                            {o.method}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${orderStatusStyle(o.status)}`}
                          >
                            {o.status === 'SUCCESS'
                              ? tx('সফল', 'Success')
                              : o.status === 'PENDING'
                                ? tx('পেন্ডিং', 'Pending')
                                : o.status === 'FAILED'
                                  ? tx('ব্যর্থ', 'Failed')
                                  : o.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                          {fmtDateTime(o.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

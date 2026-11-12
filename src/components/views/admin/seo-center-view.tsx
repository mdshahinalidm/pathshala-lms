'use client'

/**
 * SEO Center — admin main module (4 sub-pages):
 *   • SeoOverviewView        /admin/seo-center           — live KPIs + score summary
 *   • SeoOnPageView          /admin/seo-center/on-page   — 27 On-Page SEO checks
 *   • SeoTechnicalView       /admin/seo-center/technical — 41 Technical SEO checks
 *   • SeoSitemapRobotsView   /admin/seo-center/sitemap-robots — exact sitemap.xml + robots.txt
 *
 * All data comes from GET /api/admin/seo-audit (real DB + live crawl evidence,
 * 5-minute server cache). The "Refresh" button forces a fresh audit.
 *
 * engine v4: proper SEO SCORE — overall 0–100 gauge + four
 * category scores (On-Page 30% / Technical 30% / Content 20% / Performance
 * 20%), all computed from real evidence. Overview shows a big score ring;
 * every checklist tab shows its own category score banner. Sitemap tab notes
 * the INSTANT sitemap regeneration (revision-probe, no stale window).
 *
 * On-Page & Technical tabs are now a LIST-FORMAT report:
 * status-grouped sections (issues → warnings → completed → advice → N/A)
 * with numbered rows, per-check evidence, per-category summary counts and
 * status filter chips — so the admin sees exactly which checks are complete
 * and which issues need fixing.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Copy,
  ExternalLink,
  FileCode2,
  FileSearch,
  Gauge,
  Globe,
  Info,
  ListFilter,
  ListTree,
  MinusCircle,
  RefreshCw,
  Timer,
  TrendingUp,
  Wrench,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useUI } from '@/store/ui-store'
import { apiGet } from '@/lib/api-client'
import type { SeoAuditData, SeoItem, SeoScoreBreakdown, SeoStatus } from '@/lib/seo-audit'

/* ── score display (engine v4) ────────────────────────────────── */

const SCORE_COLORS = { excellent: '#16a34a', good: '#84cc16', fair: '#f59e0b', poor: '#ef4444' } as const

function scoreHex(value: number): string {
  return value >= 90 ? SCORE_COLORS.excellent : value >= 75 ? SCORE_COLORS.good : value >= 50 ? SCORE_COLORS.fair : SCORE_COLORS.poor
}

/** Circular score ring — 0–100 with Lighthouse-style colour bands. */
function ScoreRing({ value, size = 132, stroke = 12, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.min(Math.max(value, 0), 100)
  const off = c * (1 - clamped / 100)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`SEO score ${clamped} out of 100`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-muted-foreground/25" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={scoreHex(clamped)}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y={label ? '46%' : '50%'} textAnchor="middle" dominantBaseline="central" className="fill-foreground font-bold" style={{ fontSize: size * 0.22 }}>
        {clamped}
      </text>
      {label && (
        <text x="50%" y="62%" textAnchor="middle" dominantBaseline="central" className="fill-muted-foreground" style={{ fontSize: size * 0.09 }}>
          {label}
        </text>
      )}
    </svg>
  )
}

const SCORE_CATEGORIES = [
  { key: 'onPage', bn: 'অন-পেজ SEO', en: 'On-Page SEO', weight: '30%' },
  { key: 'technical', bn: 'টেকনিক্যাল SEO', en: 'Technical SEO', weight: '30%' },
  { key: 'content', bn: 'কনটেন্ট কোয়ালিটি', en: 'Content Quality', weight: '20%' },
  { key: 'performance', bn: 'পারফরম্যান্স', en: 'Performance', weight: '20%' },
] as const

/** Category progress bar (0–100). */
function CategoryBar({ label, weight, value }: { label: string; weight?: string; value: number | null }) {
  const { lang } = useUI()
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-muted-foreground">
          {label}
          {weight && <span className="ml-1 opacity-70">· {weight}</span>}
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{value === null ? (lang === 'bn' ? 'প্রযোজ্য নয়' : 'N/A') : `${value}/100`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: value === null ? '0%' : `${Math.min(Math.max(value, 0), 100)}%`, backgroundColor: value === null ? 'transparent' : scoreHex(value) }}
        />
      </div>
    </div>
  )
}

/** Big overall-score card shown at the top of the Overview. */
function ScoreCard({ score, engineVersion }: { score: SeoScoreBreakdown; engineVersion: number }) {
  const { lang } = useUI()
  const bn = lang === 'bn'
  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-primary/5">
      <CardContent className="flex flex-col items-center gap-6 p-5 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex flex-col items-center gap-1.5">
          <ScoreRing value={score.overall} size={148} stroke={13} label="/ 100" />
          <Badge
            variant="outline"
            className="gap-1.5 border"
            style={{ borderColor: `${scoreHex(score.overall)}55`, color: scoreHex(score.overall), backgroundColor: `${scoreHex(score.overall)}14` }}
          >
            <Gauge className="h-3.5 w-3.5" />
            {bn ? score.gradeBn : score.gradeEn}
          </Badge>
        </div>
        <div className="w-full flex-1 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-bold">{bn ? 'সামগ্রিক SEO স্কোর' : 'Overall SEO Score'}</p>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">Google-অনুযায়ী · engine v{engineVersion}</span>
          </div>
          <div className="space-y-2.5">
            {SCORE_CATEGORIES.map((c) => (
              <CategoryBar key={c.key} label={bn ? c.bn : c.en} weight={c.weight} value={score[c.key]} />
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {bn
              ? 'স্কোর গণনা: পাস=১ পয়েন্ট, সতর্কতা=০.৫, সমস্যা=০ · সব ডেটা লাইভ সাইট ও ডেটাবেস থেকে — কোনো কাল্পনিক সংখ্যা নেই'
              : 'Scoring: pass=1, warning=0.5, issue=0 · every number measured from the live site & database — nothing simulated'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/** Slim score banner for the checklist tabs (own category score). */
function ScoreBanner({ labelBn, labelEn, value, count }: { labelBn: string; labelEn: string; value: number | null; count: number }) {
  const { lang } = useUI()
  const bn = lang === 'bn'
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
      {value === null ? (
        <MinusCircle className="h-8 w-8 text-muted-foreground" />
      ) : (
        <ScoreRing value={value} size={56} stroke={7} />
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {bn ? labelBn : labelEn} — {value === null ? (bn ? 'প্রযোজ্য নয়' : 'N/A') : `${value}/100`}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {value === null ? '' : bn ? `গ্রেড: ${value >= 90 ? 'চমৎকার' : value >= 75 ? 'ভালো' : value >= 50 ? 'উন্নতি প্রয়োজন' : 'দুর্বল'} · ` : `Grade: ${value >= 90 ? 'Excellent' : value >= 75 ? 'Good' : value >= 50 ? 'Needs improvement' : 'Poor'} · `}
          {count} {bn ? 'টি চেক' : 'checks'}
        </p>
      </div>
    </div>
  )
}

/* ── shared shell ─────────────────────────────────────────────── */

const TABS = [
  { href: '/admin/seo-center', bn: 'ওভারভিউ', en: 'Overview', icon: Gauge },
  { href: '/admin/seo-center/on-page', bn: 'অন-পেজ SEO', en: 'On-Page SEO', icon: FileSearch },
  { href: '/admin/seo-center/technical', bn: 'টেকনিক্যাল SEO', en: 'Technical SEO', icon: Wrench },
  { href: '/admin/seo-center/sitemap-robots', bn: 'সাইটম্যাপ ও Robots', en: 'Sitemap & Robots', icon: ListTree },
]

function useSeoAudit() {
  const { toast } = useToast()
  const [data, setData] = useState<SeoAuditData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true)
      setError(false)
      try {
        const d = await apiGet<SeoAuditData>(`/api/admin/seo-audit${refresh ? '?refresh=1' : ''}`)
        setData(d)
      } catch {
        setError(true)
        toast({ description: 'SEO ডেটা লোড করা যায়নি — আবার চেষ্টা করুন' })
      } finally {
        setLoading(false)
      }
    },
    [toast]
  )

  useEffect(() => {
    void load(false)
  }, [load])

  return { data, loading, error, refresh: () => load(true) }
}

function SeoShell({
  active,
  titleBn,
  titleEn,
  descBn,
  descEn,
  data,
  loading,
  onRefresh,
  children,
}: {
  active: string
  titleBn: string
  titleEn: string
  descBn: string
  descEn: string
  data: SeoAuditData | null
  loading: boolean
  onRefresh: () => void
  children: React.ReactNode
}) {
  const { lang, tx } = useUI()
  const bn = lang === 'bn'

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Globe className="h-5.5 w-5.5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{bn ? titleBn : titleEn}</h1>
            <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{bn ? descBn : descEn}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <Timer className="h-3.5 w-3.5" />
              {new Date(data.generatedAt).toLocaleTimeString(bn ? 'bn-BD' : 'en-US')}
            </span>
          )}
          <Button variant="outline" size="sm" className="min-h-10 gap-2" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {tx('রিফ্রেশ', 'Refresh')}
          </Button>
        </div>
      </div>

      {/* Sub-tabs */}
      <nav aria-label="SEO Center sections" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const isActive = active === t.href
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {bn ? t.bn : t.en}
            </Link>
          )
        })}
      </nav>

      {children}
    </div>
  )
}

/* ── status badge + item card ─────────────────────────────────── */

const STATUS_META: Record<SeoStatus, { bn: string; en: string; icon: typeof CheckCircle2; cls: string }> = {
  pass: { bn: 'পাস', en: 'Pass', icon: CheckCircle2, cls: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30' },
  warn: { bn: 'সতর্কতা', en: 'Warning', icon: AlertTriangle, cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  fail: { bn: 'সমস্যা', en: 'Issue', icon: XCircle, cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30' },
  info: { bn: 'তথ্য', en: 'Info', icon: Info, cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30' },
  na: { bn: 'প্রযোজ্য নয়', en: 'N/A', icon: MinusCircle, cls: 'bg-muted text-muted-foreground border-border' },
}

function StatusBadge({ status }: { status: SeoStatus }) {
  const { lang } = useUI()
  const m = STATUS_META[status]
  const Icon = m.icon
  return (
    <Badge variant="outline" className={`gap-1.5 border ${m.cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {lang === 'bn' ? m.bn : m.en}
    </Badge>
  )
}

/* list-format report pieces
 *
 * Section order is fix-first: issues → warnings → completed → advice → N/A.
 * Zero-count issue groups render a green all-clear line so the admin always
 * sees an explicit "nothing to fix" confirmation, never a silent empty area.
 */

const SECTION_ORDER: SeoStatus[] = ['fail', 'warn', 'pass', 'info', 'na']

const SECTION_META: Record<SeoStatus, { bn: string; en: string; hintBn: string; hintEn: string }> = {
  fail: {
    bn: 'সমস্যা — এগুলো ঠিক করতে হবে',
    en: 'Issues — these must be fixed',
    hintBn: 'প্রতিটি সমস্যার নির্দেশনা অনুসরণ করুন, তারপর "রিফ্রেশ" চেপে পুনঃঅডিট করুন',
    hintEn: 'Follow the guidance under each issue, then press "Refresh" to re-audit',
  },
  warn: {
    bn: 'সতর্কতা — মনোযোগ দিন',
    en: 'Warnings — need attention',
    hintBn: 'স্কোরে অর্ধেক পয়েন্ট কাটে — ঠিক করলে স্কোর বাড়বে',
    hintEn: 'Half a point is lost in the score — fixing them raises it',
  },
  pass: {
    bn: 'সম্পন্ন — এই চেকগুলো কমপ্লিট',
    en: 'Completed — these checks pass',
    hintBn: 'প্রতিটি চেকের প্রমাণ লাইভ সাইট ও ডেটাবেস থেকে',
    hintEn: 'Evidence for every check comes from the live site & database',
  },
  info: {
    bn: 'পরামর্শ — ঐচ্ছিক উন্নতি',
    en: 'Advice — optional improvements',
    hintBn: 'সমস্যা নয় — Google গাইড অনুযায়ী ভবিষ্যতে আরও ভালো ফলের সুযোগ',
    hintEn: 'Not issues — future wins per Google guidance',
  },
  na: {
    bn: 'প্রযোজ্য নয়',
    en: 'Not applicable',
    hintBn: 'এই সাইটের কাঠামোতে প্রযোজ্য নয় — স্কোর গণনায় বাদ',
    hintEn: 'Not applicable to this site — excluded from scoring',
  },
}

/** One numbered row of the report: name + status badge + description + evidence list. */
function ChecklistRow({ item, index }: { item: SeoItem; index: number }) {
  const { lang } = useUI()
  const bn = lang === 'bn'
  const m = STATUS_META[item.status]
  const Icon = m.icon
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${m.cls}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold leading-snug">
            <span className="mr-1 tabular-nums text-muted-foreground">{index}.</span>
            {bn ? item.bn : item.en}
          </p>
          <StatusBadge status={item.status} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{bn ? item.descBn : item.descEn}</p>
        {item.details.length > 0 && (
          <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto border-l-2 border-primary/25 pl-3 pr-1 [scrollbar-width:thin]">
            {item.details.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-primary/60" />
                <span className="break-words">{d}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Status-grouped section card; zero-count issue groups show a green all-clear line. */
function StatusSection({ status, items }: { status: SeoStatus; items: SeoItem[] }) {
  const { lang } = useUI()
  const bn = lang === 'bn'
  const meta = SECTION_META[status]
  const m = STATUS_META[status]
  const Icon = m.icon

  if (items.length === 0) {
    if (status === 'fail' || status === 'warn') {
      return (
        <div className={`flex items-center gap-2.5 rounded-xl border p-3.5 text-sm ${STATUS_META.pass.cls}`}>
          <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />
          <p>
            {bn
              ? status === 'fail' ? 'কোনো সমস্যা নেই — লাইভ অডিট পরিষ্কার ✓' : 'কোনো সতর্কতা নেই — লাইভ অডিট পরিষ্কার ✓'
              : status === 'fail' ? 'No issues — the live audit is clean ✓' : 'No warnings — the live audit is clean ✓'}
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className={`border-b py-3.5 ${m.cls}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Icon className="h-4.5 w-4.5" />
            {bn ? meta.bn : meta.en}
          </CardTitle>
          <span className="rounded-full bg-background/70 px-2.5 py-0.5 text-xs font-bold tabular-nums">{items.length}</span>
        </div>
        <p className="mt-1 text-xs opacity-80">{bn ? meta.hintBn : meta.hintEn}</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {items.map((it, i) => (
            <ChecklistRow key={it.id} item={it} index={i + 1} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/** Status filter chips with live counts (d list report). */
function FilterChips({ counts, active, onChange }: { counts: Record<'all' | SeoStatus, number>; active: 'all' | SeoStatus; onChange: (k: 'all' | SeoStatus) => void }) {
  const { lang } = useUI()
  const bn = lang === 'bn'
  const chips: { key: 'all' | SeoStatus; label: string; icon: typeof CheckCircle2 }[] = [
    { key: 'all', label: bn ? 'সব' : 'All', icon: ListFilter },
    { key: 'pass', label: bn ? 'সম্পন্ন' : 'Completed', icon: CheckCircle2 },
    { key: 'warn', label: bn ? 'সতর্কতা' : 'Warnings', icon: AlertTriangle },
    { key: 'fail', label: bn ? 'সমস্যা' : 'Issues', icon: XCircle },
    { key: 'info', label: bn ? 'পরামর্শ' : 'Advice', icon: Info },
    { key: 'na', label: bn ? 'প্রযোজ্য নয়' : 'N/A', icon: MinusCircle },
  ]
  return (
    <div role="group" aria-label={bn ? 'স্ট্যাটাস ফিল্টার' : 'Status filter'} className="flex gap-2 overflow-x-auto pb-1">
      {chips.map((c) => {
        const isActive = active === c.key
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(c.key)}
            className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
              isActive ? 'border-primary/40 bg-primary/10 text-primary' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <c.icon className="h-3.5 w-3.5" />
            {c.label}
            <span className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${isActive ? 'bg-primary/15' : 'bg-muted'}`}>{counts[c.key]}</span>
          </button>
        )
      })}
    </div>
  )
}

function SummaryStrip({ counts }: { counts: Record<SeoStatus, number> }) {
  const { lang } = useUI()
  const bn = lang === 'bn'
  const entries: [SeoStatus, string, string][] = [
    ['pass', 'পাস', 'Passed'],
    ['warn', 'সতর্কতা', 'Warnings'],
    ['fail', 'সমস্যা', 'Issues'],
    ['info', 'পরামর্শ', 'Advice'],
    ['na', 'প্রযোজ্য নয়', 'N/A'],
  ]
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
      {entries.map(([st, b, e]) => {
        const m = STATUS_META[st]
        const Icon = m.icon
        return (
          <div key={st} className={`flex items-center gap-2.5 rounded-xl border p-3 ${m.cls}`}>
            <Icon className="h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none">{counts[st]}</p>
              <p className="mt-1 truncate text-xs opacity-80">{bn ? b : e}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LoadingState({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { tx } = useUI()
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="text-sm text-muted-foreground">
          {tx('SEO ডেটা লোড করা যায়নি। ইন্টারনেট/সার্ভার চেক করে আবার চেষ্টা করুন।', 'Could not load SEO data. Check the server and try again.')}
        </p>
        <Button variant="outline" size="sm" onClick={onRetry} className="min-h-10">
          {tx('আবার চেষ্টা করুন', 'Try again')}
        </Button>
      </CardContent>
    </Card>
  )
}

/* ── 1. Overview ──────────────────────────────────────────────── */

export function SeoOverviewView() {
  const { tx, lang } = useUI()
  const { data, loading, error, refresh } = useSeoAudit()
  const bn = lang === 'bn'

  const kpis = data
    ? [
        { icon: ListTree, labelBn: 'সাইটম্যাপ URL', labelEn: 'Sitemap URLs', value: String(data.sitemap.urlCount) },
        { icon: TrendingUp, labelBn: 'প্রকাশিত কোর্স', labelEn: 'Published courses', value: String(data.db.coursesPublished) },
        { icon: BadgeCheck, labelBn: 'সক্রিয় কম্বো', labelEn: 'Active combos', value: String(data.db.combosActive) },
        { icon: Activity, labelBn: 'গড় TTFB', labelEn: 'Avg TTFB', value: `${avgTtfb(data.pages)}ms` },
        { icon: FileCode2, labelBn: 'JSON-LD স্কিমা', labelEn: 'JSON-LD types', value: String(new Set(data.pages.flatMap((p) => p.jsonLdTypes)).size) },
      ]
    : []

  return (
    <SeoShell
      active="/admin/seo-center"
      titleBn="SEO সেন্টার — ওভারভিউ"
      titleEn="SEO Center — Overview"
      descBn="ওয়েবসাইটের পারফরম্যান্স ও SEO স্বাস্থ্যের রিয়েল-টাইম অ্যানালিটিক্স — সব ডেটা আসল সাইট থেকে গণনা করা"
      descEn="Real-time analytics of site performance & SEO health — every number computed from the live site"
      data={data}
      loading={loading}
      onRefresh={refresh}
    >
      {loading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState onRetry={refresh} />
      ) : (
        <div className="space-y-5">
          <ScoreCard score={data.score} engineVersion={data.engineVersion} />
          <SummaryStrip counts={data.summary} />

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {kpis.map((k) => (
              <Card key={k.labelEn} className="p-4">
                <k.icon className="h-5 w-5 text-primary" />
                <p className="mt-2 text-2xl font-bold tracking-tight">{k.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{bn ? k.labelBn : k.labelEn}</p>
              </Card>
            ))}
          </div>

          {/* Site status quick grid */}
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader className="border-b bg-muted/30 py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-primary" />
                  {bn ? 'লাইভ সাইট স্ট্যাটাস' : 'Live site status'}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2.5 py-3.5 text-sm">
                <Stat label={bn ? 'robots.txt' : 'robots.txt'} ok={data.robots.ok} />
                <Stat label={bn ? 'sitemap.xml' : 'sitemap.xml'} ok={data.sitemap.ok} suffix={` · ${data.sitemap.urlCount}`} />
                <Stat label="HTTPS" ok={data.base.startsWith('https')} suffix={data.base.startsWith('https') ? '' : ' (dev)'} />
                <Stat label={bn ? '404 হ্যান্ডলিং' : '404 handling'} ok={data.probes.notFoundStatus === 404} />
                <Stat label={bn ? 'ব্রোকেন লিংক' : 'Broken links'} ok={data.probes.brokenLinks.length === 0} suffix={` · ${data.probes.sampledLinks}`} />
                <Stat label={bn ? 'অথ রিডাইরেক্ট' : 'Auth redirect'} ok={!!data.probes.dashboardRedirect && /^[34]/.test(data.probes.dashboardRedirect)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b bg-muted/30 py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  {bn ? 'কনটেন্ট ইনভেন্টরি (DB)' : 'Content inventory (DB)'}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2.5 py-3.5 text-sm">
                <Stat label={bn ? 'কোর্স' : 'Courses'} ok value={String(data.db.coursesPublished)} />
                <Stat label={bn ? 'নোটিশ' : 'Notices'} ok value={String(data.db.notices)} />
                <Stat label={bn ? 'সাজেশন' : 'Suggestions'} ok value={String(data.db.suggestions)} />
                <Stat label={bn ? 'রিভিউ' : 'Reviews'} ok value={String(data.db.reviewsApproved)} />
                <Stat label={bn ? 'বিবরণ-বিহীন কোর্স' : 'Courses w/o description'} ok={data.db.coursesMissingDescription === 0} value={String(data.db.coursesMissingDescription)} />
                <Stat label={bn ? '৯০ দিনে আপডেট' : 'Updated in 90d'} ok value={String(data.db.coursesUpdated90d)} />
              </CardContent>
            </Card>
          </div>

          {/* Deep links */}
          <div className="grid gap-3 sm:grid-cols-3">
            {TABS.slice(1).map((t) => (
              <Link key={t.href} href={t.href} className="group flex items-center justify-between rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/5">
                <span className="flex items-center gap-2.5 text-sm font-medium">
                  <t.icon className="h-4.5 w-4.5 text-primary" />
                  {bn ? t.bn : t.en}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            {bn
              ? `ভিত্তি URL: ${data.base} · প্রতি ৫ মিনিটে ক্যাশ — "রিফ্রেশ" চাপলে নতুন করে অডিট হয়`
              : `Base URL: ${data.base} · cached for 5 minutes — press "Refresh" to re-run the live audit`}
          </p>
        </div>
      )}
    </SeoShell>
  )
}

function avgTtfb(pages: { ms: number; path: string }[]): number {
  const core = pages.filter((p) => !p.path.includes('?') && p.ms > 0)
  return core.length ? Math.round(core.reduce((a, b) => a + b.ms, 0) / core.length) : 0
}

function Stat({ label, ok, value, suffix }: { label: string; ok: boolean; value?: string; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-2.5 py-2">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className={`flex shrink-0 items-center gap-1 text-xs font-semibold ${ok ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        {value ?? (ok ? 'OK' : '!')}
        {suffix ?? ''}
      </span>
    </div>
  )
}

/* ── 2 & 3. On-Page / Technical lists ─────────────────────────── */

function SeoChecklistView({ kind }: { kind: 'onPage' | 'technical' }) {
  const { lang } = useUI()
  const bn = lang === 'bn'
  const { data, loading, error, refresh } = useSeoAudit()
  const [filter, setFilter] = useState<'all' | SeoStatus>('all')
  const items = data?.[kind] ?? []

  const counts: Record<SeoStatus, number> = { pass: 0, warn: 0, fail: 0, info: 0, na: 0 }
  for (const i of items) counts[i.status]++
  const done = counts.pass
  const pct = Math.round((done / Math.max(items.length, 1)) * 100)
  const visible: SeoStatus[] = filter === 'all' ? SECTION_ORDER : [filter]

  return (
    <SeoShell
      active={kind === 'onPage' ? '/admin/seo-center/on-page' : '/admin/seo-center/technical'}
      titleBn={kind === 'onPage' ? 'অন-পেজ SEO চেকলিস্ট' : 'টেকনিক্যাল SEO চেকলিস্ট'}
      titleEn={kind === 'onPage' ? 'On-Page SEO Checklist' : 'Technical SEO Checklist'}
      descBn={
        kind === 'onPage'
          ? '২৭টি অন-পেজ ফ্যাক্টরের লিস্ট রিপোর্ট — কোনটি সম্পন্ন, কোনটিতে সমস্যা, কী ঠিক করতে হবে — প্রমাণসহ'
          : '৪১টি টেকনিক্যাল ফ্যাক্টরের লিস্ট রিপোর্ট — কোনটি সম্পন্ন, কোনটিতে সমস্যা, কী ঠিক করতে হবে — প্রমাণসহ'
      }
      descEn={
        kind === 'onPage'
          ? 'List report of 27 on-page factors — what is complete, what has issues, what to fix — with evidence'
          : 'List report of 41 technical factors — what is complete, what has issues, what to fix — with evidence'
      }
      data={data}
      loading={loading}
      onRefresh={refresh}
    >
      {loading ? (
        <LoadingState rows={8} />
      ) : error || !data ? (
        <ErrorState onRetry={refresh} />
      ) : (
        <div className="space-y-4">
          <ScoreBanner
            labelBn={kind === 'onPage' ? 'অন-পেজ SEO স্কোর' : 'টেকনিক্যাল SEO স্কোর'}
            labelEn={kind === 'onPage' ? 'On-Page SEO score' : 'Technical SEO score'}
            value={kind === 'onPage' ? data.score.onPage : data.score.technical}
            count={items.length}
          />

          {/* per-category counts (this tab only — not the global mix) */}
          <SummaryStrip counts={counts} />

          {/* completion line */}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BadgeCheck className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            {bn
              ? `${items.length} টি চেকের মধ্যে ${done} টি সম্পন্ন (${pct}%) — নিচের লিস্টে প্রতিটি চেকের বিস্তারিত ও প্রমাণ`
              : `${done} of ${items.length} checks completed (${pct}%) — full details & evidence in the list below`}
          </p>

          {/* status filter chips */}
          <FilterChips counts={{ all: items.length, ...counts }} active={filter} onChange={setFilter} />

          {/* grouped list — fix-first order (issues → warnings → completed → advice → N/A) */}
          <div className="space-y-4">
            {visible.map((st) => (
              <StatusSection key={st} status={st} items={items.filter((i) => i.status === st)} />
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            {bn ? `${items.length} টি চেক · ` : `${items.length} checks · `}
            {new Date(data.generatedAt).toLocaleString(bn ? 'bn-BD' : 'en-US')}
          </p>
        </div>
      )}
    </SeoShell>
  )
}

export function SeoOnPageView() {
  return <SeoChecklistView kind="onPage" />
}

export function SeoTechnicalView() {
  return <SeoChecklistView kind="technical" />
}

/* ── 4. Sitemap & Robots ──────────────────────────────────────── */

function CodeBlock({ title, content, href }: { title: string; content: string; href: string }) {
  const { lang } = useUI()
  const { toast } = useToast()
  const bn = lang === 'bn'
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      toast({ description: bn ? 'কপি হয়েছে' : 'Copied' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ description: bn ? 'কপি করা যায়নি' : 'Copy failed' })
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b bg-muted/30 py-3">
        <CardTitle className="flex items-center gap-2 font-mono text-sm">
          <FileCode2 className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="min-h-9 gap-1.5 text-xs" onClick={copy}>
            {copied ? <BadgeCheck className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            {bn ? 'কপি' : 'Copy'}
          </Button>
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex">
            <Button variant="ghost" size="sm" className="min-h-9 gap-1.5 text-xs">
              <ExternalLink className="h-3.5 w-3.5" />
              {bn ? 'খুলুন' : 'Open'}
            </Button>
          </a>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-[11px] leading-relaxed text-muted-foreground [scrollbar-width:thin]">
          {content || '—'}
        </pre>
      </CardContent>
    </Card>
  )
}

export function SeoSitemapRobotsView() {
  const { lang } = useUI()
  const { data, loading, error, refresh } = useSeoAudit()
  const bn = lang === 'bn'

  return (
    <SeoShell
      active="/admin/seo-center/sitemap-robots"
      titleBn="সাইটম্যাপ ও Robots.txt"
      titleEn="Sitemap & Robots.txt"
      descBn="লাইভ sitemap.xml ও robots.txt — হুবহু কনটেন্ট, URL সংখ্যা ও কপি সুবিধা"
      descEn="Live sitemap.xml & robots.txt — exact content, URL counts and copy tools"
      data={data}
      loading={loading}
      onRefresh={refresh}
    >
      {loading ? (
        <LoadingState rows={3} />
      ) : error || !data ? (
        <ErrorState onRetry={refresh} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <ListTree className="h-5 w-5 text-primary" />
              <p className="mt-2 text-2xl font-bold">{data.sitemap.urlCount}</p>
              <p className="text-xs text-muted-foreground">{bn ? 'সাইটম্যাপে মোট URL' : 'Total URLs in sitemap'}</p>
            </Card>
            <Card className="p-4">
              <BadgeCheck className="h-5 w-5 text-primary" />
              <p className="mt-2 text-2xl font-bold">{data.db.coursesPublished}</p>
              <p className="text-xs text-muted-foreground">{bn ? 'কোর্স URL (অটো-জেনারেটেড)' : 'Course URLs (auto-generated)'}</p>
            </Card>
            <Card className="p-4">
              <FileCode2 className="h-5 w-5 text-primary" />
              <p className="mt-2 text-2xl font-bold">{data.robots.hasSitemapDirective ? '✓' : '—'}</p>
              <p className="text-xs text-muted-foreground">{bn ? 'robots-এ Sitemap ডিরেক্টিভ' : 'Sitemap directive in robots'}</p>
            </Card>
          </div>

          <Card className="border-green-500/30 bg-green-500/5">
            <CardContent className="flex items-start gap-2.5 p-4 text-sm">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
              <p className="text-muted-foreground">
                {bn ? (
                  <>
                    <span className="font-medium text-green-600 dark:text-green-400">INSTANT সাইটম্যাপ:</span> কোর্স/কম্বো/নোটিশ পাবলিশ বা আপডেট করলে পরের রিকোয়েস্টেই sitemap.xml-এ চলে আসবে — কোনো অপেক্ষার সময় নেই (revision-probe cache, Cache-Control: no-cache)।
                  </>
                ) : (
                  <>
                    <span className="font-medium text-green-600 dark:text-green-400">Instant sitemap:</span> publish/update any course, combo or notice and it appears in sitemap.xml on the very next request — no stale window (revision-probe cache, Cache-Control: no-cache).
                  </>
                )}
              </p>
            </CardContent>
          </Card>

          {/* Google Search Console submission readiness. Real,
              live evidence (robots.txt + sitemap.xml are actually fetched by
              the audit engine; verification meta read from settings) so the
              admin sees exactly what is needed before GSC submission. */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">
                  {bn ? 'Google Search Console — সাবমিট রেডিনেস' : 'Google Search Console — submission readiness'}
                </p>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${data.robots.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`} />
                  {data.robots.ok
                    ? bn
                      ? <>robots.txt লাইভ ✓ — Sitemap ডিরেক্টিভ {data.robots.hasSitemapDirective ? 'উপস্থিত ✓' : 'অনুপস্থিত'}</>
                      : <>robots.txt live ✓ — Sitemap directive {data.robots.hasSitemapDirective ? 'present ✓' : 'missing'}</>
                    : bn ? 'robots.txt রেসপন্স দিচ্ছে না' : 'robots.txt not responding'}
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${data.sitemap.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`} />
                  {data.sitemap.ok
                    ? bn
                      ? <>sitemap.xml লাইভ ✓ — {data.sitemap.urlCount} টি URL (ডোমেইন অটো-সিঙ্ক: যে ডোমেইনে সাইট চলবে, সব URL সেই ডোমেইনেই তৈরি হবে)</>
                      : <>sitemap.xml live ✓ — {data.sitemap.urlCount} URLs (domain auto-sync: every URL follows whichever domain serves the site)</>
                    : bn ? 'sitemap.xml রেসপন্স দিচ্ছে না' : 'sitemap.xml not responding'}
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${data.db.gscVerified ? 'text-green-600 dark:text-green-400' : 'text-amber-500'}`} />
                  {data.db.gscVerified
                    ? bn ? 'Google verification মেটা প্রস্তুত ✓ — GSC-তে সাইট ভেরিফাই করা যাবে' : 'Google verification meta ready ✓ — the site can be verified in GSC'
                    : bn ? 'Settings → SEO সেটিংসে Google Site Verification কোড দিন, তারপর GSC-তে সাইট ভেরিফাই করুন' : 'Add the Google Site Verification code in Settings → SEO, then verify the site in GSC'}
                </li>
              </ul>
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {bn
                  ? 'GSC-তে সাইট ভেরিফাই করে sitemap.xml সাবমিট ও ইনডেক্সিং সম্পন্ন হলে সার্চ পারফরম্যান্সের রিয়েল-টাইম ভ্যালিড ডেটা চলে আসবে — তখন টেকনিক্যাল SEO সম্পূর্ণ ভ্যালিড অবস্থায় থাকবে।'
                  : 'Once the site is verified in GSC, sitemap.xml submitted and indexing completes, real-time valid search performance data starts flowing — technical SEO is then in a fully valid state.'}
              </p>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Link href="/admin/seo-center" className="inline-flex">
              <Button variant="ghost" size="sm" className="min-h-10 gap-2 text-xs">
                <ArrowLeft className="h-4 w-4" />
                {bn ? 'ওভারভিউ' : 'Overview'}
              </Button>
            </Link>
          </div>

          <CodeBlock title="/sitemap.xml" content={data.sitemap.content} href={`${data.base}/sitemap.xml`} />
          <CodeBlock title="/robots.txt" content={data.robots.content} href={`${data.base}/robots.txt`} />

          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-start gap-2.5 p-4 text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-muted-foreground">
                {bn ? (
                  <>
                    হিউম্যান-রিডেবল পেজ: <Link className="font-medium text-primary hover:underline" href="/sitemap">/sitemap</Link> —
                    সব URL এক ক্লিকে কপি করে Google Search Console-এ পেস্ট করা যায় (URL Inspection → Request indexing)।
                  </>
                ) : (
                  <>
                    Human-readable page: <Link className="font-medium text-primary hover:underline" href="/sitemap">/sitemap</Link> —
                    copy every URL in one click and paste into Google Search Console (URL Inspection → Request indexing).
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </SeoShell>
  )
}

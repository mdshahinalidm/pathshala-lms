'use client'

/**
 * Public ExamsView — /exams (rebuild)
 * Unified exam catalog in the SAME layout as the courses page: filter
 * sidebar on the LEFT (search, type, price, course), exam cards on the
 * RIGHT with feature images — MCQ + written, free + paid, all together.
 *
 * Click rules:
 *  • FREE + logged-in  → enroll (ExamEnrollment) → straight into the exam
 *    page; the exam is now in the student's dashboard exam section.
 *  • FREE + anonymous  → /login?next=… (enrolls right after login).
 *  • PAID (written)    → checkout /checkout/exam/[id]; it reaches the
 *    dashboard exam section the instant payment succeeds — never before.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, CheckCircle2, ClipboardList, Clock, FileText, Gift, HelpCircle, LogIn, Search, ShoppingBag, SlidersHorizontal, Zap } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { EmptyState } from '@/components/shared/empty-state'
import ExamQuestionsDialog from '@/components/shared/exam-questions-dialog'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet, apiPost } from '@/lib/api-client'
import { fmtBDT, fmtNum } from '@/lib/format'
import {
  ComboItemChips,
  type ComboLite,
  comboCheckoutHref,
  comboMatchesSurface,
} from '@/components/shared/combo-bits'

interface CatalogItem {
  kind: 'MCQ' | 'WRITTEN'
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  durationMin: number
  questionCount: number | null
  totalMarks: number | null
  isFree: boolean
  price: number | null
  courseTitle: string | null
  categoryName: string | null
  subjectName: string | null
  createdAt: string
}

type TypeFilter = 'all' | 'mcq' | 'written'
type PriceFilter = 'all' | 'free' | 'paid'

/** attempt statuses that mean the written exam is completed. */
const COMPLETED_ATTEMPT_STATUSES = ['SUBMITTED', 'MARKED', 'PUBLISHED']

/* Rotating gradient dot per type/course chip (same idiom as catalog) */
const CAT_TONES = ['grad-emerald', 'grad-violet', 'grad-amber', 'grad-rose', 'grad-cyan'] as const

function ExamCard({ exam, i, onFreeClick, onViewQuestions, purchased, completed, busy }: {
  exam: CatalogItem
  i: number
  onFreeClick: (exam: CatalogItem) => void
  /** open the questions dialog for this written exam */
  onViewQuestions: (exam: CatalogItem) => void
  /** SUCCESS purchase exists for this paid WRITTEN exam (logged-in owner) */
  purchased: boolean
  /** latest attempt status ∈ {SUBMITTED, MARKED, PUBLISHED} */
  completed: boolean
  busy: boolean
}) {
  const { tx, lang } = useUI()
  const { user } = useAuth()

  const isMcq = exam.kind === 'MCQ'
  const isWritten = exam.kind === 'WRITTEN'
  // MCQ free → straight into the runner; WRITTEN free → the My Exams list
  // (the exam is added there); paid → checkout.
  const freeTarget = isMcq ? `/dashboard/exam/${exam.id}` : '/dashboard/written-exams'
  const paidHref = `/checkout/exam/${exam.id}`
  const target = exam.isFree ? freeTarget : paidHref
  const href = user ? target : `/login?next=${encodeURIComponent(target)}`

  const handleClick = (e: React.MouseEvent) => {
    // Free exams: enroll first (idempotent), then navigate. Anonymous users
    // simply follow the login link. Paid exams go straight to checkout.
    if (!user || !exam.isFree) return
    e.preventDefault()
    onFreeClick(exam)
  }

  return (
    <article className="pop-hover group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      {/* Feature image (like courses) */}
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-primary/15 to-accent">
        {exam.imageUrl ? (
          <Image
            src={exam.imageUrl}
            alt={exam.title}
            fill
            priority={i < 3}
            loading={i < 3 ? 'eager' : 'lazy'}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ClipboardList className="h-12 w-12 text-primary/40" aria-hidden />
          </div>
        )}
        {/* Type badge (top-left) */}
        <Badge
          className={`absolute left-3 top-3 text-white hover:text-white ${
            isMcq ? 'grad-violet' : 'grad-cyan'
          } border-transparent`}
        >
          <ClipboardList className="h-3 w-3" aria-hidden />
          {isMcq ? tx('এমসিকিউ', 'MCQ') : tx('লিখিত', 'Written')}
        </Badge>
        {/* Free / price badge (top-right) */}
        {exam.isFree ? (
          <Badge className="absolute right-3 top-3 border-transparent bg-emerald-600 text-white hover:bg-emerald-600">
            {tx('ফ্রি', 'Free')}
          </Badge>
        ) : (
          <Badge className="absolute right-3 top-3 border-transparent bg-amber-500 text-white hover:bg-amber-500">
            {fmtBDT(exam.price ?? 0, lang)}
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug">{exam.title}</h3>
        {exam.description && <p className="line-clamp-2 text-sm text-muted-foreground">{exam.description}</p>}

        {(exam.courseTitle || exam.subjectName || exam.categoryName) && (
          <div className="flex flex-wrap gap-1.5">
            {exam.courseTitle && (
              <Badge variant="outline" className="w-fit border-violet-500/25 bg-violet-500/10 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                {exam.courseTitle}
              </Badge>
            )}
            {exam.subjectName && (
              <Badge variant="outline" className="w-fit border-emerald-500/25 bg-emerald-500/10 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                {exam.subjectName}
              </Badge>
            )}
            {exam.categoryName && (
              <Badge variant="outline" className="w-fit border-amber-500/25 bg-amber-500/10 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                {exam.categoryName}
              </Badge>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden /> {exam.durationMin} {tx('মিনিট', 'min')}
          </span>
          {isMcq && exam.questionCount != null && (
            <span className="inline-flex items-center gap-1">
              <HelpCircle className="h-3.5 w-3.5" aria-hidden /> {exam.questionCount} {tx('প্রশ্ন', 'questions')}
            </span>
          )}
          {!isMcq && exam.totalMarks != null && (
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" aria-hidden /> {exam.totalMarks} {tx('নম্বর', 'marks')}
            </span>
          )}
          {!isMcq && exam.questionCount === null && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden /> {tx('উত্তরপত্র ছবিতে জমা', 'photo answer sheet')}
            </span>
          )}
        </div>

        <div className="mt-auto border-t pt-3">
          {purchased && completed && (
            <Badge className="mb-2 w-fit gap-1 border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {tx('সম্পন্ন হয়েছে ✓', 'Completed ✓')}
            </Badge>
          )}
          {user && exam.isFree && isWritten ? (
            /* Free WRITTEN (logged-in): add-to-dashboard + questions preview */
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="min-w-0 flex-1 rounded-xl shadow-md"
                disabled={busy}
                onClick={() => onFreeClick(exam)}
              >
                <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">
                  {busy
                    ? tx('যোগ হচ্ছে…', 'Adding…')
                    : tx('ড্যাশবোর্ডে যোগ করুন', 'Add to my exams')}
                </span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 rounded-xl"
                onClick={() => onViewQuestions(exam)}
                aria-label={`${tx('প্রশ্ন দেখুন', 'See questions')}: ${exam.title}`}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                {tx('প্রশ্ন দেখুন', 'See questions')}
              </Button>
            </div>
          ) : user && exam.isFree ? (
            <Button
              type="button"
              size="sm"
              className="w-full rounded-xl shadow-md"
              disabled={busy}
              onClick={() => onFreeClick(exam)}
            >
              <Zap className="h-3.5 w-3.5" aria-hidden />
              {busy
                ? tx('যোগ হচ্ছে…', 'Adding…')
                : tx('অংশ নিন', 'Participate')}
            </Button>
          ) : user && !exam.isFree && purchased ? (
            /* Paid WRITTEN + purchased: questions replace the buy button */
            <Button
              type="button"
              size="sm"
              className="w-full rounded-xl shadow-md"
              onClick={() => onViewQuestions(exam)}
              aria-label={`${tx('প্রশ্ন দেখুন', 'See questions')}: ${exam.title}`}
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              {tx('প্রশ্ন দেখুন', 'See questions')}
            </Button>
          ) : user && !exam.isFree ? (
            <Button asChild size="sm" className="w-full rounded-xl shadow-md">
              <a href={paidHref}>
                <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
                {tx('কিনুন', 'Buy now')}
              </a>
            </Button>
          ) : (
            <Button asChild size="sm" className="w-full rounded-xl shadow-md">
              <a href={href} onClick={handleClick}>
                <LogIn className="h-3.5 w-3.5" aria-hidden />
                {exam.isFree
                  ? tx('লগইন করে অংশ নিন', 'Login to participate')
                  : tx('লগইন করে কিনুন', 'Login to buy')}
              </a>
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

function GridSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border p-3">
          <Skeleton className="aspect-[16/10] w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-9 w-full rounded-xl" />
        </div>
      ))}
    </div>
  )
}

export default function ExamsView() {
  const { tx, t } = useUI()
  const { user } = useAuth()

  const [items, setItems] = useState<CatalogItem[] | null>(null)
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([])
  const [combos, setCombos] = useState<ComboLite[] | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)

  // purchases (SUCCESS) → written-exam ids, attempts → status map.
  // Kept next to the userId that produced them so a stale map is never shown
  // for a different account (and logout simply hides them via `user`).
  const [owned, setOwned] = useState<{ userId: string; ids: Set<string> } | null>(null)
  const [attemptStates, setAttemptStates] = useState<{ userId: string; status: Record<string, string> } | null>(null)
  const [questionsExam, setQuestionsExam] = useState<{ id: string; title: string } | null>(null)
  const [questionsOpen, setQuestionsOpen] = useState(false)

  const purchasedExamIds = user && owned?.userId === user.id ? owned.ids : null
  const attemptStatus = user && attemptStates?.userId === user.id ? attemptStates.status : null

  // filters (courses-page pattern: LEFT sidebar on desktop, collapsible on mobile)
  const [search, setSearch] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [price, setPrice] = useState<PriceFilter>('all')
  const [courseId, setCourseId] = useState('')

  useEffect(() => {
    let alive = true
    apiGet<{ items: CatalogItem[]; courses: { id: string; title: string }[] }>('/api/exams/catalog')
      .then((d) => {
        if (!alive) return
        setItems(Array.isArray(d?.items) ? d.items : [])
        setCourses(Array.isArray(d?.courses) ? d.courses : [])
      })
      .catch((e: Error) => {
        if (!alive) return
        setError(e.message || tx('পরীক্ষা লোড করা যায়নি — আবার চেষ্টা করুন।', 'Could not load exams — please retry.'))
        setItems([])
      })
    return () => {
      alive = false
    }
  }, [reloadKey, tx])

  // exam-relevant combos (≥1 exam item) render on the exam page (exam-style cards)
  useEffect(() => {
    let alive = true
    apiGet<{ combos: ComboLite[] }>('/api/combos')
      .then((d) => {
        if (alive)
          setCombos((Array.isArray(d?.combos) ? d.combos : []).filter((c) => comboMatchesSurface(c, 'EXAM')))
      })
      .catch(() => {
        if (alive) setCombos([])
      })
    return () => {
      alive = false
    }
  }, [])

  // (logged-in only): map purchases → written exam ids and
  // attempts → per-exam status, for the "প্রশ্ন দেখুন" button + "সম্পন্ন" badge.
  useEffect(() => {
    if (!user) return
    const uid = user.id
    let alive = true
    apiGet<{ purchases: { examId: string | null; status: string }[] }>('/api/exam-purchases')
      .then((d) => {
        if (!alive) return
        const ids = new Set<string>()
        for (const p of d?.purchases ?? []) {
          if (p.examId && p.status === 'SUCCESS') ids.add(p.examId)
        }
        setOwned({ userId: uid, ids })
      })
      .catch(() => {
        if (alive) setOwned({ userId: uid, ids: new Set() })
      })
    apiGet<{ attempts: { status: string; exam: { id: string } }[] }>('/api/exam-attempts')
      .then((d) => {
        if (!alive) return
        const status: Record<string, string> = {}
        for (const a of d?.attempts ?? []) status[a.exam.id] = a.status
        setAttemptStates({ userId: uid, status })
      })
      .catch(() => {
        /* attempts are a nice-to-have here — card stays without the badge */
      })
    return () => {
      alive = false
    }
  }, [user])

  const filtered = useMemo(() => {
    if (!items) return []
    const q = search.trim().toLowerCase()
    return items.filter((e) => {
      if (type === 'mcq' && e.kind !== 'MCQ') return false
      if (type === 'written' && e.kind !== 'WRITTEN') return false
      if (price === 'free' && !e.isFree) return false
      if (price === 'paid' && e.isFree) return false
      if (courseId) {
        // course filter is by linked course id — resolve via catalog courses list
        const c = courses.find((c) => c.id === courseId)
        if (c && e.courseTitle !== c.title) return false
      }
      if (q && !(`${e.title} ${e.description ?? ''} ${e.subjectName ?? ''}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [items, search, type, price, courseId, courses])

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = []
    if (search.trim()) chips.push({ key: 'search', label: `“${search.trim()}”`, clear: () => setSearch('') })
    if (type !== 'all')
      chips.push({
        key: 'type',
        label: type === 'mcq' ? tx('এমসিকিউ', 'MCQ') : tx('লিখিত', 'Written'),
        clear: () => setType('all'),
      })
    if (price !== 'all')
      chips.push({ key: 'price', label: price === 'free' ? t('free') : t('paid'), clear: () => setPrice('all') })
    if (courseId) {
      const c = courses.find((c) => c.id === courseId)
      chips.push({ key: 'course', label: c?.title ?? courseId, clear: () => setCourseId('') })
    }
    return chips
  }, [search, type, price, courseId, courses, t, tx])

  /** Free exam click → enroll (idempotent) → straight into the exam page. */
  const onFreeClick = useCallback(
    (exam: CatalogItem) => {
      setBusyId(exam.id)
      apiPost<{ enrolled: boolean }>('/api/exam-enrollments', {
        kind: exam.kind,
        id: exam.id,
      })
        .then(() => {
          go(exam.kind === 'MCQ' ? `/dashboard/exam/${exam.id}` : '/dashboard/written-exams')
        })
        .catch((e: Error) => {
          // 401 → login (session may have expired mid-browse)
          if (e.message.includes('401') || e.message.toLowerCase().includes('লগইন')) {
            const target = exam.kind === 'MCQ' ? `/dashboard/exam/${exam.id}` : '/dashboard/written-exams'
            go(`/login?next=${encodeURIComponent(target)}`)
            return
          }
          setReloadKey((k) => k + 1)
        })
        .finally(() => setBusyId(null))
    },
    []
  )

  /** "প্রশ্ন দেখুন" → open the questions dialog for that written exam. */
  const openQuestions = useCallback((exam: CatalogItem) => {
    setQuestionsExam({ id: exam.id, title: exam.title })
    setQuestionsOpen(true)
  }, [])

  const filterPanel = (
    <div className="space-y-3">
      {/* Search */}
      <div className="space-y-1.5">
        <Label htmlFor="exam-search" className="text-xs">{t('search')}</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="exam-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_placeholder')}
            className="h-9 pl-9"
          />
        </div>
      </div>

      {/* Type chips */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium">{tx('ধরন', 'Type')}</span>
        <div className="flex flex-wrap gap-1.5">
          {([
            ['all', tx('সব', 'All'), ''],
            ['mcq', tx('এমসিকিউ', 'MCQ'), 'grad-violet'],
            ['written', tx('লিখিত', 'Written'), 'grad-cyan'],
          ] as const).map(([v, label, tone]) => (
            <button
              key={v}
              type="button"
              onClick={() => setType(v as TypeFilter)}
              aria-pressed={type === v}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                type === v ? 'grad-brand border-transparent text-white shadow-sm' : 'bg-card hover:bg-accent'
              }`}
            >
              <span aria-hidden className={`h-2 w-2 rounded-full ${type === v ? 'bg-white/80' : tone || 'rainbow-bar'}`} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Price */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium">{t('filter_price')}</span>
        <RadioGroup
          value={price}
          onValueChange={(v) => setPrice(v as PriceFilter)}
          className="flex flex-wrap items-center gap-x-4 gap-y-1.5"
        >
          {([
            ['all', tx('সব', 'All')],
            ['free', t('free')],
            ['paid', t('paid')],
          ] as const).map(([v, label]) => (
            <div key={v} className="flex items-center gap-1.5">
              <RadioGroupItem value={v} id={`exam-price-${v}`} className="h-4 w-4" />
              <Label htmlFor={`exam-price-${v}`} className="cursor-pointer text-xs font-normal">{label}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Course chips */}
      {courses.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium">{t('filter_category')}</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCourseId('')}
              aria-pressed={courseId === ''}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                courseId === '' ? 'grad-brand border-transparent text-white shadow-sm' : 'bg-card hover:bg-accent'
              }`}
            >
              <span aria-hidden className={`h-2 w-2 rounded-full ${courseId === '' ? 'bg-white/80' : 'rainbow-bar'}`} />
              {tx('সব', 'All')}
            </button>
            {courses.map((c, ci) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCourseId(c.id)}
                aria-pressed={courseId === c.id}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  courseId === c.id ? 'grad-brand border-transparent text-white shadow-sm' : 'bg-card hover:bg-accent'
                }`}
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full ${courseId === c.id ? 'bg-white/80' : CAT_TONES[ci % CAT_TONES.length]}`}
                />
                {c.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-3.5 py-8 sm:py-10">
      {/* Page heading */}
      <div className="text-left">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tx('পরীক্ষা কেন্দ্র', 'Exam Center')}</h1>
      </div>

      {/* Mobile filter toggle */}
      <div className="mt-6 lg:hidden">
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full">
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              {tx('ফিল্টার দেখুন', 'Show filters')}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 rounded-2xl border bg-card p-4">
            {filterPanel}
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-[228px_1fr]">
        {/* Sidebar (desktop) — LEFT, like the courses page */}
        <aside className="hidden lg:block" aria-label={tx('ফিল্টার', 'Filters')}>
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border bg-card p-4">
            {filterPanel}
          </div>
        </aside>

        {/* Results */}
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {items === null ? (
                t('loading')
              ) : (
                <>
                  <span className="grad-text-brand font-bold">{filtered.length}</span>{' '}
                  {tx('টি পরীক্ষা', 'exams')}
                </>
              )}
            </p>
            {activeFilters.map((f) => (
              <Badge key={f.key} variant="secondary" className="gap-1 rounded-full">
                {f.label}
                <button
                  type="button"
                  onClick={f.clear}
                  aria-label={`${tx('মুছুন', 'Clear')} ${f.label}`}
                  className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span aria-hidden>✕</span>
                </button>
              </Badge>
            ))}
          </div>

          {items === null ? (
            <GridSkeleton />
          ) : error ? (
            <EmptyState
              icon={<ClipboardList className="h-7 w-7" aria-hidden />}
              title={tx('সমস্যা হয়েছে', 'Something went wrong')}
              description={error}
              actionLabel={t('retry')}
              onAction={() => setReloadKey((k) => k + 1)}
            />
          ) : filtered.length === 0 && (combos?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-7 w-7" aria-hidden />}
              title={tx('কোনো পরীক্ষা পাওয়া যায়নি', 'No exams found')}
              description={tx(
                'ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন — নতুন পরীক্ষা প্রকাশ হলেই এখানে দেখতে পাবেন।',
                'Try changing filters — new exams appear here as soon as they are published.'
              )}
              actionLabel={activeFilters.length > 0 ? tx('সব ফিল্টার মুছুন', 'Clear all filters') : undefined}
              onAction={
                activeFilters.length > 0
                  ? () => { setSearch(''); setType('all'); setPrice('all'); setCourseId('') }
                  : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {/* combo offers live inside the exam grid — exam-style cards */}
              {(combos ?? []).map((c) => (
                <ExamComboCard key={c.id} combo={c} />
              ))}
              {filtered.map((exam, i) => (
                <ExamCard
                  key={`${exam.kind}-${exam.id}`}
                  exam={exam}
                  i={i}
                  onFreeClick={onFreeClick}
                  onViewQuestions={openQuestions}
                  purchased={purchasedExamIds?.has(exam.id) ?? false}
                  completed={COMPLETED_ATTEMPT_STATUSES.includes(attemptStatus?.[exam.id] ?? '')}
                  busy={busyId === exam.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* exam questions dialog (keyed per exam → fresh fetch state) */}
      {questionsExam && (
        <ExamQuestionsDialog
          key={questionsExam.id}
          examId={questionsExam.id}
          title={questionsExam.title}
          open={questionsOpen}
          onOpenChange={setQuestionsOpen}
        />
      )}
    </div>
  )
}

/* ── combo offer card — exam-page style (image header · combo
   badge · title → detail page · item chips · price + কিনুন). Sits inside
   the exam grid like a regular exam card; renders nothing by itself when
   zero combos (parent skips it). ── */
function ExamComboCard({ combo }: { combo: ComboLite }) {
  const { tx, lang } = useUI()
  const { user } = useAuth()
  const detailHref = `/combos/${combo.id}`
  const buyHref = comboCheckoutHref(combo.id, Boolean(user))

  return (
    <article className="pop-hover group relative flex h-full flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      {/* Feature image (like exam cards) */}
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-primary/15 to-accent">
        {combo.imageUrl ? (
          <Image
            src={combo.imageUrl}
            alt={combo.title}
            fill
            loading="lazy"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            unoptimized={combo.imageUrl.startsWith('http')}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="grad-amber flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg">
              <Gift className="h-7 w-7" aria-hidden />
            </span>
          </div>
        )}
        {/* Combo badge (top-left) + savings (top-right) */}
        <Badge className="absolute left-3 top-3 gap-1 border-transparent bg-amber-500 text-white hover:bg-amber-500">
          <Gift className="h-3 w-3" aria-hidden />
          {tx('কম্বো', 'Combo')}
        </Badge>
        {combo.savings > 0 ? (
          <Badge className="absolute right-3 top-3 border-transparent bg-emerald-600 text-white hover:bg-emerald-600">
            {fmtBDT(combo.savings, lang)} {tx('সাশ্রয়', 'save')}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug transition-colors group-hover:text-primary">
          <Link href={detailHref} className="after:absolute after:inset-0 after:content-['']">
            {combo.title}
          </Link>
        </h3>
        {combo.description && <p className="line-clamp-2 text-sm text-muted-foreground">{combo.description}</p>}

        <ComboItemChips items={combo.items} />

        <div className="mt-auto border-t pt-3">
          <div className="mb-2.5 flex items-baseline gap-2">
            <span className="grad-text-brand text-xl font-extrabold">{fmtBDT(combo.price, lang)}</span>
            {combo.originalTotal > combo.price ? (
              <span className="text-sm text-muted-foreground line-through">{fmtBDT(combo.originalTotal, lang)}</span>
            ) : null}
            {combo.savings > 0 ? (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {fmtBDT(combo.savings, lang)} {tx('সাশ্রয়', 'save')}
              </span>
            ) : null}
          </div>
          <Button asChild size="sm" className="w-full rounded-xl shadow-md">
            <Link href={buyHref}>
              <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
              {user ? tx('কিনুন', 'Buy now') : tx('লগইন করে কিনুন', 'Login to buy')}
            </Link>
          </Button>
        </div>
      </div>
    </article>
  )
}

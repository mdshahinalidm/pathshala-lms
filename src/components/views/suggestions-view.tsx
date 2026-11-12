'use client'

/**
 * SuggestionsView — free & paid study materials.
 *
 * modern professional filter — a horizontal filter bar exactly in
 * the user's reference style: keyword search · ক্যাটাগরি dropdown · মূল্য
 * dropdown · solid Search button. Active-filter chips + live result count
 * sit right below. The HONOURS (অনার্স) category is added so paid honours
 * suggestions are reachable; paid (unpurchased) cards get the colorful
 * site-wide treatment (gradient icon tile + amber border + solid price
 * badge); and course recommendations close the page at the bottom.
 * Every card keeps its প্রিভিউ (preview) option before download.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BadgeCheck,
  Download,
  Eye,
  Gift,
  Info,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react'
import SuggestionPreviewDialog, {
  type PreviewSuggestion,
} from '@/components/shared/suggestion-preview-dialog'
import { PdfFileIcon } from '@/components/shared/pdf-file-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeading } from '@/components/shared/section-heading'
import { CourseCard, type CourseCardData } from '@/components/shared/course-card'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet } from '@/lib/api-client'
import { fmtBDT, digitsBn, fmtNum } from '@/lib/format'
import {
  ComboItemChips,
  type ComboLite,
  comboCheckoutHref,
  comboMatchesSurface,
} from '@/components/shared/combo-bits'

interface Suggestion {
  id: string
  title: string
  description: string
  category: string
  isFree: boolean
  price: number
  fileName?: string | null
  fileSize?: number | null
  downloads: number
  hasFile: boolean
  purchased?: boolean
  createdAt?: string
}

const CATEGORIES = [
  { value: '', bn: 'সব ক্যাটাগরি', en: 'All categories' },
  { value: 'SSC', bn: 'এসএসসি', en: 'SSC' },
  { value: 'HSC', bn: 'এইচএসসি', en: 'HSC' },
  { value: 'HONOURS', bn: 'অনার্স', en: 'Honours' },
  { value: 'ADMISSION', bn: 'ভর্তি পরীক্ষা', en: 'Admission' },
  { value: 'JOB', bn: 'চাকরি', en: 'Job' },
  { value: 'GENERAL', bn: 'সাধারণ', en: 'General' },
]

/* Radix Select cannot hold an empty-string item value — 'ALL' maps to category '' */
const ALL = 'ALL'

/* Colorful 2.0 — rotating gradient tone per category (paid card icon tiles) */
const CAT_TONES: Record<string, string> = {
  SSC: 'grad-emerald',
  HSC: 'grad-cyan',
  HONOURS: 'grad-violet',
  ADMISSION: 'grad-amber',
  JOB: 'grad-rose',
  GENERAL: 'grad-orange',
}

type PriceFilter = 'all' | 'free' | 'paid'

export default function SuggestionsView() {
  const { t, tx, lang } = useUI()
  const user = useAuth((s) => s.user)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState<PriceFilter>('all')
  const [state, setState] = useState<{ loading: boolean; error: string; data: Suggestion[] }>({
    loading: true,
    error: '',
    data: [],
  })
  const [reloadKey, setReloadKey] = useState(0)
  const [previewItem, setPreviewItem] = useState<PreviewSuggestion | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  // suggestion-relevant combos (≥1 suggestion item) render on the suggestions page (suggestion-style, NO image)
  const [combos, setCombos] = useState<ComboLite[] | null>(null)
  // course recommendations close the page at the bottom
  const [courses, setCourses] = useState<CourseCardData[]>([])

  useEffect(() => {
    let alive = true
    apiGet<{ combos: ComboLite[] }>('/api/combos')
      .then((d) => {
        if (alive)
          setCombos(
            (Array.isArray(d?.combos) ? d.combos : []).filter((c) => comboMatchesSurface(c, 'SUGGESTION'))
          )
      })
      .catch(() => {
        if (alive) setCombos([])
      })
    return () => {
      alive = false
    }
  }, [])

  // All suggestions fetched once — search/category/price filter client-side
  // (instant, same pattern as the exams catalog).
  useEffect(() => {
    let cancelled = false
    apiGet<Suggestion[]>('/api/suggestions')
      .then((d) => {
        if (!cancelled) setState({ loading: false, error: '', data: Array.isArray(d) ? d : [] })
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ loading: false, error: e.message, data: [] })
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  useEffect(() => {
    let alive = true
    apiGet<CourseCardData[]>('/api/courses')
      .then((d) => {
        if (alive) setCourses(Array.isArray(d) ? d : [])
      })
      .catch(() => {
        if (alive) setCourses([])
      })
    return () => {
      alive = false
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return state.data.filter((s) => {
      if (category && s.category !== category) return false
      if (price === 'free' && !s.isFree) return false
      if (price === 'paid' && s.isFree) return false
      if (q && !`${s.title} ${s.description} ${s.category}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [state.data, search, category, price])

  const catLabel = (c: string) => {
    const found = CATEGORIES.find((x) => x.value === c)
    return found ? (lang === 'bn' ? found.bn : found.en) : c
  }

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = []
    if (search.trim())
      chips.push({
        key: 'search',
        label: `“${search.trim()}”`,
        clear: () => { setSearch(''); setSearchInput('') },
      })
    if (category) {
      const found = CATEGORIES.find((x) => x.value === category)
      chips.push({
        key: 'cat',
        label: found ? (lang === 'bn' ? found.bn : found.en) : category,
        clear: () => setCategory(''),
      })
    }
    if (price !== 'all')
      chips.push({ key: 'price', label: price === 'free' ? t('free') : t('paid'), clear: () => setPrice('all') })
    return chips
  }, [search, category, price, lang, t])

  const retry = () => {
    setState((s) => ({ ...s, loading: true, error: '' }))
    setReloadKey((k) => k + 1)
  }

  /** Search button / Enter — applies the keyword typed in the box. */
  const applySearch = () => setSearch(searchInput)

  /** Free → direct download. Paid+owned → download. Paid → checkout. */
  const handleDownload = (s: Suggestion) => {
    if (!s.hasFile) {
      toast.warning(tx('ফাইলটি শীঘ্রই যোগ করা হবে', 'The file will be added soon'))
      return
    }
    if (s.isFree) {
      window.location.assign(`/api/suggestions/${s.id}/download`)
      return
    }
    if (!user) {
      toast.warning(t('required_login'))
      go('/login?next=/suggestions')
      return
    }
    if (s.purchased) {
      window.location.assign(`/api/suggestions/${s.id}/download`)
      return
    }
    // Paid + logged in → checkout (payment → unlock + dashboard section)
    go(`/checkout/suggestion/${s.id}`)
  }

  /** প্রিভিউ — free/owned open inline; unpaid paid shows the locked state. */
  const openPreview = (s: Suggestion) => {
    setPreviewItem({ ...s, purchased: s.purchased })
    setPreviewOpen(true)
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-3.5 py-8 sm:py-10">
      <SectionHeading
        title={t('nav_suggestions')}
        subtitle={tx('পরীক্ষার সেরা সাজেশন, নোট ও রিসোর্স — ডাউনলোড করে নিন', 'Best exam suggestions, notes and resources — download now')}
      />

      {/* Free banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
        role="note"
      >
        <Info className="h-4 w-4 shrink-0" aria-hidden />
        {tx('ফ্রি সাজেশন সবার জন্য উন্মুক্ত — প্রিভিউ দেখে নিন, লগইন ছাড়াই ডাউনলোড করুন।', 'Free suggestions are open to everyone — preview first, download without login.')}
      </motion.div>

      {/* modern professional filter bar — search · ক্যাটাগরি · মূল্য · Search */}
      <div className="mt-6 rounded-2xl border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Keyword search */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="suggestion-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applySearch() }}
              placeholder={tx('সাজেশন খুঁজুন...', 'Search suggestions...')}
              aria-label={t('search')}
              className="h-11 pl-9"
            />
          </div>

          {/* Category dropdown */}
          <Select value={category || ALL} onValueChange={(v) => setCategory(v === ALL ? '' : v)}>
            <SelectTrigger aria-label={t('filter_category')} className="h-11 w-full sm:w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value || ALL} value={c.value || ALL}>
                  {lang === 'bn' ? c.bn : c.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Price dropdown */}
          <Select value={price} onValueChange={(v) => setPrice(v as PriceFilter)}>
            <SelectTrigger aria-label={t('filter_price')} className="h-11 w-full sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx('সব মূল্য', 'All prices')}</SelectItem>
              <SelectItem value="free">{t('free')}</SelectItem>
              <SelectItem value="paid">{t('paid')}</SelectItem>
            </SelectContent>
          </Select>

          {/* Solid Search button (reference style) */}
          <Button
            className="h-11 w-full gap-2 sm:w-auto sm:px-8"
            onClick={applySearch}
            aria-label={t('search')}
          >
            <Search className="h-4 w-4" aria-hidden />
            {t('search')}
          </Button>
        </div>
      </div>

      {/* Result count + active filter chips */}
      <div className="mt-5 mb-4 flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {state.loading ? (
            t('loading')
          ) : (
            <>
              {/* Count covers every card rendered in the grid —
                  suggestions AND the combo offer cards that live inside it */}
              <span className="grad-text-brand font-bold">{filtered.length + (combos?.length ?? 0)}</span>{' '}
              {tx('টি সাজেশন', 'suggestions')}
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
              <X className="h-3 w-3" aria-hidden />
            </button>
          </Badge>
        ))}
      </div>

      {/* Content */}
      <div>
        {state.loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : state.error ? (
          <EmptyState
            title={t('error')}
            description={state.error}
            actionLabel={t('retry')}
            onAction={retry}
          />
        ) : filtered.length === 0 && (combos?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<PdfFileIcon className="h-8 w-8" aria-hidden />}
            title={tx('কিছু পাওয়া যায়নি', 'Nothing found')}
            description={
              activeFilters.length > 0
                ? tx('ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন', 'Try changing filters and search again')
                : undefined
            }
            actionLabel={activeFilters.length > 0 ? tx('সব ফিল্টার মুছুন', 'Clear all filters') : undefined}
            onAction={
              activeFilters.length > 0
                ? () => { setSearch(''); setSearchInput(''); setCategory(''); setPrice('all') }
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* combo offers live inside the suggestions grid — suggestion-style cards (no image) */}
            {(combos ?? []).map((c) => (
              <SuggestionComboCard key={c.id} combo={c} />
            ))}
            {filtered.map((s, i) => {
              const tone = CAT_TONES[s.category] ?? 'grad-brand'
              // paid (unpurchased) cards get the colorful treatment —
              // gradient category tile + amber border + solid price badge.
              const paidHighlight = !s.isFree && !s.purchased
              return (
                <motion.article
                  key={s.id}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.05 }}
                  className={`flex h-full flex-col gap-3 rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md ${
                    paidHighlight ? 'border-amber-500/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        paidHighlight ? `${tone} text-white shadow-sm` : 'bg-primary/10 text-primary'
                      }`}
                    >
                      <PdfFileIcon className="h-5 w-5" aria-hidden />
                    </span>
                    {s.isFree ? (
                      <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        {t('free')}
                      </Badge>
                    ) : s.purchased ? (
                      <Badge className="gap-1 border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        <BadgeCheck className="h-3 w-3" /> {tx('কেনা হয়েছে', 'Owned')}
                      </Badge>
                    ) : (
                      <Badge className="border-transparent bg-amber-500 text-white hover:bg-amber-500">
                        {fmtBDT(s.price, lang)}
                      </Badge>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 font-semibold leading-snug">{s.title}</h3>
                    <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{s.description}</p>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1" aria-label={tx('ডাউনলোড সংখ্যা', 'Downloads')}>
                      <Download className="h-3.5 w-3.5" aria-hidden />
                      {digitsBn(s.downloads)}
                    </span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
                      {catLabel(s.category)}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      className="min-w-0 flex-1"
                      onClick={() => handleDownload(s)}
                      aria-label={`${s.isFree || s.purchased ? t('download') : tx('কিনুন', 'Buy')}: ${s.title}`}
                    >
                      {s.isFree || s.purchased ? (
                        <Download className="h-4 w-4" aria-hidden />
                      ) : (
                        <ShoppingCart className="h-4 w-4" aria-hidden />
                      )}
                      {s.isFree
                        ? t('free_download')
                        : s.purchased
                          ? t('download')
                          : `${tx('কিনুন', 'Buy')} · ${fmtBDT(s.price, lang)}`}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => openPreview(s)}
                      aria-label={`${tx('প্রিভিউ', 'Preview')}: ${s.title}`}
                      title={tx('প্রিভিউ', 'Preview')}
                    >
                      <Eye className="h-4 w-4" aria-hidden />
                      <span className="hidden sm:inline">{tx('প্রিভিউ', 'Preview')}</span>
                    </Button>
                  </div>
                </motion.article>
              )
            })}
          </div>
        )}
      </div>

      {/* course recommendations at the bottom of the suggestions page */}
      {courses.length > 0 && (
        <section className="mt-14 border-t pt-10" aria-label={tx('কোর্সের সাজেশন', 'Course recommendations')}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                {tx('কোর্স দিয়ে প্রস্তুতি নিন', 'Level up with our courses')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tx('সাজেশনের পাশাপাশি ভর্তি হয়ে যান সেরা কোর্সগুলোতে', 'Alongside suggestions, enroll in our best courses')}
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/courses" aria-label={tx('সব কোর্স দেখুন', 'View all courses')}>
                {tx('সব কোর্স দেখুন', 'View all courses')}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courses.slice(0, 6).map((c, i) => (
              <CourseCard key={c.id} course={c} priority={i < 3} />
            ))}
          </div>
        </section>
      )}

      {/* Login hint for paid items */}
      {!user && (
        <p className="mt-8 text-center text-xs text-muted-foreground">
          <BadgeCheck className="mr-1 inline h-3.5 w-3.5 text-primary" aria-hidden />
          {tx('পেইড সাজেশন কিনতে লগইন করুন — কেনার পর ড্যাশবোর্ডের "আমার সাজেশন" থেকে প্রিভিউ ও ডাউনলোড করুন; ফ্রি সাজেশনগুলোও সেখানে দেখা যাবে।', 'Log in to buy paid suggestions — after purchase, preview & download from "My Suggestions" in your dashboard; free suggestions appear there too.')}
        </p>
      )}

      {/* প্রিভিউ viewer — inline for free/owned, locked for unpaid paid */}
      <SuggestionPreviewDialog
        item={previewItem}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        loggedIn={Boolean(user)}
      />
    </div>
  )
}

/* ── combo offer card — suggestion-page style. NO feature image
   (suggestion combos never show one): Gift icon tile · title → detail
   page · item chips · price + কিনুন. Sits inside the suggestions grid
   like a regular suggestion card. ── */
function SuggestionComboCard({ combo }: { combo: ComboLite }) {
  const { tx, lang } = useUI()
  const { user } = useAuth()
  const detailHref = `/combos/${combo.id}`
  const buyHref = comboCheckoutHref(combo.id, Boolean(user))

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4 }}
      className="group relative flex h-full flex-col gap-3 rounded-2xl border border-amber-500/30 bg-card p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grad-amber flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm">
          <Gift className="h-5 w-5" aria-hidden />
        </span>
        {combo.savings > 0 ? (
          <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">
            {fmtBDT(combo.savings, lang)} {tx('সাশ্রয়', 'save')}
          </Badge>
        ) : (
          <Badge className="border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
            {tx('কম্বো', 'Combo')}
          </Badge>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 font-semibold leading-snug transition-colors group-hover:text-primary">
          <Link href={detailHref} className="after:absolute after:inset-0 after:content-['']">
            {combo.title}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{combo.description}</p>
      </div>

      <ComboItemChips items={combo.items} />

      <div className="relative z-10 flex items-center justify-between gap-2 border-t pt-3">
        <div className="flex items-baseline gap-2">
          <span className="grad-text-brand text-lg font-bold">{fmtBDT(combo.price, lang)}</span>
          {combo.originalTotal > combo.price ? (
            <span className="text-xs text-muted-foreground line-through">{fmtBDT(combo.originalTotal, lang)}</span>
          ) : null}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {fmtNum(combo.items.length, lang)} {tx('টি আইটেম', 'items')}
        </span>
      </div>

      <Button className="w-full gap-2" onClick={() => go(buyHref)}>
        <ShoppingCart className="h-4 w-4" aria-hidden />
        {user ? tx('কিনুন', 'Buy now') : tx('লগইন করে কিনুন', 'Login to buy')}
      </Button>
    </motion.article>
  )
}

'use client'

/**
 * CatalogView — all courses with filters (search, category, price).
 * Initial + re-synced state from hash query (q, cat, price);
 * debounced client-side re-fetch on filter change.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Gift, Search, SlidersHorizontal, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { CourseCard } from '@/components/shared/course-card'
import { EmptyState } from '@/components/shared/empty-state'
import { useUI, go } from '@/store/ui-store'
import { useHashRoute } from '@/hooks/use-hash-route'
import { useAuth } from '@/store/auth-store'
import { apiGet } from '@/lib/api-client'
import { fmtBDT, fmtNum } from '@/lib/format'
import {
  ComboItemChips,
  type ComboLite,
  comboCheckoutHref,
  comboMatchesSurface,
} from '@/components/shared/combo-bits'
import type { CourseCardData } from '@/components/shared/course-card'

interface CategoryItem {
  id: string
  name: string
  nameEn: string
  slug: string
  icon?: string | null
  _count?: { courses: number }
}

type PriceFilter = 'all' | 'free' | 'paid'

/* Colorful 2.0 — rotating gradient dot per category chip */
const CAT_TONES = ['grad-emerald', 'grad-violet', 'grad-amber', 'grad-rose', 'grad-cyan'] as const

interface CatalogInit {
  q: string
  cat: string
  price: PriceFilter
}

/** Wrapper — remounts the catalog whenever the hash query changes,
 *  so filters re-initialize from #/courses?q=..&cat=..&price=.. */
export default function CatalogView() {
  const route = useHashRoute()
  const init: CatalogInit = {
    q: route.query.get('q') ?? '',
    cat: route.query.get('cat') ?? '',
    price: (route.query.get('price') as PriceFilter) || 'all',
  }
  return <CatalogContent key={route.raw} init={init} />
}

function CatalogContent({ init }: { init: CatalogInit }) {
  const { t, tx, lang } = useUI()

  const [search, setSearch] = useState(init.q)
  const [category, setCategory] = useState(init.cat)
  const [price, setPrice] = useState<PriceFilter>(init.price)

  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [courses, setCourses] = useState<CourseCardData[]>([])
  const [combos, setCombos] = useState<ComboLite[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const firstSync = useRef(true)

  const loadCategories = useCallback(() => {
    apiGet<CategoryItem[]>('/api/courses/categories')
      .then((d) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => setCategories([]))
  }, [])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  // course-relevant combos (≥1 course item) render INSIDE the course grid (course-style cards)
  useEffect(() => {
    let alive = true
    apiGet<{ combos: ComboLite[] }>('/api/combos')
      .then((d) => {
        if (alive)
          setCombos((Array.isArray(d?.combos) ? d.combos : []).filter((c) => comboMatchesSurface(c, 'COURSE')))
      })
      .catch(() => {
        if (alive) setCombos([])
      })
    return () => {
      alive = false
    }
  }, [])

  // Debounced fetch on filter change (state updates run inside the timer callback)
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true)
      setError('')
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (category) params.set('category', category)
      if (price !== 'all') params.set('price', price)
      apiGet<CourseCardData[]>(`/api/courses?${params.toString()}`)
        .then((d) => setCourses(Array.isArray(d) ? d : []))
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false))
    }, firstSync.current ? 0 : 400)
    firstSync.current = false
    return () => clearTimeout(timer)
  }, [search, category, price, reloadKey])

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = []
    if (search.trim()) chips.push({ key: 'search', label: `“${search.trim()}”`, clear: () => setSearch('') })
    if (category) {
      const cat = categories.find((c) => c.slug === category)
      chips.push({
        key: 'cat',
        label: cat ? (lang === 'bn' ? cat.name : cat.nameEn || cat.name) : category,
        clear: () => setCategory(''),
      })
    }
    if (price !== 'all')
      chips.push({ key: 'price', label: price === 'free' ? t('free') : t('paid'), clear: () => setPrice('all') })
    return chips
  }, [search, category, price, categories, lang, t])

  const filterPanel = (
    <div className="space-y-3">
      {/* Search */}
      <div className="space-y-1.5">
        <Label htmlFor="catalog-search" className="text-xs">{t('search')}</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="catalog-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_placeholder')}
            className="h-9 pl-9"
          />
        </div>
      </div>

      {/* Category chips */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium">{t('filter_category')}</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategory('')}
            aria-pressed={category === ''}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              category === '' ? 'grad-brand border-transparent text-white shadow-sm' : 'bg-card hover:bg-accent'
            }`}
          >
            <span aria-hidden className={`h-2 w-2 rounded-full ${category === '' ? 'bg-white/80' : 'rainbow-bar'}`} />
            {tx('সব', 'All')}
          </button>
          {categories.map((c, ci) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.slug)}
              aria-pressed={category === c.slug}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                category === c.slug ? 'grad-brand border-transparent text-white shadow-sm' : 'bg-card hover:bg-accent'
              }`}
            >
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${category === c.slug ? 'bg-white/80' : CAT_TONES[ci % CAT_TONES.length]}`}
              />
              {lang === 'bn' ? c.name : c.nameEn || c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Level — removed (level retired site-wide) */}

      {/* Price (compact horizontal radio row) */}
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
              <RadioGroupItem value={v} id={`price-${v}`} className="h-4 w-4" />
              <Label htmlFor={`price-${v}`} className="cursor-pointer text-xs font-normal">{label}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-3.5 py-8 sm:py-10">
      {/* Page h1 (single per view) — same visual style as SectionHeading */}
      <div className="text-left">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('all_courses')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          {t('featured_sub')}
        </p>
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
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:block" aria-label={tx('ফিল্টার', 'Filters')}>
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border bg-card p-4">
            {filterPanel}
          </div>
        </aside>

        {/* Results */}
        <div className="min-w-0">
          {/* Result count + active filter chips */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {loading ? (
                t('loading')
              ) : (
                <>
                  {/* the count covers every card rendered in the grid —
                      courses AND the combo offer cards that live inside it */}
                  <span className="grad-text-brand font-bold">{courses.length + (combos?.length ?? 0)}</span>{' '}
                  {tx('টি কোর্স', 'courses')}
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

          {loading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-3 rounded-2xl border p-3">
                  <Skeleton className="aspect-[16/10] w-full rounded-xl" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              ))}
            </div>
          ) : error ? (
            <EmptyState title={t('error')} description={error} actionLabel={t('retry')} onAction={() => setReloadKey((k) => k + 1)} />
          ) : courses.length === 0 && (combos?.length ?? 0) === 0 ? (
            <EmptyState
              title={t('no_courses')}
              description={tx('ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন', 'Try changing filters and search again')}
              actionLabel={activeFilters.length > 0 ? tx('সব ফিল্টার মুছুন', 'Clear all filters') : undefined}
              onAction={
                activeFilters.length > 0
                  ? () => { setSearch(''); setCategory(''); setPrice('all') }
                  : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {/* combo offers live INSIDE the course grid — course-style image cards.
                  the first two combos sit at the very top of the grid (slots
                  0-1 on every breakpoint) → above the fold on all viewports. Eager-load
                  them so the browser's LCP candidate is never a lazy image (kills the
                  "add loading=eager" console advisory and starts the fetch immediately). */}
              {(combos ?? []).map((c, ci) => (
                <CatalogComboCard key={c.id} combo={c} priority={ci < 2} />
              ))}
              {courses.map((c, i) => (
                <CourseCard key={c.id} course={c} priority={i < 5} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
/* ── combo offer card — course-style (image · title · chips ·
   price row). Lives INSIDE the course grid. Title/image → the combo
   detail page (/combos/[id]); কিনুন → combo checkout with the login
   gate. Renders nothing when zero combos (site stays untouched). ── */
function CatalogComboCard({ combo, priority = false }: { combo: ComboLite; priority?: boolean }) {
  const { tx, lang } = useUI()
  const { user } = useAuth()
  const detailHref = `/combos/${combo.id}`
  const buyHref = comboCheckoutHref(combo.id, Boolean(user))

  return (
    <article className="pop-hover group relative flex h-full flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      {/* Feature image — course-style (Gift fallback when no image yet) */}
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-primary/15 via-accent to-amber-500/15">
        {combo.imageUrl ? (
          <Image
            src={combo.imageUrl}
            alt={combo.title}
            fill
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
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

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 min-h-[44px] text-base font-semibold leading-snug transition-colors group-hover:text-primary">
          <Link href={detailHref} className="after:absolute after:inset-0 after:content-['']">
            {combo.title}
          </Link>
        </h3>
        <p className="line-clamp-2 min-h-[40px] text-sm leading-snug text-muted-foreground">
          {combo.description || '\u00A0'}
        </p>

        <ComboItemChips items={combo.items} />

        {/* Price + Buy (above the stretched detail link) */}
        <div className="relative z-10 mt-auto flex items-center justify-between gap-2 border-t pt-3">
          <div className="flex items-baseline gap-2">
            <span className="grad-text-brand text-lg font-bold">{fmtBDT(combo.price, lang)}</span>
            {combo.originalTotal > combo.price ? (
              <span className="text-sm text-muted-foreground line-through">{fmtBDT(combo.originalTotal, lang)}</span>
            ) : null}
          </div>
          <Button size="sm" asChild className="rounded-xl shadow-md">
            <Link href={buyHref} aria-label={`${tx('কিনুন', 'Buy now')} — ${combo.title}`}>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              {tx('কিনুন', 'Buy now')}
            </Link>
          </Button>
        </div>
      </div>
    </article>
  )
}

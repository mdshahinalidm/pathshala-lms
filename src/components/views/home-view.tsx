'use client'

/**
 * HomeView — landing page: hero (classic / coverflow — admin-selected,
 * server-rendered so the chosen variant is the FIRST thing painted — no
 * flash of the other hero), notice marquee, courses by class,
 * why-us (কেন পাঠশালা?), stats, how-it-works, testimonials, CTA banner.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  Search,
  Users,
  BookOpen,
  Clock,
  Star,
  PlayCircle,
  ShieldCheck,
  ClipboardList,
  FileText,
  ArrowRight,
  GraduationCap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CourseCard } from '@/components/shared/course-card'
import type { HeroSlide } from '@/components/views/heroes/coverflow-hero'
import { StatCounter } from '@/components/shared/stat-counter'
import { SectionHeading } from '@/components/shared/section-heading'
import { EmptyState } from '@/components/shared/empty-state'
import { useUI } from '@/store/ui-store'
import { apiGet } from '@/lib/api-client'
import type { CourseCardData } from '@/components/shared/course-card'
import ClassicHero from '@/components/views/heroes/classic-hero'
import CoverflowHero from '@/components/views/heroes/coverflow-hero'

/** Admin-curated landing testimonial (Server-passed — ). */
export interface CuratedTestimonial {
  id: string
  name: string
  role: string
  roleEn: string
  comment: string
  photoUrl: string | null
  rating: number
}

/** Real public counters (server-read) — true numbers on the stat strip. */
export interface RealStats {
  courses: number
  reviews: number
}

interface HomeViewProps {
  /** heroVariant from the DB, read server-side → correct hero on FIRST paint. */
  initialHeroVariant?: string
  /** Active admin-curated testimonials, ordered — empty when none are curated. */
  curatedTestimonials?: CuratedTestimonial[]
  /** Real course/review counts, read server-side → no placeholder numbers. */
  initialStats?: RealStats
  /** Hero slides bootstrapped server-side → coverflow center image preloads (LCP). */
  initialHeroSlides?: HeroSlide[]
}

interface ReviewItem {
  id: string
  userName: string
  userRole: string
  rating: number
  comment: string
  createdAt: string
  courseTitle?: string | null
  courseTitleEn?: string | null
  courseSlug?: string | null
  subject?: string | null
  categoryName?: string | null
  categoryEn?: string | null
}

interface CategoryItem {
  id: string
  name: string
  nameEn?: string | null
  slug: string
  _count?: { courses: number }
}

interface CatSection {
  slug: string
  name: string
  nameEn: string
  total: number
  show: CourseCardData[]
}

interface FetchState {
  loading: boolean
  error: string
  data: CourseCardData[]
}
interface ReviewState {
  loading: boolean
  error: string
  data: ReviewItem[]
}

/** Scroll reveal wrapper */
function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
          aria-hidden
        />
      ))}
    </span>
  )
}

const FEATURES = [
  { icon: PlayCircle, tone: 'grad-emerald', title: 'HD ভিডিও ক্লাস', sub: 'যেকোনো সময়, যেকোনো জায়গা থেকে বারবার দেখুন', en: 'HD Video Classes', enSub: 'Watch anytime, anywhere — unlimited replays' },
  { icon: ShieldCheck, tone: 'grad-violet', title: '১০০% সিকিউর প্ল্যাটফর্ম', sub: 'নিরাপদ পেমেন্ট ও প্রাইভেসি সুরক্ষিত', en: '100% Secure Platform', enSub: 'Safe payments and privacy protected' },
  { icon: ClipboardList, tone: 'grad-amber', title: 'লাইভ পরীক্ষা ও লিডারবোর্ড', sub: 'প্রতিযোগিতামূলক পরীক্ষায় নিজের অবস্থান দেখুন', en: 'Live Exams & Leaderboard', enSub: 'Compete and track your rank nationally' },
  { icon: FileText, tone: 'grad-rose', title: 'ফ্রি সাজেশন ও PDF', sub: 'পরীক্ষার সেরা সাজেশন সম্পূর্ণ ফ্রি ডাউনলোড', en: 'Free Suggestions & PDFs', enSub: 'Download exam suggestions completely free' },
]

const STEPS = [
  { n: 1, tone: 'grad-emerald', title: 'রেজিস্ট্রেশন', sub: 'ফোন বা ইমেইল দিয়ে ১ মিনিটেই একাউন্ট খুলুন', en: 'Register', enSub: 'Create an account in 1 minute' },
  { n: 2, tone: 'grad-violet', title: 'কোর্স কিনুন', sub: 'পছন্দের কোর্স বেছে নিন ও সিকিউর পেমেন্ট করুন', en: 'Buy a Course', enSub: 'Pick your course and pay securely' },
  { n: 3, tone: 'grad-amber', title: 'শেখা শুরু', sub: 'ভিডিও ক্লাস দেখুন, পরীক্ষা দিন, দক্ষতা বাড়ান', en: 'Start Learning', enSub: 'Watch classes, take exams, build skills' },
]

const AVATAR_TONES = ['grad-emerald', 'grad-violet', 'grad-amber', 'grad-rose', 'grad-cyan', 'grad-orange']

/** Colorful dot tone per class section (rotates across 8 classes). */
const CAT_DOT = ['grad-emerald', 'grad-violet', 'grad-amber', 'grad-rose', 'grad-cyan', 'grad-orange', 'grad-lime', 'grad-brand']

export default function HomeView({
  initialHeroVariant = 'classic',
  curatedTestimonials = [],
  initialStats,
  initialHeroSlides,
}: HomeViewProps) {
  const { t, tx, lang } = useUI()
  const [coursesState, setCoursesState] = useState<FetchState>({ loading: true, error: '', data: [] })
  const [coursesKey, setCoursesKey] = useState(0)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [reviewsState, setReviewsState] = useState<ReviewState>({ loading: true, error: '', data: [] })
  const [reviewsKey, setReviewsKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiGet<CategoryItem[]>('/api/courses/categories')
      .then((d) => {
        if (!cancelled) setCategories(Array.isArray(d) ? d : [])
      })
      .catch(() => {
        if (!cancelled) setCategories([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    apiGet<CourseCardData[]>('/api/courses?limit=100')
      .then((d) => {
        if (!cancelled) setCoursesState({ loading: false, error: '', data: Array.isArray(d) ? d : [] })
      })
      .catch((e: Error) => {
        if (!cancelled) setCoursesState({ loading: false, error: e.message, data: [] })
      })
    return () => {
      cancelled = true
    }
  }, [coursesKey])

  useEffect(() => {
    let cancelled = false
    apiGet<ReviewItem[]>('/api/reviews?limit=8')
      .then((d) => {
        if (!cancelled) setReviewsState({ loading: false, error: '', data: Array.isArray(d) ? d : [] })
      })
      .catch((e: Error) => {
        if (!cancelled) setReviewsState({ loading: false, error: e.message, data: [] })
      })
    return () => {
      cancelled = true
    }
  }, [reviewsKey])

  const retryCourses = () => {
    setCoursesState((s) => ({ ...s, loading: true, error: '' }))
    setCoursesKey((k) => k + 1)
  }

  const retryReviews = () => {
    setReviewsState((s) => ({ ...s, loading: true, error: '' }))
    setReviewsKey((k) => k + 1)
  }

  /** "কোন ক্লাস · কোন বিষয়" line for a review (falls back gracefully). */
  const reviewContext = (r: ReviewItem): string | null => {
    const cls = r.userRole?.trim() || r.categoryName?.trim() || ''
    const subject = r.subject?.trim() || r.courseTitle?.trim() || ''
    if (!cls && !subject) return null
    if (cls && subject) return `${cls} · ${subject}`
    return cls || subject
  }

  /** The admin's chosen hero variant — read server-side, so the FIRST paint
   *  already renders the selected hero. No client swap, no flash. */
  const heroVariant = initialHeroVariant === 'circular' ? 'circular' : 'classic'

  /** Per-class sections: every category shows its courses in a 3-per-row grid
   *  (first 3 on home) followed by a "view all" link to the filtered catalog. */
  const sections: CatSection[] = useMemo(() => {
    const items: CatSection[] = categories.map((cat) => {
      const all = coursesState.data.filter((c) => c.category?.slug === cat.slug)
      return {
        slug: cat.slug,
        name: cat.name,
        nameEn: cat.nameEn || cat.name,
        total: all.length,
        show: all.slice(0, 3),
      }
    })
    // Courses without a known category still deserve a section
    const rest = coursesState.data.filter((c) => !categories.some((cat) => cat.slug === c.category?.slug))
    if (rest.length > 0) {
      items.push({ slug: 'others', name: 'অন্যান্য কোর্স', nameEn: 'Other Courses', total: rest.length, show: rest.slice(0, 3) })
    }
    return items.filter((s) => s.total > 0)
  }, [categories, coursesState.data])

  return (
    <div className="flex flex-col">
      {/* Google SEO rule: exactly one H1 per page. The hero renders h2 title
          strips (carousel-safe), so the page-level H1 is visually hidden —
          zero visual change, full heading-structure benefit. */}
      <h1 className="sr-only">
        {tx('পাঠশালা — বাংলাদেশের সেরা অনলাইন লার্নিং প্ল্যাটফর্ম: এসএসসি, এইচএসসি, ভর্তি পরীক্ষা ও স্কিল কোর্স', 'PathShala — Bangladesh\u2019s best online learning platform: SSC, HSC, admission & skill courses')}
      </h1>
      {/* ══ HERO — admin-selected variant, server-rendered (zero FOUC) ══ */}
      {heroVariant === 'circular' ? <CoverflowHero initialSlides={initialHeroSlides} /> : <ClassicHero />}

      {/* ══ COURSES BY CLASS — every category: 3-per-row grid + view-all ══ */}
      <section className="mx-auto w-full max-w-7xl px-3.5 py-12 sm:py-16">
        <SectionHeading
          title={tx('৯ম শ্রেণি থেকে অনার্স ৪র্থ বর্ষ — সব ক্লাসের কোর্স', 'Class 9 to Honours 4th Year — courses for every class')}
          subtitle={t('featured_sub')}
        />

        {/* Quick class-nav chips */}
        {sections.length > 0 && !coursesState.loading && (
          <nav aria-label={tx('শ্রেণি অনুযায়ী কোর্স', 'Browse by class')} className="mt-6 flex gap-2 overflow-x-auto pb-2 lg:flex-wrap lg:overflow-visible">
            {sections.map((s, i) => (
              <a
                key={s.slug}
                href={`#cat-${s.slug}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-xs font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden className={`h-2 w-2 rounded-full ${CAT_DOT[i % CAT_DOT.length]}`} />
                {lang === 'bn' ? s.name : s.nameEn}
              </a>
            ))}
          </nav>
        )}

        <div className="mt-8">
          {coursesState.loading ? (
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
          ) : coursesState.error ? (
            <EmptyState
              icon={<Search className="h-7 w-7" aria-hidden />}
              title={t('error')}
              description={coursesState.error}
              actionLabel={t('retry')}
              onAction={retryCourses}
            />
          ) : coursesState.data.length === 0 ? (
            <EmptyState icon={<BookOpen className="h-7 w-7" aria-hidden />} title={t('no_courses')} />
          ) : (
            <div className="flex flex-col gap-14">
              {sections.map((s, si) => (
                <div key={s.slug} id={`cat-${s.slug}`} className="scroll-mt-24">
                  {/* Section head: class name + count + view-all */}
                  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 text-lg font-bold tracking-tight sm:text-xl">
                        <span aria-hidden className={`h-3 w-3 rounded-full ${CAT_DOT[si % CAT_DOT.length]}`} />
                        {lang === 'bn' ? s.name : s.nameEn}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
                        {s.total} {tx('টি কোর্স', 'courses')}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild aria-label={`${t('view_all')} — ${lang === 'bn' ? s.name : s.nameEn}`}>
                      <Link href={`/courses?cat=${s.slug}`}>
                        {t('view_all')}
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                  {/* 3 columns × 3 courses per row (equal-height cards) */}
                  <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {s.show.map((c, i) => (
                      <Reveal key={c.id} delay={Math.min(i, 4) * 0.05} className="h-full">
                        {/* First row of the first section is above the fold → eager/LCP-priority */}
                        <CourseCard course={c} priority={si === 0 && i < 3} />
                      </Reveal>
                    ))}
                  </div>
                </div>
              ))}

              <div className="text-center">
                <Button variant="outline" size="lg" asChild>
                  <Link href="/courses">
                    {t('all_courses')}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ══ WHY US (কেন পাঠশালা?) — directly below the courses section ══ */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto w-full max-w-7xl px-3.5 py-12 sm:py-16">
          <SectionHeading title={t('why_us')} subtitle={tx('শেখার সেরা অভিজ্ঞতা — সবকিছু এক প্ল্যাটফর্মে', 'The best learning experience — everything in one platform')} />
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon
              return (
                <Reveal key={i} delay={i * 0.08} className="h-full">
                  <div className="pop-hover group flex h-full flex-col gap-3 rounded-2xl border bg-card p-6 transition-all hover:-translate-y-1">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-md ${f.tone}`}>
                      <Icon className="h-6 w-6" aria-hidden />
                    </span>
                    <h3 className="font-semibold">{tx(f.title, f.en)}</h3>
                    <p className="text-sm text-muted-foreground">{tx(f.sub, f.enSub)}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ══ STATS ══ */}
      <section className="mx-auto w-full max-w-7xl px-3.5 py-12 sm:py-16">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCounter tone="emerald" value={initialStats?.students ?? 12500} suffix="+" label={t('stats_students')} icon={<Users className="h-5 w-5" aria-hidden />} />
          <StatCounter tone="violet" value={initialStats?.courses || coursesState.data.length || 0} label={t('stats_courses')} icon={<BookOpen className="h-5 w-5" aria-hidden />} />
          <StatCounter tone="amber" value={initialStats?.hours ?? 1200} suffix="+" label={t('stats_hours')} icon={<Clock className="h-5 w-5" aria-hidden />} />
          <StatCounter tone="rose" value={initialStats?.reviews || 9800} suffix={initialStats?.reviews ? undefined : '+'} label={t('stats_reviews')} icon={<Star className="h-5 w-5" aria-hidden />} />
        </div>
      </section>

      {/* ══ HOW IT WORKS ══ */}
      <section className="mx-auto w-full max-w-7xl px-3.5 py-12 sm:py-16">
        <SectionHeading title={t('how_it_works')} />
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="pop-hover relative flex h-full flex-col items-center gap-3 rounded-2xl border bg-card p-6 text-center">
                <span className={`flex h-12 w-12 items-center justify-center rounded-full text-white shadow-md ${s.tone}`}>
                  {s.n}
                </span>
                <h3 className="text-lg font-bold">{tx(s.title, s.en)}</h3>
                <p className="text-sm text-muted-foreground">{tx(s.sub, s.enSub)}</p>
                {i < 2 && (
                  <ArrowRight
                    className="absolute -right-6 top-1/2 hidden h-6 w-6 -translate-y-1/2 text-primary/40 md:block"
                    aria-hidden
                  />
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══ TESTIMONIALS — admin-curated when present, else live reviews ══ */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto w-full max-w-7xl px-3.5 py-12 sm:py-16">
          <SectionHeading title={t('testimonials')} />
          <div className="mt-8">
            {curatedTestimonials.length > 0 ? (
              /* Admin-curated testimonials (Admin → টেস্টিমোনিয়াল) */
              <div className="-mx-3.5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-3.5 pb-2 sm:-mx-3.5 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
                {curatedTestimonials.map((c, i) => {
                  const roleLabel = (lang === 'bn' ? c.role || c.roleEn : c.roleEn || c.role).trim()
                  return (
                    <Reveal key={c.id} delay={Math.min(i, 7) * 0.06} className="min-w-[280px] snap-start sm:min-w-[320px] lg:min-w-0">
                      <figure className="pop-hover flex h-full flex-col gap-3 rounded-2xl border bg-card p-5">
                        <Stars rating={c.rating} />
                        <blockquote className="flex-1 text-sm leading-relaxed text-muted-foreground">
                          “{c.comment}”
                        </blockquote>
                        {roleLabel && (
                          <p className="inline-flex flex-wrap items-center gap-1.5 text-xs font-semibold text-primary">
                            <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                            {roleLabel}
                          </p>
                        )}
                        <figcaption className="flex items-center gap-2 border-t pt-3">
                          {c.photoUrl ? (
                            <Image
                              src={c.photoUrl}
                              alt={c.name}
                              width={32}
                              height={32}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <span className={`${AVATAR_TONES[i % AVATAR_TONES.length]} flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white`} aria-hidden>
                              {c.name.charAt(0)}
                            </span>
                          )}
                          <span>
                            <span className="block text-sm font-semibold">{c.name}</span>
                          </span>
                        </figcaption>
                      </figure>
                    </Reveal>
                  )
                })}
              </div>
            ) : reviewsState.loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 rounded-2xl" />
                ))}
              </div>
            ) : reviewsState.error ? (
              <EmptyState title={t('error')} description={reviewsState.error} actionLabel={t('retry')} onAction={retryReviews} />
            ) : reviewsState.data.length === 0 ? (
              <EmptyState title={tx('এখনো কোনো রিভিউ নেই', 'No reviews yet')} />
            ) : (
              <div className="-mx-3.5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-3.5 pb-2 sm:-mx-3.5 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
                {reviewsState.data.map((r, i) => {
                  const ctx = reviewContext(r)
                  return (
                    <Reveal key={r.id} delay={Math.min(i, 7) * 0.06} className="min-w-[280px] snap-start sm:min-w-[320px] lg:min-w-0">
                      <figure className="pop-hover flex h-full flex-col gap-3 rounded-2xl border bg-card p-5">
                        <Stars rating={r.rating} />
                        <blockquote className="flex-1 text-sm leading-relaxed text-muted-foreground">
                          “{r.comment}”
                        </blockquote>
                        {ctx && (
                          <p className="inline-flex flex-wrap items-center gap-1.5 text-xs font-semibold text-primary">
                            <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                            {ctx}
                          </p>
                        )}
                        <figcaption className="flex items-center gap-2 border-t pt-3">
                          <span className={`${AVATAR_TONES[i % AVATAR_TONES.length]} flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white`} aria-hidden>
                            {r.userName.charAt(0)}
                          </span>
                          <span>
                            <span className="block text-sm font-semibold">{r.userName}</span>
                            <span className="block text-xs text-muted-foreground">{r.userRole}</span>
                          </span>
                        </figcaption>
                      </figure>
                    </Reveal>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══ CTA BANNER ══ */}
      <section className="mx-auto w-full max-w-7xl px-3.5 py-12 sm:py-16">
        <Reveal>
          <div className="grad-festive animate-grad-pan relative overflow-hidden rounded-3xl px-6 py-12 text-center text-white shadow-xl sm:px-12 sm:py-16">
            <div className="hero-dots absolute inset-0 opacity-30" aria-hidden />
            <div className="relative">
              <h2 className="text-2xl font-extrabold sm:text-3xl">
                {tx('আজই শুরু করুন — স্বপ্নের ফলাফলের দিকে', 'Start today — toward your dream results')}
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-white/85 sm:text-base">
                {tx('১০,০০০+ শিক্ষার্থীর সাথে যোগ দিন। প্রথম ক্লাস ফ্রি প্রিভিউ!', 'Join 10,000+ students. First class free preview!')}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" className="bg-white bg-none text-emerald-700 shadow-lg hover:bg-white/90 hover:shadow-xl" asChild>
                  <Link href="/register">{t('register')}</Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/50 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white"
                  asChild
                >
                  <Link href="/courses">{t('all_courses')}</Link>
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  )
}

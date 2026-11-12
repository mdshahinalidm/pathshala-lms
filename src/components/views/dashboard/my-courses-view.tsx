'use client'

/**
 * My Courses — student dashboard landing view.
 * Shows a "keep learning" summary strip + enrollment cards with progress rings.
 */
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { BookOpen, PlayCircle, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { CircularProgress } from '@/components/shared/circular-progress'
import { EmptyState } from '@/components/shared/empty-state'
import { ValidityChip } from '@/components/shared/validity-chip'
import { useUI, go } from '@/store/ui-store'
import { apiGet } from '@/lib/api-client'
import { digitsBn } from '@/lib/format'

interface Enrollment {
  id: string
  progress: number
  enrolledAt: string
  expiresAt?: string | null
  accessStatus?: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'LIFETIME'
  completedLessonIds: string[]
  course: {
    id: string
    title: string
    slug: string
    thumbnail: string | null
    price: number
    level: string
    isLifetime?: boolean
    validityMonths?: number | null
  }
  lessonsTotal: number
}

export default function MyCoursesView() {
  const { t, tx, lang } = useUI()
  const [items, setItems] = useState<Enrollment[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    ;(async () => {
      try {
        const data = await apiGet<Enrollment[]>('/api/enrollments')
        if (alive) setItems(data)
      } catch {
        if (alive) setError(true)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [nonce])

  const stats = useMemo(() => {
    const list = items ?? []
    const avg = list.length
      ? Math.round(list.reduce((s, e) => s + (e.progress || 0), 0) / list.length)
      : 0
    const done = list.reduce((s, e) => s + (e.completedLessonIds?.length ?? 0), 0)
    return { avg, done }
  }, [items])

  const num = (n: number) => (lang === 'bn' ? digitsBn(n) : String(n))

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">{t('my_courses')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('my_courses_sub')}</p>
      </div>

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border bg-card">
                <Skeleton className="aspect-video w-full rounded-none" />
                <div className="space-y-3 p-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <EmptyState
          icon={<TrendingUp className="h-7 w-7" />}
          title={t('error')}
          description={tx('কোর্সগুলো লোড করা যায়নি। আবার চেষ্টা করুন।', 'Could not load your courses. Please retry.')}
          actionLabel={t('retry')}
          onAction={() => setNonce((n) => n + 1)}
        />
      ) : !items || items.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-7 w-7" />}
          title={t('no_enrollments')}
          description={tx('আপনার পছন্দের কোর্সে ভর্তি হয়ে আজই শেখা শুরু করুন।', 'Enroll in a course you love and start learning today.')}
          actionLabel={t('browse_courses')}
          onAction={() => go('#/courses')}
        />
      ) : (
        <>
          {/* Keep-learning summary strip */}
          <div className="mb-6 flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border bg-gradient-to-r from-emerald-500/12 via-violet-500/10 to-amber-500/12 p-4">
            <span className="grad-brand flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-md">
              <TrendingUp className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">{tx('গড় অগ্রগতি', 'Average progress')}</p>
              <p className="grad-text-brand text-xl font-bold leading-tight">{num(stats.avg)}%</p>
            </div>
            <div className="ml-auto flex items-center gap-6 text-center">
              <div>
                <p className="grad-text-brand text-lg font-bold leading-tight">{num(items.length)}</p>
                <p className="text-xs text-muted-foreground">{tx('চলমান কোর্স', 'Active courses')}</p>
              </div>
              <div>
                <p className="grad-text-festive text-lg font-bold leading-tight">{num(stats.done)}</p>
                <p className="text-xs text-muted-foreground">{tx('লেসন সম্পন্ন', 'Lessons done')}</p>
              </div>
            </div>
          </div>

          {/* Enrollment cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((e, i) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.35, ease: 'easeOut' }}
                className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-primary/15 to-accent">
                  {e.course.thumbnail ? (
                    <Image
                      src={e.course.thumbnail}
                      alt={e.course.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      /* first row is above the fold → eager + priority (LCP) */
                      priority={i < 3}
                      loading={i < 3 ? 'eager' : 'lazy'}
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <BookOpen className="h-12 w-12 text-primary/40" />
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-3 p-4">
                  <h3 className="line-clamp-2 text-base font-semibold leading-snug">{e.course.title}</h3>

                  {/* Access status (course validity) */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ValidityChip isLifetime={e.course.isLifetime} validityMonths={e.course.validityMonths} />
                    {e.accessStatus === 'LIFETIME' && (
                      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600">∞ {tx('লাইফটাইম', 'Lifetime')}</Badge>
                    )}
                    {e.accessStatus === 'ACTIVE' && (
                      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600">✓ {tx('সক্রিয়', 'Active')}</Badge>
                    )}
                    {e.accessStatus === 'EXPIRING_SOON' && (
                      <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-600">⏳ {tx('শেষ হচ্ছে', 'Expiring soon')}</Badge>
                    )}
                    {e.accessStatus === 'EXPIRED' && (
                      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">{tx('মেয়াদ শেষ', 'Expired')}</Badge>
                    )}
                    {e.expiresAt && e.accessStatus !== 'EXPIRED' && e.accessStatus !== 'LIFETIME' && (
                      <span className="text-[11px] text-muted-foreground">
                        {tx('মেয়াদ', 'Until')}: {new Date(e.expiresAt).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <CircularProgress value={e.progress || 0} size={56} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">{t('progress')}</p>
                      <p className="mt-0.5 text-sm font-semibold">
                        {num(e.completedLessonIds?.length ?? 0)}
                        <span className="text-muted-foreground"> / {num(e.lessonsTotal)} </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {t('lessons_count')}
                        </span>
                      </p>
                    </div>
                  </div>

                  <Button
                    className="mt-auto w-full gap-2"
                    onClick={() => go(`#/dashboard/classroom/${e.course.id}`)}
                  >
                    <PlayCircle className="h-4 w-4" />
                    {t('continue_learning')}
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

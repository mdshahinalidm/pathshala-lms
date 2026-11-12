'use client'

/**
 * LiveClassesView (student) — published live classes split into আসন্ন (upcoming)
 * and হয়ে গেছে (past, dimmed). Join buttons only work for upcoming classes.
 * API: GET /api/live-classes (published only, server-side auth).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  CalendarClock,
  Clock,
  ExternalLink,
  GraduationCap,
  Video,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { apiGet } from '@/lib/api-client'
import { digitsBn, fmtDateTime } from '@/lib/format'
import { go, useUI } from '@/store/ui-store'
import { cn } from '@/lib/utils'

interface LiveClassRow {
  id: string
  title: string
  provider: 'ZOOM' | 'MEET' | 'CUSTOM'
  joinUrl: string
  scheduledAt: string
  durationMin: number
  notes: string | null
  isPublished: boolean
  course: { id: string; title: string; slug: string } | null
}

function providerLabel(p: string, tx: (bn: string, en: string) => string): string {
  if (p === 'ZOOM') return 'Zoom'
  if (p === 'MEET') return tx('গুগল মিট', 'Google Meet')
  return tx('লাইভ', 'Live')
}

function providerStyle(p: string): string {
  switch (p) {
    case 'ZOOM':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300'
    case 'MEET':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
    default:
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
  }
}

export default function LiveClassesView() {
  const { tx, lang, t } = useUI()

  const [classes, setClasses] = useState<LiveClassRow[] | null>(null)
  const [error, setError] = useState(false)
  const [nowTs, setNowTs] = useState(() => Date.now())

  const num = (n: number | string) => (lang === 'bn' ? digitsBn(n) : String(n))

  const load = useCallback(async () => {
    setError(false)
    try {
      const data = await apiGet<LiveClassRow[]>('/api/live-classes')
      setClasses(data)
    } catch (e) {
      setError(true)
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    }
  }, [tx])

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [load])

  // Refresh the upcoming/past split periodically while the page stays open.
  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const { upcoming, past } = useMemo(() => {
    const upcoming: LiveClassRow[] = []
    const past: LiveClassRow[] = []
    for (const c of classes ?? []) {
      (new Date(c.scheduledAt).getTime() + c.durationMin * 60_000 >= nowTs ? upcoming : past).push(c)
    }
    upcoming.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    past.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
    return { upcoming, past }
  }, [classes, nowTs])

  const renderCard = (c: LiveClassRow, isPast: boolean, index: number) => (
    <motion.div
      key={c.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.3), duration: 0.3 }}
    >
      <Card className={cn('h-full transition-shadow hover:shadow-md', isPast && 'opacity-60')}>
        <CardContent className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                isPast ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
              )}
            >
              <Video className="h-5 w-5" />
            </span>
            <Badge variant="secondary" className={providerStyle(c.provider)}>
              {providerLabel(c.provider, tx)}
            </Badge>
          </div>
          <div className="min-w-0">
            <h3 className="line-clamp-2 font-semibold">{c.title}</h3>
            {c.course && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <GraduationCap className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">{c.course.title}</span>
              </p>
            )}
          </div>
          <div className="mt-auto space-y-1.5 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              {fmtDateTime(c.scheduledAt, lang)}
            </p>
            <p className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {num(c.durationMin)} {tx('মিনিট', 'min')}
            </p>
          </div>
          {isPast ? (
            <Button variant="outline" size="sm" className="w-full" disabled>
              {tx('ক্লাস শেষ হয়ে গেছে', 'Class has ended')}
            </Button>
          ) : (
            <Button size="sm" className="w-full gap-1.5" asChild>
              <a href={c.joinUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                {tx('লাইভ ক্লাসে জয়েন করুন', 'Join live class')}
              </a>
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">{tx('লাইভ ক্লাস', 'Live Classes')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tx(
            'শিডিউল করা লাইভ ক্লাসগুলো সময়মতো জয়েন করুন।',
            'Join your scheduled live classes on time.'
          )}
        </p>
      </div>

      {classes === null && !error ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<Video className="h-7 w-7" />}
          title={t('error')}
          description={tx('লাইভ ক্লাস লোড করা যায়নি।', 'Could not load live classes.')}
          actionLabel={t('retry')}
          onAction={() => void load()}
        />
      ) : !classes || classes.length === 0 ? (
        <EmptyState
          icon={<Video className="h-7 w-7" />}
          title={tx('কোনো লাইভ ক্লাস নেই', 'No live classes yet')}
          description={tx(
            'নতুন লাইভ ক্লাস শিডিউল হলে এখানে দেখতে পাবেন।',
            'Scheduled live classes will appear here.'
          )}
        />
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <section className="space-y-3" aria-label={tx('আসন্ন ক্লাস', 'Upcoming classes')}>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
                {tx('আসন্ন', 'Upcoming')}
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  {num(upcoming.length)}
                </Badge>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {upcoming.map((c, i) => renderCard(c, false, i))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-3" aria-label={tx('হয়ে গেছে', 'Past classes')}>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                {tx('হয়ে গেছে', 'Past')}
                <Badge variant="secondary">{num(past.length)}</Badge>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {past.map((c, i) => renderCard(c, true, i))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

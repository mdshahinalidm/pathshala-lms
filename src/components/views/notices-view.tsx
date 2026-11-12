'use client'

/**
 * NoticesView — notice board with type filter tabs and staggered reveal.
 */

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Megaphone, CalendarDays, ArrowRight, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeading } from '@/components/shared/section-heading'
import { useUI } from '@/store/ui-store'
import { apiGet } from '@/lib/api-client'
import { fmtDate, noticeTypeStyle, digitsBn } from '@/lib/format'

interface NoticeItem {
  id: string
  title: string
  body: string
  type: 'URGENT' | 'GENERAL' | 'EVENT'
  isBanner?: boolean
  imageUrl?: string | null
  createdAt: string
}

type Filter = 'all' | 'URGENT' | 'GENERAL' | 'EVENT'

const TYPE_LABEL: Record<NoticeItem['type'], [string, string]> = {
  URGENT: ['জরুরি', 'Urgent'],
  GENERAL: ['সাধারণ', 'General'],
  EVENT: ['ইভেন্ট', 'Event'],
}

export default function NoticesView() {
  const { t, tx, lang } = useUI()
  const [state, setState] = useState<{ loading: boolean; error: string; data: NoticeItem[] }>({
    loading: true,
    error: '',
    data: [],
  })
  const [filter, setFilter] = useState<Filter>('all')
  const [reloadKey, setReloadKey] = useState(0)
  /** পপ-আপে প্রদর্শিত নোটিশ (কার্ডে ক্লিক করলে খোলে) */
  const [active, setActive] = useState<NoticeItem | null>(null)

  useEffect(() => {
    let cancelled = false
    apiGet<NoticeItem[]>('/api/notices')
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

  const retry = () => {
    setState((s) => ({ ...s, loading: true, error: '' }))
    setReloadKey((k) => k + 1)
  }

  const items = state.data

  const counts = useMemo(
    () => ({
      all: items.length,
      URGENT: items.filter((n) => n.type === 'URGENT').length,
      GENERAL: items.filter((n) => n.type === 'GENERAL').length,
      EVENT: items.filter((n) => n.type === 'EVENT').length,
    }),
    [items]
  )

  const visible = filter === 'all' ? items : items.filter((n) => n.type === filter)

  return (
    <div className="mx-auto w-full max-w-4xl px-3.5 py-8 sm:py-10">
      {/* Google SEO rule: page-level H1 (visually hidden — SectionHeading renders h2). */}
      <h1 className="sr-only">{tx('নোটিশ ও ঘোষণা — পাঠশালা', 'Notices & announcements — PathShala')}</h1>
      <SectionHeading
        title={t('nav_notices')}
        subtitle={tx('সর্বশেষ নোটিশ, ঘোষণা ও ইভেন্টের খবর', 'Latest notices, announcements and events')}
      />

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mt-6">
        <TabsList className="w-full justify-start overflow-x-auto">
          {([
            ['all', tx('সব', 'All')],
            ['URGENT', t('urgent')],
            ['GENERAL', t('general')],
            ['EVENT', t('event')],
          ] as const).map(([v, label]) => (
            <TabsTrigger key={v} value={v}>
              {label} ({digitsBn(counts[v as keyof typeof counts])})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* List */}
      <div className="mt-6 space-y-4" aria-live="polite">
        {state.loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)
        ) : state.error ? (
          <EmptyState
            icon={<Megaphone className="h-7 w-7" aria-hidden />}
            title={t('error')}
            description={state.error}
            actionLabel={t('retry')}
            onAction={retry}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="h-7 w-7" aria-hidden />}
            title={tx('কোনো নোটিশ নেই', 'No notices found')}
          />
        ) : (
          visible.map((n, i) => (
            <motion.article
              key={n.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: Math.min(i, 6) * 0.07 }}
              className={`group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200 ${
                n.type === 'URGENT' ? 'border-l-4 border-l-red-500' : ''
              } hover:border-primary/40 hover:shadow-md`}
            >
              {/* Whole card opens the pop-up (accessible overlay button) */}
              <button
                type="button"
                onClick={() => setActive(n)}
                className="absolute inset-0 z-10 cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`${n.title} — ${tx('বিস্তারিত দেখুন', 'View notice details')}`}
              />
              <div className="pointer-events-none">
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={noticeTypeStyle(n.type)}>{tx(TYPE_LABEL[n.type][0], TYPE_LABEL[n.type][1])}</Badge>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                      {fmtDate(n.createdAt, lang)}
                    </span>
                    {n.isBanner && (
                      <Badge variant="outline" className="text-primary">
                        {tx('ব্যানার', 'Banner')}
                      </Badge>
                    )}
                  </div>
                  <h2 className="mt-2 text-base font-bold leading-snug transition-colors group-hover:text-primary sm:text-lg">
                    {n.title}
                  </h2>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground line-clamp-3">
                    {n.body}
                  </p>
                  <span className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    {tx('বিস্তারিত দেখুন', 'View details')}
                    <ArrowRight
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                </div>
                {n.imageUrl && (
                  <div className="relative aspect-[21/9] w-full border-t">
                    <Image
                      src={n.imageUrl}
                      alt={n.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 896px"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  </div>
                )}
              </div>
            </motion.article>
          ))
        )}
      </div>

      {/* ---- নোটিশ পপ-আপ (বিস্তৃত উইজেট) ---- */}
      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl" aria-describedby={undefined}>
          {active && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={noticeTypeStyle(active.type)}>{tx(TYPE_LABEL[active.type][0], TYPE_LABEL[active.type][1])}</Badge>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                    {fmtDate(active.createdAt, lang)}
                  </span>
                  {active.isBanner && (
                    <Badge variant="outline" className="text-primary">
                      {tx('ব্যানার', 'Banner')}
                    </Badge>
                  )}
                </div>
                <DialogTitle className="mt-1.5 text-left text-xl font-bold leading-snug sm:text-2xl">
                  {active.title}
                </DialogTitle>
                <DialogDescription className="sr-only">{tx('নোটিশের সম্পূর্ণ বিবরণ', 'Full notice details')}</DialogDescription>
              </DialogHeader>

              {active.imageUrl && (
                <div className="relative aspect-[21/9] w-full overflow-hidden rounded-xl border">
                  <Image src={active.imageUrl} alt={active.title} fill sizes="(max-width: 768px) 100vw, 768px" className="object-cover" />
                </div>
              )}

              <div className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">
                {active.body}
              </div>

              {/* পূর্ণ পেজের লিংক (শেয়ার/SEO) */}
              <Link
                href={`/notices/${active.id}`}
                className="mt-1 inline-flex items-center gap-1.5 self-start rounded-lg border px-3.5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
              >
                {tx('পুরো পেজে দেখুন', 'Open full page')}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

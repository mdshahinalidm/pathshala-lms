'use client'

/**
 * DashboardNoticesView — the student's নোটিশ বোর্ড.
 * Shows broadcasts sent by the admin that target ALL students or the
 * student's own class (data: GET /api/broadcasts). Each broadcast was also
 * delivered to the notification section.
 */
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Megaphone, RefreshCw, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeading } from '@/components/shared/section-heading'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet } from '@/lib/api-client'
import { fmtDate } from '@/lib/format'
import { classLabel } from '@/lib/student-classes'
import type { ClassKey } from '@/lib/student-classes'

interface BroadcastRow {
  id: string
  title: string
  body: string
  link: string | null
  targetClasses: ClassKey[]
  createdAt: string
}

export default function DashboardNoticesView() {
  const { t, tx, lang } = useUI()
  const { user } = useAuth()
  const [rows, setRows] = useState<BroadcastRow[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiGet<{ broadcasts: BroadcastRow[] }>('/api/broadcasts')
      setRows(Array.isArray(data?.broadcasts) ? data.broadcasts : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) void load()
  }, [user])

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <SectionHeading
        title={tx('নোটিশ বোর্ড', 'Notice Board')}
        subtitle={tx(
          'পাঠশালা কর্তৃপক্ষের পাঠানো নোটিশ ও আপডেট — আপনার শ্রেণির জন্য।',
          'Notices and updates from PathShala — for your class.'
        )}
      />

      {rows === null && !error ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title={t('error')} description={error} actionLabel={t('retry')} onAction={() => void load()} />
      ) : rows!.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-7 w-7" aria-hidden />}
          title={tx('এখনো কোনো নোটিশ নেই', 'No notices yet')}
          description={tx(
            'নতুন নোটিশ এলে এখানে ও নোটিফিকেশনে দেখা যাবে।',
            'New notices will appear here and in your notifications.'
          )}
        />
      ) : (
        <div className="space-y-3">
          {rows!.map((b, i) => (
            <motion.article
              key={b.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.04 }}
              className="rounded-2xl border bg-card p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="flex items-start gap-2 font-semibold leading-snug">
                  <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                  {b.title}
                </h3>
                <time className="text-xs text-muted-foreground">{fmtDate(b.createdAt, lang)}</time>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{b.body}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {b.targetClasses.length === 0 ? (
                  <Badge variant="secondary" className="gap-1">
                    <Users className="h-3 w-3" aria-hidden />
                    {tx('সব শিক্ষার্থী', 'All students')}
                  </Badge>
                ) : (
                  b.targetClasses.map((c) => (
                    <Badge key={c} variant="secondary">
                      {classLabel(c, lang)}
                    </Badge>
                  ))
                )}
                {b.link && (
                  <Button size="sm" variant="ghost" className="ml-auto gap-1.5" onClick={() => go(b.link!)}>
                    {tx('দেখুন', 'View')}
                  </Button>
                )}
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </div>
  )
}

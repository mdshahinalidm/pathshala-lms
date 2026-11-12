'use client'

/**
 * Notifications — student notification inbox with type icons, read state,
 * filter chips (all / unread) and mark-all-read.
 */
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bell, BookOpen, CheckCheck, ClipboardList, Megaphone, Wallet, ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { useUI, go } from '@/store/ui-store'
import { apiGet, apiSend } from '@/lib/api-client'
import { fmtDate, digitsBn } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface NotificationItem {
  id: string
  title: string
  body: string
  type: 'GENERAL' | 'COURSE' | 'EXAM' | 'NOTICE' | 'PAYMENT'
  link?: string | null
  isRead: boolean
  createdAt: string
}

const TYPE_STYLE: Record<string, { icon: LucideIcon; cls: string }> = {
  COURSE: { icon: BookOpen, cls: 'bg-primary/12 text-primary' },
  EXAM: { icon: ClipboardList, cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  NOTICE: { icon: Megaphone, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  PAYMENT: { icon: Wallet, cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  GENERAL: { icon: Bell, cls: 'bg-muted text-muted-foreground' },
}

export default function NotificationsView() {
  const { t, tx, lang } = useUI()
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [nonce, setNonce] = useState(0)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [markingAll, setMarkingAll] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    ;(async () => {
      try {
        const data = await apiGet<{ notifications: NotificationItem[]; unreadCount: number }>(
          '/api/notifications'
        )
        if (!alive) return
        setItems(data.notifications ?? [])
        setUnreadCount(data.unreadCount ?? 0)
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

  const markAll = async () => {
    setMarkingAll(true)
    // optimistic
    const prev = items
    setItems((list) => list?.map((n) => ({ ...n, isRead: true })) ?? null)
    setUnreadCount(0)
    try {
      await apiSend('/api/notifications', 'PATCH', { all: true })
      toast.success(tx('সব নোটিফিকেশন পঠিত করা হয়েছে।', 'All notifications marked as read.'))
    } catch {
      setItems(prev ?? null)
      toast.error(t('error'))
    } finally {
      setMarkingAll(false)
    }
  }

  const handleClick = async (n: NotificationItem) => {
    if (!n.isRead) {
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) ?? null)
      setUnreadCount((c) => Math.max(0, c - 1))
      try {
        await apiSend('/api/notifications', 'PATCH', { id: n.id })
      } catch {
        /* keep optimistic read state */
      }
    }
    if (n.link) go(n.link)
  }

  const num = (n: number) => (lang === 'bn' ? digitsBn(n) : String(n))
  const visible = (items ?? []).filter((n) => (filter === 'unread' ? !n.isRead : true))

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('notifications')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadCount > 0
              ? tx(`${num(unreadCount)} টি নতুন নোটিফিকেশন আছে।`, `You have ${num(unreadCount)} unread notification(s).`)
              : tx('সব নোটিফিকেশন পড়া হয়ে গেছে।', "You're all caught up.")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={markAll}
          disabled={markingAll || unreadCount === 0}
        >
          <CheckCheck className="h-4 w-4" /> {t('mark_all_read')}
        </Button>
      </div>

      {/* Filter chips */}
      <div className="mb-4 flex gap-2">
        {(
          [
            { key: 'all', label: tx('সব', 'All') },
            { key: 'unread', label: tx('অপঠিত', 'Unread') },
          ] as const
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
              filter === f.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-muted'
            )}
          >
            {f.label}
            {f.key === 'unread' && unreadCount > 0 && (
              <span className="ml-1 rounded-full bg-destructive px-1.5 text-[10px] text-white">
                {num(unreadCount)}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<Bell className="h-7 w-7" />}
          title={t('error')}
          description={tx('নোটিফিকেশন লোড করা যায়নি।', 'Could not load notifications.')}
          actionLabel={t('retry')}
          onAction={() => setNonce((n) => n + 1)}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-7 w-7" />}
          title={tx('কোনো নোটিফিকেশন নেই', 'No notifications')}
          description={
            filter === 'unread'
              ? tx('সব পড়া হয়ে গেছে — দারুণ!', 'Everything is read — nice!')
              : tx('নতুন আপডেট এলে এখানে দেখতে পাবেন।', 'New updates will appear here.')
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((n, i) => {
            const style = TYPE_STYLE[n.type] ?? TYPE_STYLE.GENERAL
            const Icon = style.icon
            return (
              <motion.button
                key={n.id}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.3 }}
                onClick={() => void handleClick(n)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-2xl border bg-card p-4 text-left transition-all hover:shadow-md',
                  !n.isRead && 'border-primary/40 bg-primary/[0.04]'
                )}
              >
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', style.cls)}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn('min-w-0 flex-1 truncate text-sm', n.isRead ? 'font-medium' : 'font-bold')}>
                      {n.title}
                    </p>
                    {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" aria-label="unread" />}
                  </div>
                  <p className={cn('mt-0.5 line-clamp-2 text-xs', n.isRead ? 'text-muted-foreground' : 'text-foreground/75')}>
                    {n.body}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Badge variant="outline" className="h-4.5 px-1.5 text-[10px]">
                      {n.type}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">{fmtDate(n.createdAt, lang)}</span>
                  </div>
                </div>
                {n.link && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
              </motion.button>
            )
          })}
        </div>
      )}
    </div>
  )
}

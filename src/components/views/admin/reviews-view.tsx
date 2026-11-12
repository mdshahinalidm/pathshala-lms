'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  BadgeCheck,
  BookOpen,
  Clock,
  Loader2,
  MessageSquareQuote,
  ShieldX,
  Star,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import {
  BulkBar,
  DetailsDialog,
  RowBox,
  useBulkSelection,
  type DetailField,
} from '@/components/admin/data-tools'
import { apiDelete, apiGet, apiPatch, apiSend } from '@/lib/api-client'
import { digitsBn, fmtDate, fmtStampText } from '@/lib/format'
import { DateStamp } from '@/components/admin/date-stamp'
import { useAuth } from '@/store/auth-store'
import { go, useUI } from '@/store/ui-store'
import { isPanelRole } from '@/lib/roles'

interface AdminReview {
  id: string
  userName: string
  userRole: string
  rating: number
  comment: string
  createdAt: string
  isApproved: boolean
  user: { name: string; email: string | null } | null
  course: { title: string } | null
}

type ReviewTab = 'all' | 'approved' | 'pending'

function AccessDenied() {
  const { tx } = useUI()
  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldX className="h-7 w-7" />
        </span>
        <h2 className="text-lg font-semibold">{tx('প্রবেশাধিকার নেই', 'Access denied')}</h2>
        <p className="text-sm text-muted-foreground">
          {tx('এই পেজটি শুধুমাত্র অ্যাডমিনদের জন্য।', 'This page is for administrators only.')}
        </p>
        <Button className="mt-2" onClick={() => go('#/login')}>
          {tx('লগইন করুন', 'Go to login')}
        </Button>
      </CardContent>
    </Card>
  )
}

function StarsRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={
            i <= rating
              ? 'h-4 w-4 fill-amber-400 text-amber-400'
              : 'h-4 w-4 text-muted-foreground/30'
          }
        />
      ))}
    </div>
  )
}

function StatChip({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: typeof Star
  label: string
  value: string
  iconClass?: string
}) {
  return (
    <span className="flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-sm">
      <Icon className={`h-4 w-4 ${iconClass ?? 'text-muted-foreground'}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  )
}

export default function AdminReviewsView() {
  const { user, status, initialized } = useAuth()
  const { tx, lang } = useUI()

  const [reviews, setReviews] = useState<AdminReview[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<ReviewTab>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminReview | null>(null)
  const bulk = useBulkSelection()
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [details, setDetails] = useState<AdminReview | null>(null)

  const num = useCallback((n: number | string) => (lang === 'bn' ? digitsBn(n) : String(n)), [lang])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<AdminReview[]>('/api/admin/reviews')
      setReviews(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [tx])

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [load])

  const filtered = useMemo(() => {
    if (tab === 'approved') return reviews.filter((r) => r.isApproved)
    if (tab === 'pending') return reviews.filter((r) => !r.isApproved)
    return reviews
  }, [reviews, tab])

  const stats = useMemo(() => {
    const total = reviews.length
    const approved = reviews.filter((r) => r.isApproved).length
    const avg = total === 0 ? 0 : reviews.reduce((s, r) => s + (r.rating || 0), 0) / total
    return { total, approved, pending: total - approved, avg }
  }, [reviews])

  async function toggleApproval(r: AdminReview, next: boolean) {
    setBusyId(r.id)
    try {
      await apiPatch(`/api/admin/reviews/${r.id}`, { isApproved: next })
      setReviews((prev) => prev.map((x) => (x.id === r.id ? { ...x, isApproved: next } : x)))
      toast.success(
        next
          ? tx('রিভিউ অনুমোদিত হয়েছে', 'Review approved')
          : tx('রিভিউ অপেক্ষমাণ করা হয়েছে', 'Review set to pending')
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপডেট ব্যর্থ', 'Update failed'))
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    try {
      await apiDelete(`/api/admin/reviews/${deleteTarget.id}`)
      toast.success(tx('রিভিউ মুছে ফেলা হয়েছে', 'Review deleted'))
      setDeleteTarget(null)
      setReviews((prev) => prev.filter((x) => x.id !== deleteTarget.id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setBusyId(null)
    }
  }

  async function bulkDelete() {
    setBulkDeleting(true)
    try {
      const res = await apiSend<{ deleted: number }>('/api/admin/bulk-delete', 'POST', {
        resource: 'reviews',
        ids: bulk.selected,
      })
      toast.success(
        tx(
          `${num(res.deleted)} টি রিভিউ মুছে ফেলা হয়েছে`,
          `${res.deleted} review(s) deleted`
        )
      )
      bulk.clear()
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setBulkDeleting(false)
    }
  }

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return <AccessDenied />
  }

  const tabEmptyText: Record<ReviewTab, { title: string; description: string }> = {
    all: {
      title: tx('কোনো রিভিউ নেই', 'No reviews yet'),
      description: tx(
        'শিক্ষার্থীরা কোর্স রিভিউ দিলে এখানে দেখা যাবে।',
        'Student reviews will appear here.'
      ),
    },
    approved: {
      title: tx('কোনো অনুমোদিত রিভিউ নেই', 'No approved reviews'),
      description: tx(
        'অনুমোদন সুইচ অন করে রিভিউ প্রকাশ করুন।',
        'Turn on the approval switch to publish a review.'
      ),
    },
    pending: {
      title: tx('কোনো অপেক্ষমাণ রিভিউ নেই', 'No pending reviews'),
      description: tx('সব রিভিউ পর্যালোচনা সম্পন্ন।', 'All reviews have been moderated.'),
    },
  }

  const detailsFields: DetailField[] = details
    ? [
        {
          label: tx('নাম', 'Name'),
          value: details.user?.name || details.userName || tx('অজানা', 'Unknown'),
        },
        { label: tx('ভূমিকা', 'Role'), value: details.userRole },
        {
          label: tx('রেটিং', 'Rating'),
          value: '★'.repeat(Math.max(0, Math.min(5, details.rating))),
        },
        { label: tx('মন্তব্য', 'Comment'), value: details.comment },
        ...(details.course?.title
          ? [{ label: tx('কোর্স', 'Course'), value: details.course.title }]
          : []),
        {
          label: tx('স্ট্যাটাস', 'Status'),
          value: details.isApproved ? tx('প্রকাশিত', 'Published') : tx('অপেক্ষমাণ', 'Pending'),
        },
        { label: tx('তারিখ', 'Date'), value: fmtStampText(details.createdAt) },
      ]
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">
          {tx('রিভিউ মডারেশন', 'Review Moderation')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tx(
            'শিক্ষার্থীদের রিভিউ পর্যালোচনা করে অনুমোদন দিন',
            'Moderate and approve student reviews'
          )}
        </p>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-2">
        <StatChip
          icon={MessageSquareQuote}
          label={tx('মোট', 'Total')}
          value={num(stats.total)}
        />
        <StatChip
          icon={BadgeCheck}
          label={tx('অনুমোদিত', 'Approved')}
          value={num(stats.approved)}
          iconClass="text-emerald-600 dark:text-emerald-400"
        />
        <StatChip
          icon={Clock}
          label={tx('অপেক্ষমাণ', 'Pending')}
          value={num(stats.pending)}
          iconClass="text-amber-600 dark:text-amber-400"
        />
        <StatChip
          icon={Star}
          label={tx('গড় রেটিং', 'Avg rating')}
          value={num(stats.avg.toFixed(1))}
          iconClass="fill-amber-400 text-amber-400"
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ReviewTab)}>
        <TabsList className="grid h-auto w-full grid-cols-3 sm:w-96">
          <TabsTrigger value="all" className="gap-1 py-2">
            {tx('সব', 'All')} ({num(stats.total)})
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-1 py-2">
            {tx('অনুমোদিত', 'Approved')} ({num(stats.approved)})
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-1 py-2">
            {tx('অপেক্ষমাণ', 'Pending')} ({num(stats.pending)})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<MessageSquareQuote className="h-7 w-7" />}
          title={tabEmptyText[tab].title}
          description={tabEmptyText[tab].description}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-3"
        >
          {filtered.map((r) => {
            const reviewer = r.user?.name || r.userName || tx('অজানা', 'Unknown')
            const email = r.user?.email ?? null
            return (
              <Card key={r.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <RowBox id={r.id} isSelected={bulk.isSelected} onToggle={bulk.toggle} />
                      <StarsRow rating={r.rating} />
                    </div>
                    <Badge
                      className={
                        r.isApproved
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                      }
                    >
                      {r.isApproved ? tx('প্রকাশিত', 'Published') : tx('অপেক্ষমাণ', 'Pending')}
                    </Badge>
                  </div>
                  <p className="cursor-pointer text-sm" onClick={() => setDetails(r)}>
                    {r.comment}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
                    <span
                      className="cursor-pointer font-semibold text-foreground"
                      onClick={() => setDetails(r)}
                    >
                      {reviewer}
                    </span>
                    {email && <span>{email}</span>}
                    {r.course?.title && (
                      <Badge variant="outline" className="max-w-48 gap-1 truncate text-[11px]">
                        <BookOpen className="h-3 w-3 shrink-0" />
                        <span className="truncate">{r.course.title}</span>
                      </Badge>
                    )}
                    <DateStamp iso={r.createdAt} />
                    <span className="ms-auto flex items-center gap-2">
                      <Switch
                        checked={r.isApproved}
                        disabled={busyId === r.id}
                        onCheckedChange={(v) => void toggleApproval(r, v)}
                        aria-label={tx('অনুমোদন', 'Approve')}
                      />
                      <Label className="text-xs font-normal text-muted-foreground">
                        {tx('অনুমোদন', 'Approve')}
                      </Label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={busyId === r.id}
                        onClick={() => setDeleteTarget(r)}
                        aria-label={tx('মুছুন', 'Delete')}
                      >
                        {busyId === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </motion.div>
      )}

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('রিভিউ মুছে ফেলবেন?', 'Delete this review?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                'রিভিউটি স্থায়ীভাবে মুছে যাবে — এটি আর ফেরানো যাবে না।',
                'This review will be permanently deleted — this cannot be undone.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tx('বাতিল', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              {tx('মুছুন', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Review details dialog ── */}
      <DetailsDialog
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        title={
          details ? details.user?.name || details.userName || tx('অজানা', 'Unknown') : ''
        }
        subtitle={tx('রিভিউ বিবরণ', 'Review details')}
        fields={detailsFields}
      />

      {/* ── Bulk selection bar ── */}
      <BulkBar
        count={bulk.count}
        deleting={bulkDeleting}
        onDelete={() => void bulkDelete()}
        onClear={bulk.clear}
      />
    </div>
  )
}

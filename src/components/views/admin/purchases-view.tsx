'use client'

/**
 * AdminPurchasesView — paid suggestion purchases review (panel).
 * Filter chips (জমা দেওয়া/পেন্ডিং/সফল), search, row → full details dialog,
 * Approve/Reject actions with an optional note, and permanent delete with
 * confirmation. Approve → student can download instantly.
 * Data: GET /api/admin/purchases · PATCH /api/admin/purchases/[id] ·
 *       DELETE /api/admin/purchases/[id]
 */
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingBag,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUI } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiDelete, apiGet, apiPatch } from '@/lib/api-client'
import { fmtBDT, fmtDate, fmtStampText, digitsBn } from '@/lib/format'
import { DateStamp } from '@/components/admin/date-stamp'
import { classLabel } from '@/lib/student-classes'
import { isPanelRole } from '@/lib/roles'

interface PurchaseRow {
  id: string
  amount: number
  method: string
  status: string
  trxId: string
  invoiceNo: string | null
  payStatus: string
  senderNumber: string | null
  submittedTrxId: string | null
  submittedAt: string | null
  adminNote: string | null
  createdAt: string
  user: { id: string; name: string; email: string | null; phone: string | null; studentClass: string | null }
  suggestion: { id: string; title: string; price: number } | null
}

type Filter = 'ALL' | 'SUBMITTED' | 'PENDING' | 'SUCCESS' | 'FAILED'

export default function AdminPurchasesView() {
  const { tx, lang, t } = useUI()
  const { user, status, initialized } = useAuth()

  const [rows, setRows] = useState<PurchaseRow[] | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [loading, setLoading] = useState(false)
  const [review, setReview] = useState<{ row: PurchaseRow; action: 'SUCCESS' | 'FAILED' } | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [details, setDetails] = useState<PurchaseRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PurchaseRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (filter === 'SUBMITTED') params.set('payStatus', 'SUBMITTED')
      else if (filter !== 'ALL') params.set('status', filter)
      const data = await apiGet<PurchaseRow[]>(`/api/admin/purchases${params.toString() ? `?${params}` : ''}`)
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড ব্যর্থ', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [q, filter, tx])

  useEffect(() => {
    if (!user || !isPanelRole(user.role)) return
    const timer = setTimeout(() => void load(), 250)
    return () => clearTimeout(timer)
  }, [user, load])

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        {tx('প্রবেশাধিকার নেই', 'Access denied')}
      </div>
    )
  }

  const submitReview = async () => {
    if (!review) return
    setBusy(true)
    try {
      await apiPatch(`/api/admin/purchases/${review.row.id}`, {
        status: review.action,
        ...(note.trim() ? { adminNote: note.trim() } : {}),
      })
      toast.success(
        review.action === 'SUCCESS'
          ? tx('অনুমোদিত — শিক্ষার্থী এখন ডাউনলোড করতে পারবে।', 'Approved — the student can now download.')
          : tx('প্রত্যাখ্যান করা হয়েছে।', 'Rejected.')
      )
      setReview(null)
      setNote('')
      setDetails(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('ব্যর্থ', 'Failed'))
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiDelete(`/api/admin/purchases/${deleteTarget.id}`)
      toast.success(tx('ক্রয় রেকর্ড মুছে ফেলা হয়েছে।', 'Purchase record deleted.'))
      setDeleteTarget(null)
      setDetails(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setDeleting(false)
    }
  }

  const FILTERS: { key: Filter; bn: string; en: string }[] = [
    { key: 'ALL', bn: 'সব', en: 'All' },
    { key: 'SUBMITTED', bn: 'যাচাইয়ের অপেক্ষায়', en: 'Awaiting review' },
    { key: 'PENDING', bn: 'পেন্ডিং', en: 'Pending' },
    { key: 'SUCCESS', bn: 'সফল', en: 'Success' },
    { key: 'FAILED', bn: 'ব্যর্থ', en: 'Failed' },
  ]

  const statusBadge = (r: PurchaseRow) => {
    if (r.payStatus === 'SUBMITTED' && r.status === 'PENDING')
      return (
        <Badge className="border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
          {tx('যাচাই চলছে', 'Under review')}
        </Badge>
      )
    if (r.status === 'SUCCESS')
      return (
        <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
          {tx('সফল', 'Success')}
        </Badge>
      )
    if (r.status === 'FAILED')
      return <Badge variant="destructive">{tx('ব্যর্থ', 'Failed')}</Badge>
    return <Badge variant="secondary">{tx('পেমেন্ট বাকি', 'Payment pending')}</Badge>
  }

  /** Approve/Reject are available for any not-yet-finalised purchase. */
  const reviewable = (r: PurchaseRow) => r.status === 'PENDING'

  const detailsFields = (r: PurchaseRow): { label: string; value: string }[] =>
    [
      { label: tx('সাজেশন', 'Suggestion'), value: r.suggestion?.title ?? '—' },
      { label: tx('শিক্ষার্থী', 'Student'), value: r.user?.name ?? '—' },
      ...(r.user?.studentClass
        ? [{ label: tx('শ্রেণি', 'Class'), value: classLabel(r.user.studentClass, lang) }]
        : []),
      { label: tx('ফোন', 'Phone'), value: r.user?.phone ?? '—' },
      { label: tx('ইমেইল', 'Email'), value: r.user?.email ?? '—' },
      { label: tx('মূল্য', 'Amount'), value: fmtBDT(r.amount, lang) },
      { label: tx('মেথড', 'Method'), value: r.method },
      { label: tx('ইনভয়েস', 'Invoice'), value: r.invoiceNo ?? '—' },
      { label: 'TrxID', value: r.trxId },
      { label: tx('জমা দেওয়া TrxID', 'Submitted TrxID'), value: r.submittedTrxId ?? '—' },
      { label: tx('সেন্ডার নম্বর', 'Sender number'), value: r.senderNumber ?? '—' },
      { label: tx('জমার সময়', 'Submitted at'), value: r.submittedAt ? fmtStampText(r.submittedAt) : '—' },
      { label: tx('অ্যাডমিন নোট', 'Admin note'), value: r.adminNote ?? '—' },
      { label: tx('তৈরির সময়', 'Created'), value: fmtStampText(r.createdAt) },
    ].filter((f) => f.value !== '—' || ['Suggestion', 'Student', 'TrxID'].includes(f.label))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <ShoppingBag className="h-6 w-6 text-primary" />
            {tx('সাজেশন পারচেজ', 'Suggestion Purchases')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'পেইড সাজেশনের পেমেন্ট রিভিউ — অনুমোদনেই ডাউনলোড খুলে যায়।',
              'Review paid-suggestion payments — approval unlocks the download.'
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t('retry')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'
            }`}
          >
            {tx(f.bn, f.en)}
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tx('TrxID / ইনভয়েস / শিক্ষার্থী / সাজেশন', 'TrxID / invoice / student / suggestion')}
          className="pl-9"
          aria-label={tx('খুঁজুন', 'Search')}
        />
      </div>

      {/* List */}
      {rows === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {tx('কোনো ক্রয় রেকর্ড পাওয়া যায়নি।', 'No purchase records found.')}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.03 }}
              className="cursor-pointer rounded-2xl border bg-card p-4 transition-colors hover:bg-accent/40"
              onClick={() => setDetails(r)}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.suggestion?.title ?? '—'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.user?.name}
                    {r.user?.studentClass ? ` · ${classLabel(r.user.studentClass, lang)}` : ''}
                    {r.user?.phone ? ` · ${r.user.phone}` : r.user?.email ? ` · ${r.user.email}` : ''}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {r.invoiceNo ? `${r.invoiceNo} · ` : ''}Trx: {r.submittedTrxId ?? r.trxId}
                    {r.senderNumber ? ` · ${r.senderNumber}` : ''} · {r.method}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-base font-extrabold">{fmtBDT(r.amount, lang)}</span>
                  {statusBadge(r)}
                  <DateStamp iso={r.createdAt} className="items-end text-right" />
                </div>
              </div>
              <div
                className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
                onClick={(e) => e.stopPropagation()}
              >
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDetails(r)}>
                  <Eye className="h-4 w-4" />
                  {tx('ডিটেইলস', 'Details')}
                </Button>
                {reviewable(r) && (
                  <>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        setReview({ row: r, action: 'SUCCESS' })
                        setNote('')
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {tx('অনুমোদন', 'Approve')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        setReview({ row: r, action: 'FAILED' })
                        setNote('')
                      }}
                    >
                      <XCircle className="h-4 w-4" />
                      {tx('প্রত্যাখ্যান', 'Reject')}
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteTarget(r)}
                  aria-label={t('delete')}
                >
                  <Trash2 className="h-4 w-4" />
                  {tx('ডিলিট', 'Delete')}
                </Button>
              </div>
              {r.adminNote && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {tx('নোট', 'Note')}: {r.adminNote}
                </p>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Order details dialog ── */}
      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <ShoppingBag className="h-5 w-5 text-primary" />
              {tx('অর্ডার ডিটেইলস', 'Order details')}
            </DialogTitle>
            <DialogDescription>
              {details?.suggestion?.title} · {details ? fmtBDT(details.amount, lang) : ''}
            </DialogDescription>
          </DialogHeader>

          {details && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2.5">
                <span className="text-sm text-muted-foreground">{tx('অবস্থা', 'Status')}</span>
                {statusBadge(details)}
              </div>

              <dl className="space-y-2.5">
                {detailsFields(details).map((f) => (
                  <div key={f.label} className="flex items-start justify-between gap-3 text-sm">
                    <dt className="shrink-0 text-muted-foreground">{f.label}</dt>
                    <dd className="min-w-0 break-words text-right font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>

              <Separator />

              <div className="flex flex-wrap items-center gap-2">
                {reviewable(details) && (
                  <>
                    <Button
                      className="gap-1.5"
                      onClick={() => {
                        setReview({ row: details, action: 'SUCCESS' })
                        setNote('')
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {tx('অনুমোদন', 'Approve')}
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        setReview({ row: details, action: 'FAILED' })
                        setNote('')
                      }}
                    >
                      <XCircle className="h-4 w-4" />
                      {tx('প্রত্যাখ্যান', 'Reject')}
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  className="ml-auto gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteTarget(details)}
                >
                  <Trash2 className="h-4 w-4" />
                  {tx('ডিলিট', 'Delete')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Review dialog */}
      <Dialog open={Boolean(review)} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <ShieldAlert className="h-5 w-5 text-primary" />
              {review?.action === 'SUCCESS' ? tx('অনুমোদন করুন', 'Approve purchase') : tx('প্রত্যাখ্যান করুন', 'Reject purchase')}
            </DialogTitle>
            <DialogDescription>
              {review?.row.suggestion?.title} · {review ? fmtBDT(review.row.amount, lang) : ''} ·{' '}
              {review?.row.user?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pv-note">{tx('নোট (ঐচ্ছিক)', 'Note (optional)')}</Label>
            <Textarea id="pv-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setReview(null)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={submitReview}
              disabled={busy}
              variant={review?.action === 'SUCCESS' ? 'default' : 'destructive'}
              className="gap-2"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {review?.action === 'SUCCESS' ? tx('অনুমোদন করুন', 'Approve') : tx('প্রত্যাখ্যান করুন', 'Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('ক্রয় রেকর্ড মুছে ফেলবেন?', 'Delete this purchase record?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `"${deleteTarget?.suggestion?.title ?? ''}" (${deleteTarget ? fmtBDT(deleteTarget.amount, lang) : ''} — ${deleteTarget?.user?.name ?? ''}) রেকর্ডটি স্থায়ীভাবে মুছে যাবে। যদি এটি সফল ক্রয় হয়, শিক্ষার্থীর ডাউনলোড অ্যাক্সেস বাতিল হয়ে যাবে।`,
                `"${deleteTarget?.suggestion?.title ?? ''}" (${deleteTarget ? fmtBDT(deleteTarget.amount, lang) : ''} — ${deleteTarget?.user?.name ?? ''}) will be permanently deleted. If it was a successful purchase, the student's download access is revoked.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

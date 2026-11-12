'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Banknote,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  Loader2,
  MoreHorizontal,
  Search,
  ShieldX,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { apiGet, apiPost, apiSend } from '@/lib/api-client'
import { digitsBn, fmtBDT, fmtStampText, orderStatusStyle } from '@/lib/format'
import { DateStamp } from '@/components/admin/date-stamp'
import { useAuth } from '@/store/auth-store'
import { go, useUI } from '@/store/ui-store'
import {
  BulkBar,
  DetailsDialog,
  RowBox,
  ScrollX,
  SelectAll,
  useBulkSelection,
} from '@/components/admin/data-tools'
import { isPanelRole, isOwner } from '@/lib/roles'

interface OrderRow {
  id: string
  amount: number
  listAmount?: number | null
  discount?: number
  couponCode?: string | null
  method: string
  status: string
  trxId: string
  invoiceNo?: string | null
  payStatus?: string
  senderNumber?: string | null
  submittedTrxId?: string | null
  submittedAt?: string | null
  createdAt: string
  course: { id: string; title: string } | null
  user: { id: string; name: string; email?: string | null } | null
}

const STATUS_FILTERS = ['ALL', 'SUCCESS', 'PENDING', 'FAILED'] as const

function methodStyle(method: string): string {
  switch (method.toUpperCase()) {
    case 'BKASH':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
    case 'NAGAD':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
    case 'SSLCOMMERZ':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    case 'STRIPE':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function statusLabel(status: string, tx: (bn: string, en: string) => string): string {
  if (status === 'SUCCESS') return tx('সফল', 'Success')
  if (status === 'PENDING') return tx('পেন্ডিং', 'Pending')
  if (status === 'FAILED') return tx('ব্যর্থ', 'Failed')
  return status
}

function payStatusBadgeClass(payStatus: string | undefined): string {
  if (payStatus === 'SUBMITTED') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
  }
  if (payStatus === 'APPROVED') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
  }
  return 'bg-muted text-muted-foreground'
}

function payStatusLabel(
  payStatus: string | undefined,
  tx: (bn: string, en: string) => string
): string {
  if (payStatus === 'SUBMITTED') return tx('রিভিউ', 'Review')
  if (payStatus === 'APPROVED') return tx('অ্যাপ্রুভড', 'Approved')
  if (payStatus === 'REJECTED') return tx('বাতিলকৃত', 'Rejected')
  return payStatus && payStatus !== 'NONE' ? payStatus : '—'
}

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

export default function AdminOrdersView() {
  const { user, status, initialized } = useAuth()
  const { t, tx, lang } = useUI()

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('ALL')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [action, setAction] = useState<{
    order: OrderRow
    next: 'SUCCESS' | 'FAILED'
    /** 'confirm' → /api/orders/[id]/confirm (creates enrollment); 'admin' → PATCH /api/admin/orders */
    via?: 'admin' | 'confirm'
  } | null>(null)
  const [csvBusy, setCsvBusy] = useState(false)

  const bulk = useBulkSelection()
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [details, setDetails] = useState<OrderRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrderRow | null>(null)

  /** Owner-only: single-order delete (menu item + confirm dialog). */
  const canDelete = isOwner(user?.role)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<OrderRow[]>('/api/orders?scope=all')
      setOrders(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const summary = useMemo(() => {
    const success = orders.filter((o) => o.status === 'SUCCESS')
    return {
      revenue: success.reduce((sum, o) => sum + (o.amount || 0), 0),
      success: success.length,
      pending: orders.filter((o) => o.status === 'PENDING').length,
      failed: orders.filter((o) => o.status === 'FAILED').length,
    }
  }, [orders])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (statusFilter !== 'ALL' && o.status !== statusFilter) return false
      if (!s) return true
      return (
        (o.trxId || '').toLowerCase().includes(s) ||
        (o.user?.name || '').toLowerCase().includes(s) ||
        (o.user?.email || '').toLowerCase().includes(s)
      )
    })
  }, [orders, statusFilter, search])

  async function confirmStatusChange() {
    if (!action) return
    setBusyId(action.order.id)
    try {
      if (action.via === 'confirm') {
        // Manual payment review: confirm endpoint creates the enrollment (course unlocks).
        await apiPost(`/api/orders/${action.order.id}/confirm`, { status: action.next })
      } else {
        await apiSend(`/api/admin/orders/${action.order.id}`, 'PATCH', { status: action.next })
      }
      toast.success(
        action.via === 'confirm'
          ? action.next === 'SUCCESS'
            ? tx('পেমেন্ট অ্যাপ্রুভ হয়েছে — কোর্স আনলক হয়েছে', 'Payment approved — course unlocked')
            : tx('পেমেন্ট রিভিউ বাতিল করা হয়েছে', 'Payment review rejected')
          : action.next === 'SUCCESS'
            ? tx('অর্ডার সফল করা হয়েছে', 'Order marked as success')
            : tx('অর্ডার ব্যর্থ করা হয়েছে', 'Order marked as failed')
      )
      setAction(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপডেট ব্যর্থ', 'Update failed'))
    } finally {
      setBusyId(null)
    }
  }

  async function bulkDelete() {
    setBulkDeleting(true)
    try {
      const r = await apiSend<{ deleted: number }>('/api/admin/bulk-delete', 'POST', {
        resource: 'orders',
        ids: bulk.selected,
      })
      toast.success(tx(`${r.deleted} টি অর্ডার মুছে ফেলা হয়েছে`, `${r.deleted} order(s) deleted`))
      bulk.clear()
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  async function confirmDeleteOrder() {
    if (!deleteTarget) return
    const target = deleteTarget
    setBusyId(target.id)
    try {
      await apiSend<{ deleted: boolean }>(`/api/admin/orders/${target.id}`, 'DELETE')
      toast.success(
        tx(
          `অর্ডার (TrxID ${target.trxId}) মুছে ফেলা হয়েছে`,
          `Order (TrxID ${target.trxId}) deleted`
        )
      )
      setDeleteTarget(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('ডিলিট ব্যর্থ', 'Delete failed'))
    } finally {
      setBusyId(null)
    }
  }

  async function copyCsv() {
    setCsvBusy(true)
    try {
      const header = 'TrxID,User,Email,Course,Method,Amount,Status,Date'
      const lines = filtered.map((o) =>
        [
          o.trxId,
          o.user?.name ?? '',
          o.user?.email ?? '',
          o.course?.title ?? '',
          o.method,
          o.amount,
          o.status,
          new Date(o.createdAt).toISOString(),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      )
      const csv = [header, ...lines].join('\n')
      await navigator.clipboard.writeText(csv)
      toast.success(
        tx(
          `${digitsBn(filtered.length)} টি অর্ডার CSV হিসেবে কপি হয়েছে`,
          `${filtered.length} orders copied as CSV`
        )
      )
    } catch {
      toast.error(tx('কপি করা যায়নি', 'Could not copy'))
    } finally {
      setCsvBusy(false)
    }
  }

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return <AccessDenied />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{t('admin_orders')}</h1>
          <p className="text-sm text-muted-foreground">
            {tx('সব পেমেন্ট লেনদেন পর্যবেক্ষণ ও নিষ্পত্তি', 'Monitor and settle all payment transactions')}
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => void copyCsv()} disabled={csvBusy}>
          {csvBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
          {tx('CSV কপি করুন', 'Copy as CSV')}
        </Button>
      </div>

      {/* Summary chips */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            icon: Banknote,
            tint: 'var(--chart-1)',
            label: tx('মোট আয় (সফল)', 'Revenue (success)'),
            value: fmtBDT(summary.revenue),
          },
          {
            icon: CheckCircle2,
            tint: 'var(--chart-1)',
            label: tx('সফল পেমেন্ট', 'Success'),
            value: digitsBn(summary.success),
          },
          {
            icon: Clock,
            tint: 'var(--chart-2)',
            label: tx('পেন্ডিং', 'Pending'),
            value: digitsBn(summary.pending),
          },
          {
            icon: XCircle,
            tint: 'var(--chart-4)',
            label: tx('ব্যর্থ', 'Failed'),
            value: digitsBn(summary.failed),
          },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: `color-mix(in oklab, ${c.tint} 14%, transparent)`,
                  color: c.tint,
                }}
              >
                <c.icon className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{c.label}</p>
                <p className="text-lg font-bold leading-tight">{c.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as (typeof STATUS_FILTERS)[number])}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'ALL'
                  ? tx('সব স্ট্যাটাস', 'All statuses')
                  : statusLabel(s, tx)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tx('TrxID বা ইউজার খুঁজুন...', 'Search TrxID or user...')}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={tx('কোনো অর্ডার নেই', 'No orders found')}
          description={
            search || statusFilter !== 'ALL'
              ? tx('ফিল্টার পরিবর্তন করে দেখুন।', 'Try changing the filters.')
              : undefined
          }
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card>
            <CardContent className="p-0">
              <ScrollX>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <SelectAll
                        ids={filtered.map((o) => o.id)}
                        isSelected={bulk.isSelected}
                        onToggleAll={bulk.toggleAll}
                      />
                    </TableHead>
                    <TableHead>TrxID</TableHead>
                    <TableHead className="min-w-[160px]">{tx('ইউজার', 'User')}</TableHead>
                    <TableHead className="min-w-[160px]">{tx('কোর্স', 'Course')}</TableHead>
                    <TableHead>{t('method')}</TableHead>
                    <TableHead>{t('amount')}</TableHead>
                    <TableHead>{t('status')}</TableHead>
                    <TableHead>{tx('পেমেন্ট রিভিউ', 'Pay review')}</TableHead>
                    <TableHead>{t('date')}</TableHead>
                    <TableHead className="text-right">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <RowBox id={o.id} isSelected={bulk.isSelected} onToggle={bulk.toggle} />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium">
                        <span className="cursor-pointer hover:underline" onClick={() => setDetails(o)}>
                          {o.trxId}
                        </span>
                      </TableCell>
                      <TableCell>
                        <p
                          className="cursor-pointer text-sm font-medium hover:underline"
                          onClick={() => setDetails(o)}
                        >
                          {o.user?.name || '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">{o.user?.email || ''}</p>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="truncate text-sm">{o.course?.title || '—'}</p>
                      </TableCell>
                      <TableCell>
                        <Badge className={methodStyle(o.method)}>{o.method}</Badge>
                      </TableCell>
                      <TableCell className="text-sm font-bold">{fmtBDT(o.amount)}</TableCell>
                      <TableCell>
                        <Badge className={orderStatusStyle(o.status)}>
                          {statusLabel(o.status, tx)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {o.payStatus === 'SUBMITTED' || o.payStatus === 'APPROVED' ? (
                          <Badge className={payStatusBadgeClass(o.payStatus)}>
                            {payStatusLabel(o.payStatus, tx)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <DateStamp iso={o.createdAt} label={tx('তৈরির তারিখ', 'Created at')} />
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={busyId === o.id}
                              aria-label={t('actions')}
                            >
                              {busyId === o.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {o.status === 'PENDING' && (
                              <>
                                <DropdownMenuLabel>{tx('নিষ্পত্তি করুন', 'Settle')}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {o.status === 'PENDING' && o.payStatus === 'SUBMITTED' && (
                                  <>
                                    <DropdownMenuItem
                                      className="text-emerald-700 focus:text-emerald-700 dark:text-emerald-400"
                                      onClick={() => setAction({ order: o, next: 'SUCCESS', via: 'confirm' })}
                                    >
                                      <CheckCircle2 className="h-4 w-4" />
                                      {tx('অ্যাপ্রুভ করুন', 'Approve')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => setAction({ order: o, next: 'FAILED', via: 'confirm' })}
                                    >
                                      <XCircle className="h-4 w-4" />
                                      {tx('বাতিল', 'Reject')}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                <DropdownMenuItem
                                  className="text-emerald-700 focus:text-emerald-700 dark:text-emerald-400"
                                  onClick={() => setAction({ order: o, next: 'SUCCESS' })}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  {tx('সফল করুন', 'Mark Success')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setAction({ order: o, next: 'FAILED' })}
                                >
                                  <XCircle className="h-4 w-4" />
                                  {tx('ব্যর্থ করুন', 'Mark Failed')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem onClick={() => setDetails(o)}>
                              <Eye className="h-4 w-4" />
                              {tx('বিস্তারিত দেখুন', 'View details')}
                            </DropdownMenuItem>
                            {canDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(o)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {tx('অর্ডার ডিলিট করুন', 'Delete order')}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </ScrollX>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Order details dialog (row click) ── */}
      <DetailsDialog
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        title={details?.trxId ?? '—'}
        subtitle={details?.course?.title ?? undefined}
        fields={[
          { label: tx('ইনভয়েস নং', 'Invoice no'), value: details?.invoiceNo || '—' },
          { label: 'TrxID', value: details?.trxId ?? '—' },
          { label: tx('শিক্ষার্থী', 'Student'), value: details?.user?.name || '—' },
          { label: tx('ইমেইল', 'Email'), value: details?.user?.email || '—' },
          { label: tx('কোর্স', 'Course'), value: details?.course?.title || '—' },
          { label: t('amount'), value: details ? fmtBDT(details.amount) : '—' },
          {
            label: tx('লিস্ট প্রাইস', 'List amount'),
            value: details?.listAmount != null ? fmtBDT(details.listAmount) : '—',
          },
          {
            label: tx('ডিসকাউন্ট', 'Discount'),
            value: details?.discount ? fmtBDT(details.discount) : '—',
          },
          { label: tx('কুপন', 'Coupon'), value: details?.couponCode || '—' },
          { label: t('method'), value: details?.method ?? '—' },
          { label: t('status'), value: details ? statusLabel(details.status, tx) : '—' },
          {
            label: tx('পেমেন্ট রিভিউ', 'Pay status'),
            value: details ? payStatusLabel(details.payStatus, tx) : '—',
          },
          { label: tx('প্রেরকের নম্বর', 'Sender number'), value: details?.senderNumber || '—' },
          { label: tx('জমা দেওয়া TrxID', 'Submitted TrxID'), value: details?.submittedTrxId || '—' },
          {
            label: t('date'),
            value: details ? fmtStampText(details.createdAt) : '—',
          },
        ]}
      />

      {/* ── Settle confirm ── */}
      <AlertDialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {action?.next === 'SUCCESS'
                ? tx('অর্ডার সফল করবেন?', 'Mark order as success?')
                : tx('অর্ডার ব্যর্থ করবেন?', 'Mark order as failed?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `TrxID ${action?.order.trxId ?? ''} · ${fmtBDT(action?.order.amount ?? 0)} — স্ট্যাটাস "${action?.next ?? ''}" করা হবে।`,
                `TrxID ${action?.order.trxId ?? ''} · ${fmtBDT(action?.order.amount ?? 0)} — status will be set to "${action?.next ?? ''}".`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmStatusChange()}>
              {t('save')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('অর্ডার ডিলিট করবেন?', 'Delete this order?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `TrxID ${deleteTarget?.trxId ?? ''} · ${fmtBDT(deleteTarget?.amount ?? 0)} — এই ইনভয়েস/অর্ডার রেকর্ডটি স্থায়ীভাবে মুছে যাবে। এটি আর ফিরে পাওয়া যাবে না।`,
                `TrxID ${deleteTarget?.trxId ?? ''} · ${fmtBDT(deleteTarget?.amount ?? 0)} — this invoice/order record will be permanently removed. This cannot be undone.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId === deleteTarget?.id}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busyId === deleteTarget?.id}
              onClick={(e) => {
                e.preventDefault()
                void confirmDeleteOrder()
              }}
            >
              {busyId === deleteTarget?.id && <Loader2 className="h-4 w-4 animate-spin" />}
              {busyId === deleteTarget?.id
                ? tx('মুছে ফেলা হচ্ছে...', 'Deleting...')
                : tx('ডিলিট করুন', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkBar
        count={bulk.count}
        deleting={bulkDeleting}
        onDelete={() => void bulkDelete()}
        onClear={bulk.clear}
      />
    </div>
  )
}

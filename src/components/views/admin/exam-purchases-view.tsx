'use client'

/**
 * AdminExamPurchasesView — paid exam tickets (এক্সাম ক্রয়).
 * MANUAL tickets arrive with payStatus=SUBMITTED → the admin reviews the
 * sender/TrxID here and approves (exam unlocks in the student dashboard
 * instantly) or rejects. SANDBOX tickets auto-approve.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ClipboardList, Eye, Search, ShieldX, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { ScrollX } from '@/components/admin/data-tools'
import { apiGet, apiPatch } from '@/lib/api-client'
import { DateStamp } from '@/components/admin/date-stamp'
import { fmtBDT, fmtDate, digitsBn } from '@/lib/format'
import { useUI } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { go } from '@/store/ui-store'
import { isPanelRole } from '@/lib/roles'
import { classLabel } from '@/lib/student-classes'

interface ExamPurchaseRow {
  id: string
  amount: number
  method: string
  status: string // PENDING | SUCCESS | FAILED
  trxId: string
  invoiceNo: string | null
  payStatus: string // NONE | SUBMITTED | APPROVED | REJECTED
  senderNumber: string | null
  submittedTrxId: string | null
  submittedAt: string | null
  adminNote: string | null
  createdAt: string
  user: { id: string; name: string; email: string | null; phone: string | null; studentClass: string | null }
  quiz: { id: string; title: string; price: number | null; durationMin: number }
}

type StatusFilter = 'ALL' | 'PENDING' | 'SUCCESS' | 'FAILED'

function statusBadge(p: ExamPurchaseRow, tx: (bn: string, en: string) => string) {
  if (p.status === 'SUCCESS') {
    return (
      <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
        {tx('সফল', 'Success')}
      </Badge>
    )
  }
  if (p.status === 'FAILED') {
    return (
      <Badge className="border-transparent bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300">
        {tx('ব্যর্থ', 'Failed')}
      </Badge>
    )
  }
  return p.payStatus === 'SUBMITTED' ? (
    <Badge className="border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
      {tx('যাচাই চলছে', 'Under review')}
    </Badge>
  ) : (
    <Badge variant="secondary">{tx('পেমেন্ট বাকি', 'Payment pending')}</Badge>
  )
}

export default function AdminExamPurchasesView() {
  const { t, tx, lang } = useUI()
  const { user, status, initialized } = useAuth()

  const [rows, setRows] = useState<ExamPurchaseRow[] | null>(null)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [detail, setDetail] = useState<ExamPurchaseRow | null>(null)
  const [note, setNote] = useState('')
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await apiGet<ExamPurchaseRow[]>('/api/admin/exam-purchases')
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
      setRows([])
    }
  }, [tx])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    let list = rows ?? []
    if (statusFilter === 'PENDING') list = list.filter((r) => r.status === 'PENDING')
    if (statusFilter === 'SUCCESS') list = list.filter((r) => r.status === 'SUCCESS')
    if (statusFilter === 'FAILED') list = list.filter((r) => r.status === 'FAILED')
    const query = q.trim().toLowerCase()
    if (query) {
      list = list.filter(
        (r) =>
          r.trxId?.toLowerCase().includes(query) ||
          r.invoiceNo?.toLowerCase().includes(query) ||
          r.submittedTrxId?.toLowerCase().includes(query) ||
          r.user?.name?.toLowerCase().includes(query) ||
          r.user?.phone?.includes(query) ||
          r.quiz?.title?.toLowerCase().includes(query)
      )
    }
    return list
  }, [rows, q, statusFilter])

  async function act(action: 'approve' | 'reject') {
    if (!detail) return
    setActing(true)
    try {
      await apiPatch(`/api/admin/exam-purchases/${detail.id}`, {
        action,
        note: note.trim() || undefined,
      })
      toast.success(
        action === 'approve'
          ? tx('অনুমোদিত — পরীক্ষাটি শিক্ষার্থীর ড্যাশবোর্ডে খুলে গেছে।', 'Approved — the exam is unlocked for the student.')
          : tx('প্রত্যাখ্যান করা হয়েছে।', 'Rejected.')
      )
      setDetail(null)
      setNote('')
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('কাজ সম্পন্ন হয়নি', 'Action failed'))
    } finally {
      setActing(false)
    }
  }

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <ShieldX className="h-7 w-7" />
          </span>
          <h2 className="text-lg font-semibold">{tx('প্রবেশাধিকার নেই', 'Access denied')}</h2>
          <Button className="mt-2" onClick={() => go('/login')}>
            {tx('লগইন করুন', 'Go to login')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const num = (n: number) => (lang === 'bn' ? digitsBn(n) : String(n))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{tx('এক্সাম ক্রয়', 'Exam Purchases')}</h1>
        <p className="text-sm text-muted-foreground">
          {tx(
            'পেইড পরীক্ষার টিকিট ও ম্যানুয়াল পেমেন্ট যাচাই — অনুমোদনের সাথে সাথেই শিক্ষার্থীর ড্যাশবোর্ডে পরীক্ষা খুলে যায়।',
            'Paid exam tickets and manual payment review — approving unlocks the exam in the student dashboard instantly.'
          )}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tx('খুঁজুন: নাম/TrxID/ইনভয়েস/পরীক্ষা', 'Search: name/TrxID/invoice/exam')}
            className="pl-8"
          />
        </div>
        {(['ALL', 'PENDING', 'SUCCESS', 'FAILED'] as StatusFilter[]).map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {s === 'ALL'
              ? tx('সব', 'All')
              : s === 'PENDING'
                ? tx('পেন্ডিং', 'Pending')
                : s === 'SUCCESS'
                  ? tx('সফল', 'Success')
                  : tx('ব্যর্থ', 'Failed')}
          </Button>
        ))}
      </div>

      {rows === null ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-7 w-7" />}
          title={tx('কোনো টিকিট ক্রয় নেই', 'No ticket purchases')}
          description={tx(
            'শিক্ষার্থীরা পেইড পরীক্ষার টিকিট কিনলে সেগুলো এখানে দেখা যাবে।',
            'Paid exam ticket purchases will appear here.'
          )}
        />
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="p-0">
              <ScrollX>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">{tx('পরীক্ষা', 'Exam')}</TableHead>
                      <TableHead className="min-w-[140px]">{tx('শিক্ষার্থী', 'Student')}</TableHead>
                      <TableHead>{tx('মূল্য', 'Amount')}</TableHead>
                      <TableHead>{tx('মেথড', 'Method')}</TableHead>
                      <TableHead>{tx('ইনভয়েস', 'Invoice')}</TableHead>
                      <TableHead>{tx('অবস্থা', 'Status')}</TableHead>
                      <TableHead>{t('date')}</TableHead>
                      <TableHead className="text-right">{t('actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => setDetail(p)}>
                        <TableCell>
                          <p className="max-w-[200px] truncate text-sm font-semibold">{p.quiz?.title}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium">{p.user?.name}</p>
                          <p className="text-xs text-muted-foreground">{p.user?.phone}</p>
                        </TableCell>
                        <TableCell className="text-sm font-semibold">{fmtBDT(p.amount, lang)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{p.method}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{p.invoiceNo ?? '—'}</TableCell>
                        <TableCell>{statusBadge(p, tx)}</TableCell>
                        <TableCell><DateStamp iso={p.createdAt} label={t('date')} /></TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={t('view')}
                            onClick={(e) => {
                              e.stopPropagation()
                              setDetail(p)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
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

      {/* ── Review dialog ── */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tx('টিকিট যাচাই', 'Review ticket')}</DialogTitle>
            <DialogDescription>
              {tx('ম্যানুয়াল পেমেন্ট হলে তথ্য মিলিয়ে অনুমোদন দিন।', 'Verify the manual payment details before approving.')}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{detail.quiz?.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtBDT(detail.amount, lang)} · {detail.quiz?.durationMin} {t('minutes')}
                  </p>
                </div>
                <div className="ml-auto">{statusBadge(detail, tx)}</div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">{tx('শিক্ষার্থী', 'Student')}</p>
                  <p className="font-medium">{detail.user?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {detail.user?.phone} {detail.user?.studentClass ? `· ${classLabel(detail.user.studentClass, lang)}` : ''}
                  </p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">{tx('পেমেন্ট', 'Payment')}</p>
                  <p className="font-mono text-xs font-medium">{detail.trxId}</p>
                  {detail.submittedTrxId && (
                    <p className="mt-0.5 text-xs">
                      {tx('জমা দেওয়া TrxID', 'Submitted TrxID')}:{' '}
                      <span className="font-mono font-semibold">{detail.submittedTrxId}</span>
                    </p>
                  )}
                  {detail.senderNumber && (
                    <p className="text-xs">
                      {tx('সেন্ডার', 'Sender')}: <span className="font-semibold">{detail.senderNumber}</span>
                    </p>
                  )}
                </div>
              </div>

              {detail.adminNote && (
                <p className="rounded-xl border bg-muted/40 p-3 text-xs">
                  {tx('নোট', 'Note')}: {detail.adminNote}
                </p>
              )}

              {detail.status === 'PENDING' && (
                <div className="space-y-1.5">
                  <Label htmlFor="ep-note">{tx('অ্যাডমিন নোট (ঐচ্ছিক)', 'Admin note (optional)')}</Label>
                  <Textarea id="ep-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>
              {t('cancel')}
            </Button>
            {detail?.status === 'PENDING' && (
              <>
                <Button
                  variant="destructive"
                  disabled={acting}
                  onClick={() => void act('reject')}
                >
                  {tx('বাতিল', 'Reject')}
                </Button>
                <Button disabled={acting} className="gap-2" onClick={() => void act('approve')}>
                  {tx('অনুমোদন দিন', 'Approve')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-center text-xs text-muted-foreground">
        {tx(`মোট ${num(filtered.length)} টি ক্রয়`, `${filtered.length} purchase(s)`)}
      </p>
    </div>
  )
}

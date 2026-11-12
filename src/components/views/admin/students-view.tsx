'use client'

/**
 * AdminStudentsView — every student account with a class filter dropdown
 * (per-class headcount), search and a full detail dialog on click:
 * profile, enrollments, orders, suggestion purchases, quiz attempts.
 * Data: GET /api/admin/students · GET /api/admin/students/[id]
 */
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  Ban,
  BookOpen,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Loader2,
  MoreHorizontal,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useUI } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet, apiPost, apiSend } from '@/lib/api-client'
import { fmtBDT, fmtDate, fmtStampText, digitsBn } from '@/lib/format'
import { DateStamp } from '@/components/admin/date-stamp'
import { CLASS_OPTIONS, classLabel, type ClassKey } from '@/lib/student-classes'
import { isOwner, isPanelRole } from '@/lib/roles'

interface StudentRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  isVerified: boolean
  isBlocked: boolean
  avatarUrl: string | null
  studentClass: string | null
  institution: string | null
  createdAt: string
  _count: { enrollments: number; orders: number; purchases: number }
}

interface StudentDetail {
  student: StudentRow & { updatedAt: string }
  enrollments: {
    id: string
    progress: number
    enrolledAt: string
    expiresAt: string | null
    course: { id: string; title: string; slug: string; price: number }
  }[]
  orders: {
    id: string
    amount: number
    method: string
    status: string
    payStatus: string
    trxId: string
    invoiceNo: string | null
    createdAt: string
    course: { title: string } | null
  }[]
  purchases: {
    id: string
    amount: number
    method: string
    status: string
    payStatus: string
    trxId: string
    invoiceNo: string | null
    createdAt: string
    suggestion: { id: string; title: string } | null
  }[]
  quizAttempts: { id: string; score: number; total: number; createdAt: string; quiz: { title: string } | null }[]
  notificationsCount: number
}

export default function AdminStudentsView() {
  const { tx, lang, t } = useUI()
  const { user, status, initialized } = useAuth()

  const [rows, setRows] = useState<StudentRow[] | null>(null)
  const [classCounts, setClassCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [classFilter, setClassFilter] = useState<ClassKey | ''>('')
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<StudentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  // Manual enrollment (moved here from the old all-users table — students are
  // enrolled to courses from this section now).
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([])
  const [enrollCourseId, setEnrollCourseId] = useState('')
  const [enrolling, setEnrolling] = useState(false)
  // Multi-select + delete: selection is available to every panel role, but
  // delete (row menu item + toolbar button) is rendered for the owner only
  // (ADMIN) — the bulk-delete endpoint enforces requireOwner server-side too.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmSingle, setConfirmSingle] = useState<StudentRow | null>(null)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    apiGet<{ id: string; title: string }[]>('/api/courses?all=1')
      .then((list) => setCourses(list.map((c) => ({ id: c.id, title: c.title }))))
      .catch(() => setCourses([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (classFilter) params.set('class', classFilter)
      const data = await apiGet<{ students: StudentRow[]; classCounts: Record<string, number>; total: number }>(
        `/api/admin/students${params.toString() ? `?${params}` : ''}`
      )
      setRows(Array.isArray(data?.students) ? data.students : [])
      setClassCounts(data?.classCounts ?? {})
      setTotal(data?.total ?? 0)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড ব্যর্থ', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [q, classFilter, tx])

  useEffect(() => {
    if (!user || !isPanelRole(user.role)) return
    const timer = setTimeout(() => void load(), 250)
    return () => clearTimeout(timer)
  }, [user, load])

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const data = await apiGet<StudentDetail>(`/api/admin/students/${id}`)
      setDetail(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড ব্যর্থ', 'Failed to load'))
    } finally {
      setDetailLoading(false)
    }
  }

  // ── Bulk selection (first checkbox column) ──────────────────────────
  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const visibleIds = rows?.map((s) => s.id) ?? []
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
  const someVisibleSelected = visibleIds.some((id) => selected.has(id))

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (visibleIds.length > 0 && visibleIds.every((id) => prev.has(id))) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  // ── Delete (single via row menu, bulk via toolbar) → POST bulk-delete ─
  const deleteStudents = async (ids: string[]) => {
    setDeleting(true)
    try {
      const r = await apiSend<{ deleted: number }>('/api/admin/bulk-delete', 'POST', {
        resource: 'users',
        ids,
      })
      toast.success(
        tx(`${digitsBn(r.deleted)} জন শিক্ষার্থী মুছে ফেলা হয়েছে`, `${r.deleted} student(s) deleted`)
      )
      setSelected((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('ডিলিট ব্যর্থ', 'Delete failed'))
    } finally {
      setDeleting(false)
    }
  }

  const handleManualEnroll = async () => {
    if (!detail || !enrollCourseId) return
    setEnrolling(true)
    try {
      await apiPost('/api/admin/enroll', { userId: detail.student.id, courseId: enrollCourseId })
      toast.success(tx('ম্যানুয়াল এনরোলমেন্ট সম্পন্ন হয়েছে', 'Manual enrollment completed'))
      setEnrollCourseId('')
      await openDetail(detail.student.id)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('এনরোলমেন্ট ব্যর্থ', 'Enrollment failed'))
    } finally {
      setEnrolling(false)
    }
  }

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        {tx('প্রবেশাধিকার নেই', 'Access denied')}
      </div>
    )
  }

  const owner = isOwner(user?.role)

  // ── CSV / Excel export (read-only GET) — exports ALL students when nothing
  // is selected, or just the selected rows via ?ids=… otherwise. Navigating
  // to the URL triggers the download with the same-origin session cookie.
  const exportUrl = (format: 'csv' | 'xls') => {
    const params = new URLSearchParams({ format })
    if (selected.size > 0) params.set('ids', Array.from(selected).join(','))
    return `/api/admin/students/export?${params}`
  }

  const countFor = (key: ClassKey | '') => (key === '' ? total : (classCounts[key] ?? 0))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Users className="h-6 w-6 text-primary" />
            {tx('শিক্ষার্থী', 'Students')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'প্রতিটি শিক্ষার্থীর সম্পূর্ণ তথ্য — শ্রেণি ফিল্টার ও বিস্তারিত ভিউ সহ।',
              'Every student account — class filters and full detail view.'
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t('retry')}
        </Button>
      </div>

      {/* Search + class filter dropdown — same toolbar layout as Courses
          (search left, dropdown right). The old two-row chip strip is now a
          single dropdown: click to open, scroll through every class with its
          live headcount. Filtering behaviour unchanged. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tx('নাম / ইমেইল / ফোন / প্রতিষ্ঠান', 'Name / email / phone / institution')}
            className="pl-9"
            aria-label={tx('শিক্ষার্থী খুঁজুন', 'Search students')}
          />
        </div>
        <Select
          value={classFilter === '' ? 'all' : classFilter}
          onValueChange={(v) => setClassFilter(v === 'all' ? '' : (v as ClassKey))}
        >
          <SelectTrigger
            className="w-full sm:w-60"
            aria-label={tx('শ্রেণি ফিল্টার', 'Class filter')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {tx('সব শিক্ষার্থী', 'All students')} · {digitsBn(countFor(''))}
            </SelectItem>
            {CLASS_OPTIONS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {tx(c.bn, c.en)} · {digitsBn(countFor(c.value))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Export (CSV / Excel) — exports all students, or the selected
            rows when any checkboxes are ticked. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 sm:ml-auto"
              aria-label={tx('শিক্ষার্থী তালিকা এক্সপোর্ট করুন', 'Export students list')}
            >
              <Download className="h-4 w-4" />
              {tx('এক্সপোর্ট', 'Export')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onSelect={() => window.location.assign(exportUrl('csv'))}
            >
              <FileText className="h-4 w-4" />
              {selected.size > 0
                ? tx(`CSV (নির্বাচিত ${digitsBn(selected.size)} জন)`, `CSV (${selected.size} selected)`)
                : tx('CSV (সব শিক্ষার্থী)', 'CSV (all students)')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => window.location.assign(exportUrl('xls'))}
            >
              <FileSpreadsheet className="h-4 w-4" />
              {selected.size > 0
                ? tx(`Excel (নির্বাচিত ${digitsBn(selected.size)} জন)`, `Excel (${selected.size} selected)`)
                : tx('Excel (সব শিক্ষার্থী)', 'Excel (all students)')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Bulk selection toolbar — slim bar above the table, only while
          something is selected. Delete is owner-only; other panel roles
          still see the count and can clear the selection. */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">
          <span className="text-sm font-semibold">
            {tx(`${digitsBn(selected.size)} জন নির্বাচিত`, `${selected.size} selected`)}
          </span>
          {owner && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              disabled={deleting}
              onClick={() => setBulkConfirmOpen(true)}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {tx('নির্বাচিত ডিলিট', 'Delete selected')}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => setSelected(new Set())}>
            <X className="h-4 w-4" />
            {tx('বাদ দিন', 'Clear')}
          </Button>
        </div>
      )}

      {/* Table */}
      {rows === null ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {tx('কোনো শিক্ষার্থী পাওয়া যায়নি।', 'No students found.')}
        </p>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-h-[64vh] overflow-y-auto rounded-2xl border"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pr-2">
                  <Checkbox
                    checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAllVisible}
                    aria-label={tx('সব নির্বাচন / বাদ', 'Select all / none')}
                  />
                </TableHead>
                <TableHead>{tx('শিক্ষার্থী', 'Student')}</TableHead>
                <TableHead>{tx('শ্রেণি/বর্ষ', 'Class')}</TableHead>
                <TableHead>{tx('যোগাযোগ', 'Contact')}</TableHead>
                <TableHead>{tx('ভর্তি', 'Enrolled')}</TableHead>
                <TableHead>{tx('অর্ডার', 'Orders')}</TableHead>
                <TableHead>{tx('যোগদান', 'Joined')}</TableHead>
                <TableHead className="w-10 text-right">{tx('অ্যাকশন', 'Action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => void openDetail(s.id)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      void openDetail(s.id)
                    }
                  }}
                  aria-label={`${s.name} — ${tx('বিস্তারিত দেখুন', 'view details')}`}
                >
                  {/* Checkbox cell — stopPropagation so the row's click →
                      detail dialog and Enter/Space handler don't fire. */}
                  <TableCell
                    className="w-10"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selected.has(s.id)}
                      onCheckedChange={() => toggleSelected(s.id)}
                      aria-label={tx(`${s.name} নির্বাচন করুন`, `Select ${s.name}`)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-9 w-9">
                        {s.avatarUrl && <AvatarImage src={s.avatarUrl} alt={s.name} />}
                        <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                          {s.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-medium">
                          {s.name}
                          {s.isBlocked && (
                            <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                              <Ban className="h-2.5 w-2.5" />
                            </Badge>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{s.institution ?? '—'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{classLabel(s.studentClass, lang)}</Badge>
                  </TableCell>
                  <TableCell>
                    <p className="truncate text-xs">{s.phone ?? s.email ?? '—'}</p>
                  </TableCell>
                  <TableCell>{digitsBn(s._count.enrollments)}</TableCell>
                  <TableCell>{digitsBn(s._count.orders)}</TableCell>
                  <TableCell><DateStamp iso={s.createdAt} label={tx('তৈরির তারিখ', 'Created at')} /></TableCell>
                  {/* Action cell — the old "দেখুন ›" hint becomes a real
                      3-dot menu (view details / owner-only delete).
                      stopPropagation keeps the row dialog closed. */}
                  <TableCell
                    className="w-10 text-right"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={tx(`${s.name} — অ্যাকশন মেনু`, `${s.name} — action menu`)}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onSelect={() => void openDetail(s.id)}>
                          <Eye className="h-4 w-4" />
                          {tx('বিস্তারিত দেখুন', 'View details')}
                        </DropdownMenuItem>
                        {owner && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              className="text-destructive"
                              onSelect={() => setConfirmSingle(s)}
                            >
                              <Trash2 className="h-4 w-4" />
                              {tx('শিক্ষার্থী ডিলিট করুন', 'Delete student')}
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
        </motion.div>
      )}

      {/* Detail dialog */}
      <Dialog open={detailLoading || Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          {detailLoading || !detail ? (
            <div className="space-y-3 py-6">
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-40 rounded-2xl" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 pr-8 text-lg">
                  {detail.student.name}
                  <Badge variant="secondary">{classLabel(detail.student.studentClass, lang)}</Badge>
                  {detail.student.isVerified && (
                    <Badge className="gap-1 border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <ShieldCheck className="h-3 w-3" /> {tx('ভেরিফায়েড', 'Verified')}
                    </Badge>
                  )}
                  {detail.student.isBlocked && (
                    <Badge variant="destructive">{tx('ব্লকড', 'Blocked')}</Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {tx('শিক্ষার্থীর সম্পূর্ণ প্রোফাইল ও কার্যক্রম', 'Full profile and activity')}
                </DialogDescription>
              </DialogHeader>

              {/* Profile block */}
              <div className="grid gap-x-4 gap-y-2 rounded-xl border bg-muted/30 p-4 text-sm sm:grid-cols-2">
                <p><span className="text-muted-foreground">{t('email')}:</span> {detail.student.email ?? '—'}</p>
                <p><span className="text-muted-foreground">{t('phone')}:</span> {detail.student.phone ?? '—'}</p>
                <p><span className="text-muted-foreground">{tx('প্রতিষ্ঠান', 'Institution')}:</span> {detail.student.institution ?? '—'}</p>
                <p><span className="text-muted-foreground">{tx('শ্রেণি/বর্ষ', 'Class')}:</span> {classLabel(detail.student.studentClass, lang)}</p>
                <p><span className="text-muted-foreground">{tx('একাউন্ট খোলা', 'Registered')}:</span> {fmtStampText(detail.student.createdAt)}</p>
                <p><span className="text-muted-foreground">{tx('নোটিফিকেশন', 'Notifications')}:</span> {digitsBn(detail.notificationsCount)}</p>
              </div>

              {/* Enrollments */}
              <DetailSection icon={<BookOpen className="h-4 w-4" />} title={tx('ভর্তি কোর্স', 'Enrolled courses')}>
                {detail.enrollments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{tx('নেই', 'None')}</p>
                ) : (
                  detail.enrollments.map((e) => (
                    <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{e.course.title}</span>
                      <Badge variant="secondary">{digitsBn(e.progress)}%</Badge>
                      <span className="text-xs text-muted-foreground">{fmtDate(e.enrolledAt, lang)}</span>
                    </div>
                  ))
                )}
              </DetailSection>

              {/* Orders */}
              <DetailSection icon={<ReceiptText className="h-4 w-4" />} title={tx('অর্ডার', 'Orders')}>
                {detail.orders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{tx('নেই', 'None')}</p>
                ) : (
                  detail.orders.map((o) => (
                    <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{o.course?.title ?? '—'}</span>
                      <span className="font-mono text-xs text-muted-foreground">{o.invoiceNo ?? o.trxId}</span>
                      <span className="font-semibold">{fmtBDT(o.amount, lang)}</span>
                      <Badge
                        variant="outline"
                        className={o.status === 'SUCCESS' ? 'border-emerald-300 text-emerald-700' : o.status === 'FAILED' ? 'border-destructive/40 text-destructive' : ''}
                      >
                        {o.status === 'SUCCESS' ? tx('সফল', 'Success') : o.status === 'FAILED' ? tx('ব্যর্থ', 'Failed') : tx('পেন্ডিং', 'Pending')}
                      </Badge>
                    </div>
                  ))
                )}
              </DetailSection>

              {/* Purchases */}
              <DetailSection icon={<ShoppingBag className="h-4 w-4" />} title={tx('সাজেশন ক্রয়', 'Suggestion purchases')}>
                {detail.purchases.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{tx('নেই', 'None')}</p>
                ) : (
                  detail.purchases.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{p.suggestion?.title ?? '—'}</span>
                      <span className="font-semibold">{fmtBDT(p.amount, lang)}</span>
                      <Badge
                        variant="outline"
                        className={p.status === 'SUCCESS' ? 'border-emerald-300 text-emerald-700' : p.status === 'FAILED' ? 'border-destructive/40 text-destructive' : ''}
                      >
                        {p.status === 'SUCCESS' ? tx('সফল', 'Success') : p.status === 'FAILED' ? tx('ব্যর্থ', 'Failed') : tx('পেন্ডিং', 'Pending')}
                      </Badge>
                    </div>
                  ))
                )}
              </DetailSection>

              {/* Quiz attempts */}
              {detail.quizAttempts.length > 0 && (
                <DetailSection icon={<GraduationCap className="h-4 w-4" />} title={tx('সাম্প্রতিক পরীক্ষা', 'Recent exams')}>
                  {detail.quizAttempts.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{a.quiz?.title ?? '—'}</span>
                      <span className="font-semibold">{digitsBn(a.score)}/{digitsBn(a.total)}</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(a.createdAt, lang)}</span>
                    </div>
                  ))}
                </DetailSection>
              )}

              {/* Manual enrollment */}
              <DetailSection icon={<UserPlus className="h-4 w-4" />} title={tx('ম্যানুয়াল এনরোলমেন্ট', 'Manual enrollment')}>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select value={enrollCourseId} onValueChange={setEnrollCourseId}>
                    <SelectTrigger className="w-full sm:flex-1">
                      <SelectValue placeholder={tx('কোর্স বাছুন', 'Pick a course')} />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {courses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    className="gap-2"
                    disabled={enrolling || !enrollCourseId}
                    onClick={() => void handleManualEnroll()}
                  >
                    {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    {tx('এনরোল করুন', 'Enroll')}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {tx(
                    'পেমেন্ট ছাড়াই শিক্ষার্থীকে কোর্সে যোগ করুন — সাথে সাথেই তার ড্যাশবোর্ডে দেখা যাবে।',
                    'Add the student to a course without payment — it appears on their dashboard instantly.'
                  )}
                </p>
              </DetailSection>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmations (owner-only flows) */}
      <AlertDialog open={Boolean(confirmSingle)} onOpenChange={(o) => !o && setConfirmSingle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('শিক্ষার্থী ডিলিট করবেন?', 'Delete this student?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmSingle
                ? tx(
                    `${confirmSingle.name}-এর একাউন্ট ও তার সব ভর্তি/অর্ডার স্থায়ীভাবে মুছে যাবে — এটি ফেরানো যাবে না।`,
                    `${confirmSingle.name}'s account and all of their enrollments and orders will be permanently deleted. This cannot be undone.`
                  )
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                const target = confirmSingle
                setConfirmSingle(null)
                if (target) void deleteStudents([target.id])
              }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tx('নির্বাচিত শিক্ষার্থীরা মুছে যাবে?', 'Delete the selected students?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `${digitsBn(selected.size)} জন শিক্ষার্থীর একাউন্ট ও তাদের সব ভর্তি/অর্ডার স্থায়ীভাবে মুছে যাবে — এটি ফেরানো যাবে না।`,
                `${selected.size} selected student account(s) and all of their enrollments and orders will be permanently deleted. This cannot be undone.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                setBulkConfirmOpen(false)
                void deleteStudents(Array.from(selected))
              }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function DetailSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        {title}
      </h3>
      <Separator className="mb-2" />
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

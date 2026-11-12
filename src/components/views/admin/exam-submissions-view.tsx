'use client'

/**
 * AdminExamSubmissionsView — written exam answer sheets (এক্সাম সাবমিশন).
 * Students upload scanned answer images/PDF with their submission; the admin
 * opens each submission to view the attachments (lightbox-style preview),
 * the auto-graded MCQ score, then records written marks + note.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  CheckCircle2,
  Clock,
  Eye,
  Inbox,
  Search,
  ShieldX,
} from 'lucide-react'
import { PdfFileIcon } from '@/components/shared/pdf-file-icon'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
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
import { fmtDate, fmtStampText, digitsBn } from '@/lib/format'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { isPanelRole } from '@/lib/roles'
import { classLabel } from '@/lib/student-classes'

interface SubmissionRow {
  id: string
  answerUrls: string
  note: string | null
  status: string // SUBMITTED | REVIEWED
  score: number | null
  maxScore: number | null
  adminNote: string | null
  reviewedAt: string | null
  reviewedBy: string | null
  createdAt: string
  user: {
    id: string
    name: string
    email: string | null
    phone: string | null
    studentClass: string | null
    avatarUrl: string | null
  }
  quiz: { id: string; title: string; durationMin: number }
  attempt: { id: string; score: number; total: number; timeTaken: number; createdAt: string } | null
}

function parseUrls(raw: string): string[] {
  try {
    const arr: unknown = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.map(String).filter(Boolean)
  } catch {
    // fall through
  }
  return []
}

export default function AdminExamSubmissionsView() {
  const { t, tx, lang } = useUI()
  const { user, status, initialized } = useAuth()

  const [rows, setRows] = useState<SubmissionRow[] | null>(null)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUBMITTED' | 'REVIEWED'>('ALL')
  const [detail, setDetail] = useState<SubmissionRow | null>(null)
  const [score, setScore] = useState('')
  const [maxScore, setMaxScore] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await apiGet<SubmissionRow[]>('/api/admin/exam-submissions')
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
    if (statusFilter !== 'ALL') list = list.filter((r) => r.status === statusFilter)
    const query = q.trim().toLowerCase()
    if (query) {
      list = list.filter(
        (r) =>
          r.user?.name?.toLowerCase().includes(query) ||
          r.user?.phone?.includes(query) ||
          r.quiz?.title?.toLowerCase().includes(query)
      )
    }
    return list
  }, [rows, q, statusFilter])

  function openDetail(r: SubmissionRow) {
    setDetail(r)
    setScore(r.score != null ? String(r.score) : r.attempt ? String(r.attempt.score) : '')
    setMaxScore(r.maxScore != null ? String(r.maxScore) : r.attempt ? String(r.attempt.total) : '')
    setAdminNote(r.adminNote ?? '')
  }

  async function saveReview() {
    if (!detail) return
    setSaving(true)
    try {
      await apiPatch(`/api/admin/exam-submissions/${detail.id}`, {
        ...(score.trim() !== '' ? { score: Number(score) } : {}),
        ...(maxScore.trim() !== '' ? { maxScore: Number(maxScore) } : {}),
        ...(adminNote.trim() ? { adminNote: adminNote.trim() } : {}),
        markReviewed: true,
      })
      toast.success(tx('যাচাই সম্পন্ন — শিক্ষার্থীকে জানিয়ে দেওয়া হয়েছে।', 'Review saved — the student has been notified.'))
      setDetail(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সংরক্ষণ ব্যর্থ', 'Save failed'))
    } finally {
      setSaving(false)
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
  const detailUrls = detail ? parseUrls(detail.answerUrls) : []

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{tx('এক্সাম সাবমিশন', 'Exam Submissions')}</h1>
        <p className="text-sm text-muted-foreground">
          {tx(
            'শিক্ষার্থীদের জমা দেওয়া উত্তরপত্র (ছবি/PDF) দেখুন, MCQ স্কোরের সাথে লিখিত নম্বর দিন।',
            'Review uploaded answer sheets (images/PDF), then record written marks next to the MCQ score.'
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
            placeholder={tx('খুঁজুন: নাম/ফোন/পরীক্ষা', 'Search: name/phone/exam')}
            className="pl-8"
          />
        </div>
        {(['ALL', 'SUBMITTED', 'REVIEWED'] as const).map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {s === 'ALL'
              ? tx('সব', 'All')
              : s === 'SUBMITTED'
                ? tx('নতুন জমা', 'New')
                : tx('যাচাইকৃত', 'Reviewed')}
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
          icon={<Inbox className="h-7 w-7" />}
          title={tx('কোনো সাবমিশন নেই', 'No submissions')}
          description={tx(
            'উত্তরপত্র আপলোডের সুবিধাযুক্ত পরীক্ষায় শিক্ষার্থীরা জমা দিলে এখানে দেখা যাবে।',
            'Answer sheets appear here once students submit exams with upload enabled.'
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
                      <TableHead>MCQ</TableHead>
                      <TableHead>{tx('ফাইল', 'Files')}</TableHead>
                      <TableHead>{tx('লিখিত নম্বর', 'Written marks')}</TableHead>
                      <TableHead>{tx('অবস্থা', 'Status')}</TableHead>
                      <TableHead>{t('date')}</TableHead>
                      <TableHead className="text-right">{t('actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const urls = parseUrls(r.answerUrls)
                      return (
                        <TableRow key={r.id} className="cursor-pointer" onClick={() => openDetail(r)}>
                          <TableCell>
                            <p className="max-w-[200px] truncate text-sm font-semibold">{r.quiz?.title}</p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium">{r.user?.name}</p>
                            <p className="text-xs text-muted-foreground">{r.user?.phone}</p>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {r.attempt ? `${num(r.attempt.score)}/${num(r.attempt.total)}` : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{num(urls.length)}</Badge>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {r.score != null ? `${num(r.score)}/${num(r.maxScore ?? 0)}` : '—'}
                          </TableCell>
                          <TableCell>
                            {r.status === 'REVIEWED' ? (
                              <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                {tx('যাচাইকৃত', 'Reviewed')}
                              </Badge>
                            ) : (
                              <Badge className="border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                                {tx('নতুন', 'New')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell><DateStamp iso={r.createdAt} label={t('date')} /></TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={t('view')}
                              onClick={(e) => {
                                e.stopPropagation()
                                openDetail(r)
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </ScrollX>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Review dialog ── */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tx('উত্তরপত্র যাচাই', 'Review answer sheet')}</DialogTitle>
            <DialogDescription>
              {detail?.quiz?.title} · {detail?.user?.name}
              {detail?.user?.studentClass
                ? ` · ${classLabel(detail.user.studentClass, lang)}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
            {/* MCQ + meta */}
            {detail && (
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">MCQ {tx('স্কোর', 'score')}</p>
                  <p className="text-lg font-bold tabular-nums">
                    {detail.attempt ? `${num(detail.attempt.score)}/${num(detail.attempt.total)}` : '—'}
                  </p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">{tx('সময় লেগেছে', 'Time taken')}</p>
                  <p className="flex items-center gap-1 text-sm font-semibold">
                    <Clock className="h-3.5 w-3.5" />
                    {detail.attempt ? `${num(Math.round(detail.attempt.timeTaken / 60))} ${t('minutes')}` : '—'}
                  </p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">{tx('জমার তারিখ', 'Submitted')}</p>
                  <p className="text-sm font-semibold">{fmtStampText(detail.createdAt)}</p>
                </div>
              </div>
            )}

            {/* Attachments */}
            {detailUrls.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-semibold">
                  {tx('জমা দেওয়া উত্তরপত্র', 'Uploaded answer sheets')} ({num(detailUrls.length)})
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {detailUrls.map((u, i) =>
                    u.endsWith('.pdf') ? (
                      <a
                        key={u}
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border bg-muted/60 text-xs font-medium hover:bg-muted"
                      >
                        <PdfFileIcon className="h-6 w-6" />
                        PDF-{i + 1}
                      </a>
                    ) : (
                      <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="group relative">
                        <img
                          src={u}
                          alt={`answer-${i + 1}`}
                          className="h-24 w-full rounded-xl border bg-muted object-cover transition-opacity group-hover:opacity-85"
                        />
                        <span className="absolute bottom-1 right-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold">
                          #{i + 1} ↗
                        </span>
                      </a>
                    )
                  )}
                </div>
              </div>
            ) : (
              <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
                {tx('কোনো ফাইল জমা দেওয়া হয়নি।', 'No files were attached.')}
              </p>
            )}

            {detail?.note && (
              <p className="rounded-xl border bg-muted/40 p-3 text-sm">
                <span className="font-semibold">{tx('শিক্ষার্থীর নোট', 'Student note')}: </span>
                {detail.note}
              </p>
            )}

            {/* Marks form */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="es-score">{tx('লিখিত প্রাপ্ত নম্বর', 'Written marks')}</Label>
                <Input
                  id="es-score"
                  type="number"
                  min={0}
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="es-max">{tx('সর্বোচ্চ নম্বর', 'Out of')}</Label>
                <Input
                  id="es-max"
                  type="number"
                  min={0}
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-note">{tx('ফিডব্যাক (ঐচ্ছিক)', 'Feedback (optional)')}</Label>
              <Textarea id="es-note" rows={2} value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>
              {t('cancel')}
            </Button>
            <Button className="gap-2" disabled={saving} onClick={() => void saveReview()}>
              <CheckCircle2 className="h-4 w-4" />
              {tx('যাচাই সম্পন্ন করুন', 'Save review')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-center text-xs text-muted-foreground">
        {tx(`মোট ${num(filtered.length)} টি সাবমিশন`, `${filtered.length} submission(s)`)}
      </p>
    </div>
  )
}

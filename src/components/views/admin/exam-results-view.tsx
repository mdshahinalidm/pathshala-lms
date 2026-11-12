'use client'

/**
 * AdminExamResultsView — /admin/exam-results — EXAM RESULT CENTER.
 * Submissions list (filters + search) → open a student submission → review
 * every answer sheet (zoom viewer), annotate with the online pen
 * (non-destructive layer), give marks + feedback, publish the result.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Award,
  CalendarDays,
  CheckCircle2,
  Loader2,
  PenTool,
  RefreshCcw,
  Search,
  Send,
  User as UserIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { apiGet, apiPatch, apiPost } from '@/lib/api-client'
import { digitsBn, fmtDateTime, fmtStampText } from '@/lib/format'
import { DateStamp } from '@/components/admin/date-stamp'
import { useUI } from '@/store/ui-store'
import { ImageViewer } from '@/components/exams/image-viewer'
import { Annotator, type Stroke } from '@/components/exams/annotator'
import { cn } from '@/lib/utils'

interface Submission {
  id: string
  status: string // SUBMITTED | MARKED | PUBLISHED
  expired: boolean
  submittedAt: string | null
  createdAt?: string | null // attempt creation time (fallback for the date stamp)
  totalMarks: number
  obtainedMarks: number | null
  percentage: number | null
  grade: string | null
  publishedAt: string | null
  imageCount: number
  user: { id: string; name: string; email: string | null; phone: string | null; avatarUrl: string | null; studentClass: string | null }
  exam: { id: string; title: string; categoryName: string | null; subjectName: string | null; totalMarks: number }
}

interface DetailImage {
  id: string
  order: number
  url: string
  fileName: string | null
  fileSize: number | null
  annotationData: Stroke[]
  annotatedUrl: string | null
}

interface Detail {
  attempt: {
    id: string
    status: string
    submittedAt: string | null
    expired: boolean
    totalMarks: number
    obtainedMarks: number | null
    percentage: number | null
    grade: string | null
    feedback: string | null
  }
  student: { id: string; name: string; email: string | null; phone: string | null; avatarUrl: string | null; studentClass: string | null; institution: string | null }
  exam: { id: string; title: string; categoryName: string | null; subjectName: string | null; totalMarks: number; courseTitle: string | null }
  images: DetailImage[]
}

const STATUS_BADGE: Record<string, string> = {
  SUBMITTED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  MARKED: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200',
  PUBLISHED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
}

export default function AdminExamResultsView() {
  const { tx } = useUI()

  const [rows, setRows] = useState<Submission[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [examId, setExamId] = useState('all')
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [exams, setExams] = useState<{ id: string; title: string }[]>([])

  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [marks, setMarks] = useState('')
  const [feedback, setFeedback] = useState('')
  const [savingMarks, setSavingMarks] = useState(false)
  const [publishConfirm, setPublishConfirm] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // viewer / annotator state
  const [viewerIndex, setViewerIndex] = useState(0)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [annotating, setAnnotating] = useState<DetailImage | null>(null)
  const [savingAnnotation, setSavingAnnotation] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const sp = new URLSearchParams()
      if (examId !== 'all') sp.set('examId', examId)
      if (status !== 'all') sp.set('status', status)
      if (q.trim()) sp.set('q', q.trim())
      const data = await apiGet<{ submissions: Submission[] }>(`/api/admin/exam-results?${sp.toString()}`)
      setRows(data.submissions ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [examId, status, q, tx])

  useEffect(() => {
    const timer = setTimeout(() => void load(), q ? 300 : 0)
    return () => clearTimeout(timer)
  }, [load, q])

  useEffect(() => {
    apiGet<{ id: string; title: string }[]>('/api/admin/written-exams')
      .then((list) => setExams((list ?? []).map((e: { id: string; title: string }) => ({ id: e.id, title: e.title }))))
      .catch(() => setExams([]))
  }, [])

  async function openDetail(id: string) {
    setDetailLoading(true)
    setAnnotating(null)
    try {
      const d = await apiGet<Detail>(`/api/admin/exam-results/${id}`)
      setDetail(d)
      setMarks(d.attempt.obtainedMarks != null ? String(d.attempt.obtainedMarks) : '')
      setFeedback(d.attempt.feedback ?? '')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setDetailLoading(false)
    }
  }

  async function saveMarks() {
    if (!detail) return
    const value = Math.round(Number(marks))
    if (Number.isNaN(value) || value < 0 || value > detail.attempt.totalMarks) {
      toast.error(
        tx(`০ থেকে ${detail.attempt.totalMarks} এর মধ্যে নম্বর দিন`, `Marks must be 0–${detail.attempt.totalMarks}`)
      )
      return
    }
    setSavingMarks(true)
    try {
      await apiPatch(`/api/admin/exam-results/${detail.attempt.id}`, {
        obtainedMarks: value,
        feedback: feedback.trim() || undefined,
      })
      toast.success(tx('নম্বর সংরক্ষিত', 'Marks saved'))
      await openDetail(detail.attempt.id)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সংরক্ষণ ব্যর্থ', 'Save failed'))
    } finally {
      setSavingMarks(false)
    }
  }

  async function publish() {
    if (!detail) return
    setPublishing(true)
    try {
      await apiPost(`/api/admin/exam-results/${detail.attempt.id}/publish`)
      toast.success(tx('ফলাফল পাবলিশ হয়েছে — ছাত্রকে নোটিফিকেশন গেছে', 'Result published — student notified'))
      setPublishConfirm(false)
      await openDetail(detail.attempt.id)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('পাবলিশ ব্যর্থ', 'Publish failed'))
    } finally {
      setPublishing(false)
    }
  }

  /** upload the flattened annotated PNG + strokes for one answer image */
  async function saveAnnotation(strokes: Stroke[], blob: Blob) {
    if (!annotating || !detail) return
    setSavingAnnotation(true)
    try {
      const fd = new FormData()
      fd.append('file', blob, 'annotated.png')
      fd.append('annotationData', JSON.stringify(strokes))
      const res = await fetch(`/api/admin/exam-images/${annotating.id}`, { method: 'PUT', body: fd })
      const json = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? tx('সংরক্ষণ ব্যর্থ', 'Save failed'))
      toast.success(tx('মার্কিং সংরক্ষিত — মূল ছবি অক্ষত', 'Marking saved — original preserved'))
      setAnnotating(null)
      await openDetail(detail.attempt.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সংরক্ষণ ব্যর্থ', 'Save failed'))
    } finally {
      setSavingAnnotation(false)
    }
  }

  /** display URL prefers the annotated variant (admins see their marking) */
  const detailImages = useMemo(
    () =>
      (detail?.images ?? []).map((i) => ({
        id: i.id,
        url: i.annotatedUrl ?? i.url,
        label: `${tx('উত্তরপত্র', 'Answer sheet')} ${digitsBn(i.order + 1)}`,
      })),
    [detail, tx]
  )

  const num = (n: number | string) => digitsBn(n)

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{tx('রেজাল্ট সেন্টার', 'Exam Result Center')}</h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'জমা হওয়া উত্তরপত্র রিভিউ করুন, অনলাইন কলমে মার্কিং দিন, নম্বর দিয়ে ফলাফল পাবলিশ করুন।',
              'Review submissions, mark with the online pen, give marks and publish results.'
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => void load()}>
          <RefreshCcw className="h-4 w-4" /> {tx('রিফ্রেশ', 'Refresh')}
        </Button>
      </div>

      {/* filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-5">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tx('ছাত্রের নাম/ইমেইল/পরীক্ষা খুঁজুন…', 'Search student / email / exam…')}
              className="pl-8"
            />
          </div>
          <Select value={examId} onValueChange={setExamId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={tx('পরীক্ষা', 'Exam')} />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="all">{tx('সব পরীক্ষা', 'All exams')}</SelectItem>
              {exams.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={tx('স্ট্যাটাস', 'Status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx('সব', 'All')}</SelectItem>
              <SelectItem value="SUBMITTED">{tx('জমা হয়েছে', 'Submitted')}</SelectItem>
              <SelectItem value="MARKED">{tx('মার্কড', 'Marked')}</SelectItem>
              <SelectItem value="PUBLISHED">{tx('পাবলিশড', 'Published')}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          icon={<Award className="h-7 w-7" />}
          title={tx('কোনো জমা নেই', 'No submissions')}
          description={tx(
            'ছাত্ররা পরীক্ষা জমা দিলে এখানে দেখা যাবে।',
            'Student submissions will appear here.'
          )}
        />
      ) : (
        <div className="space-y-2">
          {rows.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void openDetail(s.id)}
              className="flex w-full flex-wrap items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <Avatar className="h-9 w-9">
                {s.user.avatarUrl ? <AvatarImage src={s.user.avatarUrl} alt={s.user.name} /> : null}
                <AvatarFallback className="grad-brand text-xs text-white">
                  {s.user.name.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.exam.title}
                  {s.exam.subjectName ? ` · ${s.exam.subjectName}` : ''}
                </p>
              </div>
              <div className="hidden sm:block">
                <DateStamp
                  iso={s.submittedAt ?? s.createdAt}
                  label={tx('জমার তারিখ', 'Submitted at')}
                />
              </div>
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> {num(s.imageCount)} {tx('ছবি', 'img')}
              </Badge>
              {s.obtainedMarks != null && (
                <Badge variant="secondary" className="gap-1">
                  {num(s.obtainedMarks)}/{num(s.totalMarks)}
                </Badge>
              )}
              <Badge className={cn('border-transparent', STATUS_BADGE[s.status] ?? '')}>
                {s.status === 'SUBMITTED'
                  ? tx('জমা', 'Submitted')
                  : s.status === 'MARKED'
                    ? tx('মার্কড', 'Marked')
                    : tx('পাবলিশড', 'Published')}
              </Badge>
            </button>
          ))}
        </div>
      )}

      {/* submission detail dialog */}
      <Dialog open={Boolean(detail) || detailLoading} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto">
          {detailLoading || !detail ? (
            <>
              <DialogTitle className="sr-only">{tx('জমা লোড হচ্ছে', 'Loading submission')}</DialogTitle>
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{detail.exam.title}</DialogTitle>
                <DialogDescription>
                  {detail.exam.courseTitle ?? detail.exam.categoryName ?? '—'}
                  {detail.exam.subjectName ? ` · ${detail.exam.subjectName}` : ''}
                </DialogDescription>
              </DialogHeader>

              {/* student header */}
              <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 p-3">
                <Avatar className="h-12 w-12">
                  {detail.student.avatarUrl ? (
                    <AvatarImage src={detail.student.avatarUrl} alt={detail.student.name} />
                  ) : null}
                  <AvatarFallback className="grad-brand text-white">
                    {detail.student.name.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{detail.student.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {detail.student.email ?? '—'} · {detail.student.phone ?? '—'}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p className="flex items-center gap-1">
                    <UserIcon className="h-3 w-3" /> ID: {detail.student.id.slice(-8)}
                  </p>
                  <p className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />{' '}
                    {detail.attempt.submittedAt ? fmtStampText(detail.attempt.submittedAt) : '—'}
                    {detail.attempt.expired ? ` · ${tx('সময় শেষে স্বয়ংক্রিয় জমা', 'auto-submitted')}` : ''}
                  </p>
                </div>
                <Badge className={cn('border-transparent', STATUS_BADGE[detail.attempt.status] ?? '')}>
                  {detail.attempt.status === 'PUBLISHED'
                    ? tx('পাবলিশড', 'Published')
                    : detail.attempt.status === 'MARKED'
                      ? tx('মার্কড', 'Marked')
                      : tx('জমা', 'Submitted')}
                </Badge>
              </div>

              {/* answer sheets gallery */}
              <div>
                <p className="mb-2 text-sm font-semibold">
                  {tx('জমা দেওয়া উত্তরপত্র', 'Submitted answer sheets')} (
                  {num(detail.images.length)})
                </p>
                {detail.images.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    {tx('কোনো ছবি জমা হয়নি', 'No images were submitted')}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {detail.images.map((img, idx) => (
                      <div key={img.id} className="group relative overflow-hidden rounded-xl border">
                        <button
                          type="button"
                          className="block w-full"
                          onClick={() => {
                            setViewerIndex(idx)
                            setViewerOpen(true)
                          }}
                          aria-label={`${tx('ছবি দেখুন', 'View image')} ${idx + 1}`}
                        >
                          { }
                          <img
                            src={img.annotatedUrl ?? img.url}
                            alt={img.fileName ?? `answer-${idx + 1}`}
                            loading="lazy"
                            className="aspect-[3/4] w-full bg-white object-contain"
                          />
                        </button>
                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {num(idx + 1)}
                        </span>
                        {img.annotatedUrl && (
                          <span className="absolute right-1 top-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            ✓ {tx('মার্কড', 'Marked')}
                          </span>
                        )}
                        <Button
                          size="icon"
                          variant="secondary"
                          className="absolute right-1 top-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() => setAnnotating(img)}
                          aria-label="Annotate"
                        >
                          <PenTool className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* annotator */}
              {annotating && (
                <div className="rounded-xl border-2 border-primary/40 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <PenTool className="h-4 w-4" />
                    {tx('অনলাইন কলমে মার্কিং', 'Online pen marking')} —{' '}
                    {tx('উত্তরপত্র', 'Sheet')} {num(annotating.order + 1)}
                  </p>
                  <Annotator
                    imageUrl={annotating.url}
                    initialStrokes={annotating.annotationData ?? []}
                    onSave={saveAnnotation}
                    onCancel={() => setAnnotating(null)}
                  />
                </div>
              )}

              {/* marking */}
              <div className="grid gap-3 rounded-xl border p-3">
                <p className="text-sm font-semibold">{tx('মার্কিং', 'Marking')}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="rc-marks">
                      {tx('প্রাপ্ত নম্বর', 'Obtained marks')} ({tx('মোট', 'of')} {num(detail.attempt.totalMarks)})
                    </Label>
                    <Input
                      id="rc-marks"
                      type="number"
                      min={0}
                      max={detail.attempt.totalMarks}
                      value={marks}
                      onChange={(e) => setMarks(e.target.value)}
                      disabled={detail.attempt.status === 'PUBLISHED'}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{tx('শতকরা', 'Percentage')}</Label>
                    <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm font-semibold">
                      {detail.attempt.percentage != null ? `${num(detail.attempt.percentage)}%` : '—'}
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{tx('গ্রেড', 'Grade')}</Label>
                    <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm font-semibold">
                      {detail.attempt.grade ?? '—'}
                    </p>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rc-feedback">{tx('শিক্ষকের মন্তব্য', 'Teacher feedback')}</Label>
                  <Textarea
                    id="rc-feedback"
                    rows={2}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    disabled={detail.attempt.status === 'PUBLISHED'}
                    placeholder={tx('সামগ্রিক মূল্যায়ন লিখুন…', 'Overall feedback…')}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void saveMarks()}
                    disabled={savingMarks || detail.attempt.status === 'PUBLISHED'}
                  >
                    {savingMarks ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {tx('নম্বর সেভ করুন', 'Save marks')}
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 grad-emerald border-transparent text-white"
                    onClick={() => setPublishConfirm(true)}
                    disabled={detail.attempt.status === 'PUBLISHED' || detail.attempt.obtainedMarks == null}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {detail.attempt.status === 'PUBLISHED'
                      ? tx('ফলাফল পাবলিশড', 'Result published')
                      : tx('ফলাফল পাবলিশ করুন', 'Publish result')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* publish confirm */}
      <AlertDialog open={publishConfirm} onOpenChange={setPublishConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('ফলাফল পাবলিশ করবেন?', 'Publish this result?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                'পাবলিশ করলে ছাত্র তার প্যানেলে ফলাফল ও মূল্যায়িত উত্তরপত্র দেখতে পাবে এবং নোটিফিকেশন পাবে।',
                'After publishing, the student sees the result and evaluated answer sheets and receives a notification.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tx('বাতিল', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="grad-emerald border-transparent text-white"
              onClick={(e) => {
                e.preventDefault()
                void publish()
              }}
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : tx('পাবলিশ করুন', 'Publish')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* fullscreen viewer */}
      <ImageViewer
        images={detailImages}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  )
}

'use client'

/**
 * Admin Result Center — grade written (CQ) exams.
 *
 *  1. Pick an exam → every SUBMITTED attempt appears with the student
 *     profile (name, avatar, class), submission time and sheet count.
 *  2. Open a submission → media-gallery style answer-sheet viewer; the admin
 *     marks the khata with an online pen (color/width/undo/clear), assigns
 *     per-sheet marks, the final total marks and an optional feedback note.
 *  3. Select submissions (or all at once) → "Publish Result" → each student
 *     instantly receives a notification and sees marks + their marked sheets
 *     in the dashboard Results section.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3, CheckCircle2, ChevronLeft, ChevronRight, Clock, Eraser, FileCheck2,
  Loader2, PenLine, RefreshCw, Send, Undo2, Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import AnnotatedImage, { type PenStroke } from '@/components/shared/annotated-image'
import { gradeForLevel, roundGpa } from '@/lib/grading'
import { apiGet, apiPost, apiPut } from '@/lib/api-client'
import { useUI } from '@/store/ui-store'
import { cn } from '@/lib/utils'

interface SheetDraft {
  id: string
  imageUrl: string
  order: number
  marks: number | null
  annotations: PenStroke[]
}

interface Submission {
  id: string
  userId: string
  studentName: string
  avatarUrl: string | null
  studentClass: string | null
  email: string | null
  phone: string | null
  submittedAt: string
  timeTaken: number
  totalMarks: number | null
  feedback: string | null
  isPublished: boolean
  publishedAt: string | null
  grade: string | null
  gpa: number | null
  subjectId: string | null
  subjectName: string | null
  fullMarks: number | null
  mcqScore: number | null
  mcqTotal: number | null
  sheets: SheetDraft[]
  legacyScriptUrl: string | null
  legacyScriptName: string | null
}

interface QuizLite {
  id: string
  title: string
  paperKind?: string
  level?: string
  isPublished?: boolean
}

const PEN_COLORS = ['#ef4444', '#16a34a', '#111827', '#f97316']
const PEN_WIDTHS = [2, 4, 8]

const CLASS_LABELS: Record<string, string> = {
  CLASS_9: 'ক্লাস ৯', CLASS_10: 'ক্লাস ১০', CLASS_11: 'ক্লাস ১১', CLASS_12: 'ক্লাস ১২',
  HONOURS_1ST: 'সম্মান ১ম', HONOURS_2ND: 'সম্মান ২য়', HONOURS_3RD: 'সম্মান ৩য়', HONOURS_4TH: 'সম্মান ৪র্থ',
}

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export default function ResultCenterView() {
  const { t, tx } = useUI()

  const [exams, setExams] = useState<QuizLite[]>([])
  const [quizId, setQuizId] = useState('')
  const [quizInfo, setQuizInfo] = useState<QuizLite | null>(null)
  const [examsLoading, setExamsLoading] = useState(true)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  // ── grading dialog state ──
  const [grading, setGrading] = useState<Submission | null>(null)
  const [draft, setDraft] = useState<{ totalMarks: string; feedback: string; sheets: SheetDraft[] } | null>(null)
  const [sheetIdx, setSheetIdx] = useState(0)
  const [penOn, setPenOn] = useState(true)
  const [color, setColor] = useState(PEN_COLORS[0])
  const [width, setWidth] = useState(4)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await apiGet<QuizLite[]>('/api/quizzes?scope=all&type=EXAM')
        if (alive) setExams(rows ?? [])
      } catch {
        if (alive) toast.error(tx('এক্সাম তালিকা লোড করা যায়নি।', 'Could not load the exam list.'))
      } finally {
        if (alive) setExamsLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [tx])

  const loadSubmissions = useCallback(
    async (id: string) => {
      if (!id) return
      setLoading(true)
      setSelected(new Set())
      try {
        const data = await apiGet<{
          quiz: QuizLite
          submissions: Submission[]
        }>(`/api/admin/exam-results?quizId=${id}`)
        setSubmissions(data.submissions ?? [])
        setQuizInfo(data.quiz ?? null)
      } catch {
        toast.error(tx('সাবমিশন লোড করা যায়নি।', 'Could not load submissions.'))
      } finally {
        setLoading(false)
      }
    },
    [tx]
  )

  useEffect(() => {
    if (quizId) void loadSubmissions(quizId)
  }, [quizId, loadSubmissions])

  const gradable = useMemo(() => submissions.filter((s) => !s.isPublished), [submissions])
  const allSelected = gradable.length > 0 && gradable.every((s) => selected.has(s.id))
  const pendingMarks = useMemo(
    () => [...selected].filter((id) => !submissions.find((s) => s.id === id)?.totalMarks).length,
    [selected, submissions]
  )

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const openGrading = (s: Submission) => {
    setGrading(s)
    setDraft({
      totalMarks: s.totalMarks === null || s.totalMarks === undefined ? '' : String(s.totalMarks),
      feedback: s.feedback ?? '',
      sheets: s.sheets.map((sh) => ({ ...sh, annotations: sh.annotations ?? [] })),
    })
    setSheetIdx(0)
    setPenOn(true)
  }

  const updateSheet = (sheetId: string, patch: Partial<SheetDraft>) => {
    setDraft((prev) =>
      prev ? { ...prev, sheets: prev.sheets.map((sh) => (sh.id === sheetId ? { ...sh, ...patch } : sh)) } : prev
    )
  }

  const saveGrading = async () => {
    if (!grading || !draft) return
    setSaving(true)
    try {
      const total = draft.totalMarks.trim() === '' ? null : Number(draft.totalMarks)
      if (total !== null && (!Number.isFinite(total) || total < 0)) {
        toast.error(tx('সঠিক নম্বর দিন।', 'Enter a valid marks number.'))
        setSaving(false)
        return
      }
      await apiPut(`/api/admin/exam-results/${grading.id}`, {
        totalMarks: total,
        feedback: draft.feedback.trim() || null,
        sheets: draft.sheets.map((sh) => ({ id: sh.id, marks: sh.marks, annotations: sh.annotations })),
      })
      toast.success(tx('গ্রেডিং সংরক্ষিত হয়েছে।', 'Grading saved.'))
      setGrading(null)
      setDraft(null)
      await loadSubmissions(quizId)
    } catch {
      toast.error(tx('সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।', 'Could not save. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const publishResults = async () => {
    if (selected.size === 0) return
    setPublishing(true)
    try {
      const res = await apiPost<{ published: number; skipped: { attemptId: string; reason: string }[] }>(
        '/api/admin/exam-results/publish',
        { attemptIds: [...selected] }
      )
      const noMarks = res.skipped.filter((s) => s.reason === 'no-marks').length
      toast.success(
        tx(
          `${res.published} জনের রেজাল্ট প্রকাশিত — নোটিফিকেশন পাঠানো হয়েছে।`,
          `${res.published} result(s) published — notifications sent.`
        )
      )
      if (noMarks > 0) {
        toast.warning(
          tx(
            `${noMarks} জনের নম্বর দেওয়া হয়নি — তারা বাদ গেছে।`,
            `${noMarks} submission(s) skipped — marks not assigned.`
          )
        )
      }
      setPublishOpen(false)
      setSelected(new Set())
      await loadSubmissions(quizId)
    } catch {
      toast.error(tx('প্রকাশ করা যায়নি। আবার চেষ্টা করুন।', 'Publishing failed. Please try again.'))
    } finally {
      setPublishing(false)
    }
  }

  const currentSheet = draft?.sheets[sheetIdx] ?? null

  /* ── client-side result sheet (marks → grade/GPA) ── */
  const obtainedOf = (s: Submission): number | null =>
    s.mcqTotal != null ? (s.mcqScore ?? 0) : s.totalMarks

  const gradeOf = (s: Submission): { grade: string; gpa: number } | null => {
    const obtained = obtainedOf(s)
    const full = s.fullMarks ?? 0
    if (obtained === null || full <= 0) return null
    if (s.grade && s.gpa != null) return { grade: s.grade, gpa: s.gpa }
    const pct = Math.max(0, Math.min(100, (obtained / full) * 100))
    const info = gradeForLevel(quizInfo?.level ?? 'CLASS', pct)
    return { grade: info.grade, gpa: roundGpa(info.gpa) }
  }

  const sheetGroups = useMemo(() => {
    const byUser = new Map<string, { name: string; avatarUrl: string | null; rows: Submission[] }>()
    for (const s of submissions) {
      const g = byUser.get(s.userId) ?? { name: s.studentName, avatarUrl: s.avatarUrl, rows: [] }
      g.rows.push(s)
      byUser.set(s.userId, g)
    }
    return [...byUser.values()].map((g) => {
      const graded = g.rows.map((s) => ({ s, info: gradeOf(s) }))
      const withInfo = graded.filter((r) => r.info) as { s: Submission; info: { grade: string; gpa: number } }[]
      const gpaAvg =
        withInfo.length > 0
          ? roundGpa(withInfo.reduce((acc, r) => acc + r.info.gpa, 0) / withInfo.length)
          : null
      return { ...g, graded, gpaAvg }
    })
  }, [submissions, quizInfo])

  return (
    <div className="space-y-6">
      {/* ── Header + exam selector ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <span className="grad-violet flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md shadow-violet-500/25">
              <BarChart3 className="h-5 w-5" />
            </span>
            {tx('রেজাল্ট সেন্টার', 'Result Center')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tx(
              'লিখিত এক্সামের উত্তরপত্র দেখুন, অনলাইন কলমে মার্ক করুন, নম্বর দিন এবং একসাথে রেজাল্ট প্রকাশ করুন।',
              'Review written-exam scripts, mark with the online pen, assign marks and publish results in bulk.'
            )}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-80">
          <Select value={quizId} onValueChange={setQuizId}>
            <SelectTrigger aria-label={tx('এক্সাম নির্বাচন', 'Select exam')} className="w-full">
              <SelectValue placeholder={tx('এক্সাম নির্বাচন করুন', 'Select an exam')} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {exams.map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  {q.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('refresh')}
            disabled={!quizId || loading}
            onClick={() => void loadSubmissions(quizId)}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* ── Bulk publish bar ── */}
      {quizId && submissions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={allSelected}
              disabled={gradable.length === 0}
              onCheckedChange={(v) =>
                setSelected(v === true ? new Set(gradable.map((s) => s.id)) : new Set())
              }
              aria-label={tx('সব নির্বাচন', 'Select all')}
            />
            {tx('সব নির্বাচন', 'Select all')}
          </label>
          <Badge variant="secondary" className="gap-1">
            <Users className="h-3 w-3" />
            {tx(`${selected.size} নির্বাচিত`, `${selected.size} selected`)}
          </Badge>
          {pendingMarks > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {tx(
                `${pendingMarks} জনের নম্বর এখনো দেওয়া হয়নি — প্রকাশের সময় বাদ যাবে।`,
                `${pendingMarks} submission(s) have no marks yet — they will be skipped.`
              )}
            </span>
          )}
          <Button
            className="ml-auto gap-2"
            disabled={selected.size === 0 || publishing}
            onClick={() => setPublishOpen(true)}
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {tx('রেজাল্ট প্রকাশ করুন', 'Publish results')}
          </Button>
          <Button variant="outline" className="gap-2" disabled={submissions.length === 0} onClick={() => setSheetOpen(true)}>
            <BarChart3 className="h-4 w-4" />
            {tx('রেজাল্ট শিট', 'Result sheet')}
          </Button>
        </div>
      )}

      {/* ── Submissions table ── */}
      {!quizId ? (
        <EmptyState
          icon={<FileCheck2 className="h-7 w-7" aria-hidden />}
          title={tx('একটি এক্সাম নির্বাচন করুন', 'Pick an exam')}
          description={tx(
            'উত্তরপত্র জমা দেওয়া শিক্ষার্থীদের দেখতে উপরের তালিকা থেকে এক্সাম বেছে নিন।',
            'Choose an exam above to review its submitted answer sheets.'
          )}
        />
      ) : loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : submissions.length === 0 ? (
        <EmptyState
          icon={<FileCheck2 className="h-7 w-7" aria-hidden />}
          title={tx('কোনো জমা নেই', 'No submissions yet')}
          description={tx(
            'এই এক্সামে এখনো কেউ উত্তরপত্র জমা দেয়নি।',
            'No student has submitted an answer script for this exam yet.'
          )}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>{tx('শিক্ষার্থী', 'Student')}</TableHead>
                <TableHead>{tx('বিষয় / ধরন', 'Subject / mode')}</TableHead>
                <TableHead>{tx('জমার সময়', 'Submitted')}</TableHead>
                <TableHead>{tx('খাতা', 'Sheets')}</TableHead>
                <TableHead>{tx('নম্বর', 'Marks')}</TableHead>
                <TableHead>{tx('গ্রেড', 'Grade')}</TableHead>
                <TableHead>{tx('অবস্থা', 'Status')}</TableHead>
                <TableHead className="text-right">{tx('অ্যাকশন', 'Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((s) => (
                <TableRow key={s.id} className={cn(s.isPublished && 'bg-emerald-500/5')}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(s.id)}
                      disabled={s.isPublished}
                      onCheckedChange={(v) => toggleSelect(s.id, v === true)}
                      aria-label={`${tx('নির্বাচন', 'Select')} ${s.studentName}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8">
                        {s.avatarUrl && <AvatarImage src={s.avatarUrl} alt={s.studentName} />}
                        <AvatarFallback className="text-xs font-bold">
                          {s.studentName.trim().slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{s.studentName}</div>
                        {s.studentClass && CLASS_LABELS[s.studentClass] && (
                          <div className="text-[11px] text-muted-foreground">{CLASS_LABELS[s.studentClass]}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {s.subjectName ? (
                      <Badge variant="outline" className="max-w-[140px] truncate">
                        {s.subjectName}
                      </Badge>
                    ) : s.mcqTotal != null ? (
                      <Badge variant="outline">MCQ</Badge>
                    ) : (
                      <Badge variant="outline">CQ</Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {fmtDate(s.submittedAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      {s.sheets.length > 0 ? `${s.sheets.length}` : '1'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-bold">
                    {obtainedOf(s) ?? <span className="text-muted-foreground">—</span>}
                    <span className="text-xs font-normal text-muted-foreground">
                      {s.fullMarks ? ` / ${s.fullMarks}` : ''}
                    </span>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const g = gradeOf(s)
                      if (!g) return <span className="text-muted-foreground">—</span>
                      return (
                        <Badge
                          className={cn(
                            'border-transparent',
                            g.grade === 'F'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          )}
                        >
                          {g.grade} · {g.gpa.toFixed(2)}
                        </Badge>
                      )
                    })()}
                  </TableCell>
                  <TableCell>
                    {s.isPublished ? (
                      <Badge className="gap-1 bg-emerald-600 text-white">
                        <CheckCircle2 className="h-3 w-3" /> {tx('প্রকাশিত', 'Published')}
                      </Badge>
                    ) : s.totalMarks !== null ? (
                      <Badge className="bg-amber-500 text-white">{tx('গ্রেডেড — অপ্রকাশিত', 'Graded')}</Badge>
                    ) : (
                      <Badge variant="secondary">{tx('গ্রেডিং বাকি', 'Pending grading')}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openGrading(s)}>
                      <PenLine className="h-3.5 w-3.5" />
                      {tx('দেখুন ও মার্ক', 'View & mark')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Publish confirm ── */}
      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('রেজাল্ট প্রকাশ করবেন?', 'Publish the results?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `${selected.size} জন শিক্ষার্থীর রেজাল্ট প্রকাশ হবে এবং সাথে সাথেই তাদের নোটিফিকেশনে চলে যাবে। নম্বর না দেওয়া সাবমিশন বাদ যাবে।`,
                `${selected.size} result(s) will be published and each student is notified instantly. Submissions without marks are skipped.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={publishing}
              onClick={(e) => {
                e.preventDefault()
                void publishResults()
              }}
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {tx('প্রকাশ করুন', 'Publish')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Grading dialog ── */}
      <Dialog open={!!grading && !!draft} onOpenChange={(open) => !open && setGrading(null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto sm:max-w-5xl">
          {grading && draft && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
                  <Avatar className="h-8 w-8">
                    {grading.avatarUrl && <AvatarImage src={grading.avatarUrl} alt={grading.studentName} />}
                    <AvatarFallback className="text-xs font-bold">
                      {grading.studentName.trim().slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {grading.studentName}
                  <span className="text-xs font-normal text-muted-foreground">
                    · {fmtDate(grading.submittedAt)}
                  </span>
                  {grading.isPublished && (
                    <Badge className="bg-emerald-600 text-white">{tx('প্রকাশিত', 'Published')}</Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {tx('উত্তরপত্রের ছবির উপর কলম চালিয়ে মার্ক করুন ও নম্বর দিন।', 'Mark the sheets with the pen and assign marks.')}
                </DialogDescription>
              </DialogHeader>

              {/* marks + feedback */}
              <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                <div className="grid gap-1.5">
                  <Label htmlFor="total-marks">
                    {tx('প্রাপ্ত নম্বর (মোট)', 'Total marks')}
                    {grading.fullMarks ? (
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                        / {tx(`পূর্ণমান ${grading.fullMarks}`, `of ${grading.fullMarks}`)}
                      </span>
                    ) : null}
                  </Label>
                  <Input
                    id="total-marks"
                    type="number"
                    min={0}
                    value={draft.totalMarks}
                    onChange={(e) => setDraft({ ...draft, totalMarks: e.target.value })}
                    placeholder="70"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="feedback">{tx('মন্তব্য (ঐচ্ছিক)', 'Feedback (optional)')}</Label>
                  <Textarea
                    id="feedback"
                    rows={2}
                    value={draft.feedback}
                    onChange={(e) => setDraft({ ...draft, feedback: e.target.value })}
                    placeholder={tx('ভালো করেছে — বর্ণনা আরও ঝকঝকে হলে ভালো হতো।', 'Good work — clearer descriptions next time.')}
                  />
                </div>
              </div>

              {/* toolbar */}
              <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 p-3">
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <Switch checked={penOn} onCheckedChange={setPenOn} aria-label={tx('কলম মোড', 'Pen mode')} />
                  <PenLine className="h-3.5 w-3.5" />
                  {tx('কলম', 'Pen')}
                </label>
                <div className="flex items-center gap-1.5" role="group" aria-label={tx('কলমের রং', 'Pen color')}>
                  {PEN_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`pen ${c}`}
                      onClick={() => setColor(c)}
                      className={cn(
                        'h-6 w-6 rounded-full border-2 transition-transform',
                        color === c ? 'scale-110 border-foreground' : 'border-transparent'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1" role="group" aria-label={tx('কলমের মাপ', 'Pen width')}>
                  {PEN_WIDTHS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWidth(w)}
                      aria-label={`width ${w}`}
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-lg border text-[10px] font-bold',
                        width === w ? 'border-foreground bg-foreground/10' : 'border-border'
                      )}
                    >
                      {w}
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={!currentSheet || currentSheet.annotations.length === 0}
                  onClick={() => currentSheet && updateSheet(currentSheet.id, { annotations: currentSheet.annotations.slice(0, -1) })}
                >
                  <Undo2 className="h-3.5 w-3.5" /> {tx('আনডু', 'Undo')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={!currentSheet || currentSheet.annotations.length === 0}
                  onClick={() => currentSheet && updateSheet(currentSheet.id, { annotations: [] })}
                >
                  <Eraser className="h-3.5 w-3.5" /> {tx('মুছুন', 'Clear')}
                </Button>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label={tx('আগের পাতা', 'Previous sheet')}
                    disabled={sheetIdx === 0}
                    onClick={() => setSheetIdx((i) => Math.max(0, i - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-semibold">
                    {tx(`পাতা ${sheetIdx + 1}/${draft.sheets.length || 1}`, `Sheet ${sheetIdx + 1}/${draft.sheets.length || 1}`)}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label={tx('পরের পাতা', 'Next sheet')}
                    disabled={sheetIdx >= draft.sheets.length - 1}
                    onClick={() => setSheetIdx((i) => Math.min(draft.sheets.length - 1, i + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* current sheet */}
              {currentSheet ? (
                <div className="space-y-3">
                  <div className="max-h-[55vh] overflow-y-auto rounded-xl border p-2">
                    <AnnotatedImage
                      src={currentSheet.imageUrl}
                      alt={tx(`উত্তরপত্র পাতা ${sheetIdx + 1}`, `Answer sheet ${sheetIdx + 1}`)}
                      strokes={currentSheet.annotations}
                      editable={penOn}
                      color={color}
                      width={width}
                      onChange={(next) => updateSheet(currentSheet.id, { annotations: next })}
                      imgClassName="mx-auto max-w-full"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="grid w-36 gap-1.5">
                      <Label htmlFor="sheet-marks">{tx('এই পাতার নম্বর', 'Marks for this sheet')}</Label>
                      <Input
                        id="sheet-marks"
                        type="number"
                        min={0}
                        value={currentSheet.marks ?? ''}
                        onChange={(e) =>
                          updateSheet(currentSheet.id, {
                            marks: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    {/* thumbnails */}
                    {draft.sheets.length > 1 && (
                      <div className="flex flex-1 flex-wrap gap-2">
                        {draft.sheets.map((sh, i) => (
                          <button
                            key={sh.id}
                            type="button"
                            onClick={() => setSheetIdx(i)}
                            aria-label={tx(`পাতা ${i + 1}`, `Sheet ${i + 1}`)}
                            className={cn(
                              'h-16 w-12 overflow-hidden rounded-md border-2 transition-all',
                              i === sheetIdx ? 'border-primary shadow-md' : 'border-transparent opacity-70 hover:opacity-100'
                            )}
                          >
                            { }
                            <img src={sh.imageUrl} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : grading.legacyScriptUrl ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {tx('পুরোনো একক-ফাইল জমা (শুধু দেখা যাবে)।', 'Legacy single-file submission (view only).')}
                  </p>
                  <div className="max-h-[55vh] overflow-y-auto rounded-xl border p-2">
                    { }
                    <img src={grading.legacyScriptUrl} alt={grading.legacyScriptName ?? 'script'} className="mx-auto w-full rounded-lg" />
                  </div>
                </div>
              ) : (
                <EmptyState icon={<FileCheck2 className="h-7 w-7" aria-hidden />} title={tx('কোনো ছবি নেই', 'No sheets')} description="" />
              )}

              {/* footer */}
              <div className="flex items-center justify-between gap-3 border-t pt-3">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {tx(
                    `সময় নিয়েছে ${Math.floor(grading.timeTaken / 60)} মি ${grading.timeTaken % 60} সে`,
                    `Time taken ${Math.floor(grading.timeTaken / 60)}m ${grading.timeTaken % 60}s`
                  )}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setGrading(null)}>
                    {t('cancel')}
                  </Button>
                  <Button onClick={() => void saveGrading()} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {tx('সেভ করুন', 'Save')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── result sheet (per-student subject rows + auto grade/GPA) ── */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              {tx('রেজাল্ট শিট', 'Result sheet')} {quizInfo ? `— ${quizInfo.title}` : ''}
            </DialogTitle>
            <DialogDescription>
              {tx(
                'নম্বর অনুযায়ী অটো গ্রেড (ক্লাস ৯-১২: বোর্ড স্কেল · সম্মান: জাতীয় বিশ্ববিদ্যালয় স্কেল)।',
                'Auto-graded from marks (Class 9-12: board scale · Honours: National University scale).'
              )}
            </DialogDescription>
          </DialogHeader>
          {sheetGroups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {tx('কোনো গ্রেডযোগ্য জমা নেই।', 'Nothing to show yet.')}
            </p>
          ) : (
            <div className="space-y-3">
              {sheetGroups.map((g) => (
                <div key={g.name} className="overflow-hidden rounded-xl border">
                  <div className="flex items-center gap-2.5 border-b bg-muted/30 px-3 py-2">
                    <Avatar className="h-7 w-7">
                      {g.avatarUrl && <AvatarImage src={g.avatarUrl} alt={g.name} />}
                      <AvatarFallback className="text-[10px] font-bold">
                        {g.name.trim().slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm font-bold">{g.name}</span>
                    {g.gpaAvg !== null && (
                      <Badge className="ml-auto border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        GPA {g.gpaAvg.toFixed(2)}
                      </Badge>
                    )}
                  </div>
                  <div className="divide-y">
                    {g.graded.map(({ s, info }) => (
                      <div key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {s.subjectName ?? (s.mcqTotal != null ? 'MCQ' : 'CQ')}
                        </span>
                        <span className="tabular-nums font-bold">
                          {obtainedOf(s) ?? '—'}
                          {s.fullMarks ? ` / ${s.fullMarks}` : ''}
                        </span>
                        {info ? (
                          <Badge
                            variant={info.grade === 'F' ? 'destructive' : 'secondary'}
                            className="tabular-nums"
                          >
                            {info.grade} · {info.gpa.toFixed(2)}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{tx('নম্বর বাকি', 'no marks')}</Badge>
                        )}
                        {s.isPublished && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

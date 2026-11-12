'use client'

/**
 * Student Results — published exam results, grouped per batch.
 * Each exam card shows the overall marks + GPA and one row per subject
 * (honours) or part (class MCQ/CQ) with its own letter grade — every grade
 * is the server-side auto-grade snapshot (board scale for 9-12, National
 * University scale for honours). Expanding a row reveals the marked answer
 * sheets (the admin's red-pen markings) so the student sees exactly what
 * was right and where marks were lost.
 */
import { useCallback, useEffect, useState } from 'react'
import { Award, BookOpen, CalendarDays, ChevronDown, Clock, FileText, RefreshCw, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import AnnotatedImage, { type PenStroke } from '@/components/shared/annotated-image'
import { apiGet } from '@/lib/api-client'
import { useUI } from '@/store/ui-store'
import { cn } from '@/lib/utils'

interface ResultSheet {
  id: string
  imageUrl: string
  order: number
  marks: number | null
  annotations: PenStroke[]
}

interface ResultRow {
  attemptId: string
  subjectName: string | null
  examDate: string | null
  obtained: number
  full: number | null
  grade: string | null
  gpa: number | null
  feedback: string | null
  publishedAt: string
  sheets: ResultSheet[]
  legacyScriptUrl: string | null
  legacyScriptName: string | null
}

interface GroupedResult {
  quizId: string
  quizTitle: string
  level: string
  paperKind: string
  durationMin: number
  publishedAt?: string
  rows: ResultRow[]
  overall: { obtained: number; full: number; gpa: number | null; allPublished: boolean }
}

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

const gradeBadge = (grade: string | null, gpa: number | null) => {
  if (!grade) return null
  const fail = grade === 'F'
  return (
    <Badge
      className={cn(
        'border-transparent tabular-nums',
        fail
          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
      )}
    >
      {grade}
      {gpa != null ? ` · ${gpa.toFixed(2)}` : ''}
    </Badge>
  )
}

export default function ResultsView() {
  const { t, tx } = useUI()
  const [results, setResults] = useState<GroupedResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openBatch, setOpenBatch] = useState<string | null>(null)
  const [openRows, setOpenRows] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet<{ results: GroupedResult[] }>('/api/my-exam-results')
      setResults(data.results ?? [])
    } catch {
      setError(tx('রেজাল্ট লোড করা যায়নি।', 'Could not load your results.'))
    } finally {
      setLoading(false)
    }
  }, [tx])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <span className="grad-amber flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md shadow-amber-500/25">
              <Trophy className="h-5 w-5" />
            </span>
            {t('results')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tx(
              'প্রকাশিত রেজাল্ট — নম্বর, গ্রেড, GPA এবং আপনার মার্ক করা উত্তরপত্র এখানে দেখুন।',
              'Published results — marks, grades, GPA and your marked answer sheets live here.'
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> {t('refresh')}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={<Award className="h-7 w-7" aria-hidden />} title={t('error')} description={error} actionLabel={t('retry')} onAction={() => void load()} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-7 w-7" aria-hidden />}
          title={tx('এখনো কোনো প্রকাশিত রেজাল্ট নেই', 'No published results yet')}
          description={tx(
            'পরীক্ষায় অংশ নেওয়ার পর অ্যাডমিন রেজাল্ট প্রকাশ করলেই এখানে দেখতে পাবেন — নম্বর, গ্রেড ও মার্ক করা উত্তরপত্রসহ।',
            'Once the admin publishes a result after your exam, it appears here — with marks, grades and your marked answer sheets.'
          )}
        />
      ) : (
        <div className="space-y-4">
          {results.map((r) => {
            const open = openBatch === r.quizId
            const isHonours = r.level === 'HONOURS'
            return (
              <div key={r.quizId} className="overflow-hidden rounded-2xl border bg-card">
                {/* ── Batch header + overall sheet ── */}
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <span className="grad-amber flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl text-base font-extrabold leading-none text-white shadow-md shadow-amber-500/25">
                      {r.overall.gpa != null ? r.overall.gpa.toFixed(2) : (r.overall.obtained || '—')}
                      {r.overall.gpa != null && (
                        <span className="mt-0.5 text-[9px] font-semibold uppercase opacity-90">GPA</span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-bold">{r.quizTitle}</h2>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {r.publishedAt && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {fmtDate(r.publishedAt)}
                          </span>
                        )}
                        <span>
                          {tx(
                            `${isHonours ? 'জাতীয় বিশ্ববিদ্যালয়' : 'বোর্ড'} গ্রেডিং`,
                            isHonours ? 'NU grading' : 'Board grading'
                          )}
                        </span>
                        {r.overall.full > 0 && (
                          <span className="font-medium text-foreground">
                            {tx(
                              `মোট প্রাপ্ত ${r.overall.obtained}/${r.overall.full}`,
                              `Total ${r.overall.obtained}/${r.overall.full}`
                            )}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5 self-start sm:self-auto"
                    aria-expanded={open}
                    onClick={() => setOpenBatch(open ? null : r.quizId)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {tx('বিস্তারিত দেখুন', 'View details')}
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
                  </Button>
                </div>

                {open && (
                  <div className="space-y-4 border-t bg-muted/20 p-4 sm:p-5">
                    {!r.overall.allPublished && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                        {tx(
                          'কিছু বিষয়ের রেজাল্ট এখনো প্রকাশিত হয়নি — প্রকাশ হলে এখানে যোগ হবে।',
                          'Some subjects are not published yet — they will appear here once released.'
                        )}
                      </div>
                    )}

                    {/* ── One row per subject / part ── */}
                    <div className="space-y-3">
                      {r.rows.map((row) => {
                        const sheets =
                          row.sheets.length > 0
                            ? row.sheets
                            : row.legacyScriptUrl
                              ? [
                                  {
                                    id: `${row.attemptId}-legacy`,
                                    imageUrl: row.legacyScriptUrl,
                                    order: 0,
                                    marks: null,
                                    annotations: [] as PenStroke[],
                                  },
                                ]
                              : []
                        const rowOpen = openRows.has(row.attemptId)
                        return (
                          <div key={row.attemptId} className="overflow-hidden rounded-xl border bg-card">
                            <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                  <BookOpen className="h-4 w-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-bold">
                                    {row.subjectName ?? (r.paperKind === 'MCQ' ? 'MCQ' : tx('সৃজনশীল', 'CQ'))}
                                  </p>
                                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                                    {row.examDate && (
                                      <span className="inline-flex items-center gap-1">
                                        <CalendarDays className="h-3 w-3" /> {fmtDate(row.examDate)}
                                      </span>
                                    )}
                                    {row.full != null && row.full > 0 && (
                                      <span className="tabular-nums font-semibold text-foreground">
                                        {row.obtained}/{row.full}
                                      </span>
                                    )}
                                    {row.publishedAt && <span>{fmtDate(row.publishedAt)}</span>}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:justify-end">
                                {gradeBadge(row.grade, row.gpa)}
                                {sheets.length > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5"
                                    aria-expanded={rowOpen}
                                    onClick={() =>
                                      setOpenRows((prev) => {
                                        const next = new Set(prev)
                                        if (next.has(row.attemptId)) next.delete(row.attemptId)
                                        else next.add(row.attemptId)
                                        return next
                                      })
                                    }
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                    {tx('খাতা দেখুন', 'View sheets')}
                                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', rowOpen && 'rotate-180')} />
                                  </Button>
                                )}
                              </div>
                            </div>

                            {rowOpen && (
                              <div className="space-y-4 border-t bg-muted/20 p-4">
                                {row.feedback && (
                                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                                    <p className="font-semibold text-amber-800 dark:text-amber-300">
                                      {tx('শিক্ষকের মন্তব্য', "Teacher's feedback")}
                                    </p>
                                    <p className="mt-0.5 text-amber-800/85 dark:text-amber-300/85">{row.feedback}</p>
                                  </div>
                                )}
                                <p className="text-xs font-semibold text-muted-foreground">
                                  {tx(
                                    `${sheets.length}টি উত্তরপত্রের ছবি — লাল কলমের মার্কিং অ্যাডমিনের।`,
                                    `${sheets.length} answer sheet(s) — red-pen markings by the admin.`
                                  )}
                                </p>
                                <div className="grid gap-5 lg:grid-cols-2">
                                  {sheets.map((s, i) => (
                                    <div key={s.id} className="space-y-1.5">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-bold">
                                          {tx(`পাতা ${i + 1}`, `Sheet ${i + 1}`)}
                                        </span>
                                        {s.marks !== null && s.marks !== undefined && (
                                          <Badge variant="secondary">
                                            {tx(`নম্বর ${s.marks}`, `Marks ${s.marks}`)}
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="max-h-[70vh] overflow-y-auto rounded-xl border bg-card p-2">
                                        <AnnotatedImage
                                          src={s.imageUrl}
                                          alt={tx(`উত্তরপত্র পাতা ${i + 1}`, `Answer sheet ${i + 1}`)}
                                          strokes={s.annotations ?? []}
                                          imgClassName="mx-auto max-w-full"
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

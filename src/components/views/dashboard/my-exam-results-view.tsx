'use client'

/**
 * MyExamResultsView — /dashboard/exam-results — the student's published
 * written-exam results. "View Answer Sheet" opens the evaluated sheets:
 * teacher annotations (separate layer), marks, grade and written feedback.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Award, Eye, RefreshCcw, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeading } from '@/components/shared/section-heading'
import { useUI, go } from '@/store/ui-store'
import { apiGet } from '@/lib/api-client'
import { digitsBn, fmtDate } from '@/lib/format'
import { ImageViewer } from '@/components/exams/image-viewer'

interface ResultRow {
  id: string
  examId: string
  examTitle: string
  categoryName: string | null
  subjectName: string | null
  totalMarks: number
  examTotalMarks: number
  obtainedMarks: number | null
  percentage: number | null
  grade: string | null
  feedback: string | null
  submittedAt: string | null
  publishedAt: string | null
}

interface ResultDetail {
  attempt: {
    id: string
    status: string
    totalMarks: number
    obtainedMarks: number | null
    percentage: number | null
    grade: string | null
    feedback: string | null
    submittedAt: string | null
  }
  exam: { id: string; title: string; categoryName: string | null; subjectName: string | null }
  images: { id: string; order: number; url: string; annotatedUrl: string | null }[]
}

function gradeColor(grade: string | null): string {
  if (!grade) return ''
  if (grade === 'A+') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
  if (grade === 'A') return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
  if (grade === 'A-') return 'bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-200'
  if (grade === 'B') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
  if (grade === 'C') return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200'
  if (grade === 'D') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'
  return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
}

export default function MyExamResultsView() {
  const { tx, lang } = useUI()
  const [results, setResults] = useState<ResultRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<ResultDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)
  const [viewerOpen, setViewerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<{ results: ResultRow[] }>('/api/my-exam-results')
      setResults(data.results ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [tx])

  useEffect(() => {
    void load()
  }, [load])

  async function openSheets(id: string) {
    setDetailLoading(true)
    try {
      // the evaluated-sheets payload lives on the owner-scoped attempt API
      const d = await apiGet<ResultDetail>(`/api/exam-attempts/${id}`)
      setDetail(d)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setDetailLoading(false)
    }
  }

  const viewerImages = useMemo(
    () =>
      (detail?.images ?? []).map((i) => ({
        id: i.id,
        url: i.annotatedUrl ?? i.url,
        label: `${tx('উত্তরপত্র', 'Answer sheet')} ${digitsBn(i.order + 1)}`,
      })),
    [detail, tx]
  )

  const num = (n: number | string) => (lang === 'bn' ? digitsBn(n) : String(n))

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <SectionHeading
        title={tx('আমার ফলাফল', 'My Results')}
        subtitle={tx(
          'প্রকাশিত ফলাফল ও শিক্ষকের মূল্যায়ন করা উত্তরপত্র এখানে দেখুন।',
          'Published results and teacher-evaluated answer sheets live here.'
        )}
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : !results || results.length === 0 ? (
        <EmptyState
          icon={<Award className="h-7 w-7" />}
          title={tx('এখনো কোনো ফলাফল প্রকাশ হয়নি', 'No results published yet')}
          description={tx(
            'পরীক্ষা জমা দেওয়ার পর ফলাফল প্রকাশ হলে এখানে দেখা যাবে।',
            'Results appear here once the teacher publishes them.'
          )}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {results.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: (i % 4) * 0.05 }}
            >
              <Card className="relative h-full overflow-hidden">
                <span aria-hidden className="absolute inset-x-0 top-0 h-1 grad-emerald" />
                <CardContent className="flex h-full flex-col gap-3 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 text-base font-bold leading-snug">{r.examTitle}</h3>
                    {r.grade && (
                      <Badge className={`border-transparent ${gradeColor(r.grade)}`}>{r.grade}</Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {r.categoryName && <Badge variant="outline">{r.categoryName}</Badge>}
                    {r.subjectName && <Badge variant="outline">{r.subjectName}</Badge>}
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/30 p-2.5 text-center">
                    <div>
                      <p className="text-[10px] font-medium uppercase text-muted-foreground">{tx('প্রাপ্ত', 'Obtained')}</p>
                      <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        {num(r.obtainedMarks ?? 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase text-muted-foreground">{tx('মোট', 'Total')}</p>
                      <p className="text-lg font-bold">{num(r.totalMarks)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase text-muted-foreground">{tx('শতকরা', 'Percent')}</p>
                      <p className="text-lg font-bold">{r.percentage != null ? `${num(r.percentage)}%` : '—'}</p>
                    </div>
                  </div>

                  {r.publishedAt && (
                    <p className="text-xs text-muted-foreground">
                      {tx('প্রকাশের তারিখ', 'Published')}: {fmtDate(r.publishedAt)}
                    </p>
                  )}

                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void openSheets(r.id)}>
                      <Eye className="h-3.5 w-3.5" /> {tx('উত্তরপত্র দেখুন', 'View answer sheet')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <div className="flex justify-center">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => void load()}>
          <RefreshCcw className="h-3.5 w-3.5" /> {tx('রিফ্রেশ', 'Refresh')}
        </Button>
      </div>

      {/* evaluated sheets dialog */}
      <Dialog open={Boolean(detail) || detailLoading} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[94vh] max-w-3xl overflow-y-auto">
          {detailLoading || !detail ? (
            <>
              <DialogTitle className="sr-only">{tx('উত্তরপত্র লোড হচ্ছে', 'Loading sheets')}</DialogTitle>
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{detail.exam.title}</DialogTitle>
                <DialogDescription>
                  {detail.attempt.obtainedMarks != null && (
                    <>
                      {tx('প্রাপ্ত নম্বর', 'Obtained')}: {num(detail.attempt.obtainedMarks)}/
                      {num(detail.attempt.totalMarks)}
                      {detail.attempt.grade ? ` · ${detail.attempt.grade}` : ''}
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>

              {detail.attempt.feedback && (
                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="mb-1 text-sm font-semibold">{tx('শিক্ষকের মন্তব্য', 'Teacher feedback')}</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{detail.attempt.feedback}</p>
                </div>
              )}

              <p className="text-sm font-semibold">{tx('মূল্যায়িত উত্তরপত্র', 'Evaluated answer sheets')}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {detail.images.map((img, idx) => (
                  <button
                    key={img.id}
                    type="button"
                    className="group relative overflow-hidden rounded-xl border"
                    onClick={() => {
                      setViewerIndex(idx)
                      setViewerOpen(true)
                    }}
                    aria-label={`${tx('উত্তরপত্র', 'Answer sheet')} ${idx + 1}`}
                  >
                    { }
                    <img
                      src={img.annotatedUrl ?? img.url}
                      alt={`answer-${idx + 1}`}
                      loading="lazy"
                      className="aspect-[3/4] w-full bg-white object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                      <ZoomIn className="h-5 w-5" />
                    </span>
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {num(idx + 1)}
                    </span>
                    {img.annotatedUrl && (
                      <span className="absolute right-1 top-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {tx(
                  'লাল/সবুজ দাগ শিক্ষকের মার্কিং — মূল উত্তরপত্র অক্ষত আছে।',
                  'Red/green marks are the teacher annotations — your original sheet is preserved.'
                )}
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ImageViewer
        images={viewerImages}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  )
}

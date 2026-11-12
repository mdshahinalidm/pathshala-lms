'use client'

/**
 * WrittenResultDetailView — one published result (spec #19/#20).
 * Header (marks/percentage/feedback) + every answer sheet in a read-only
 * viewer: the ORIGINAL uploaded photo + the teacher's annotation layer
 * (✓/✗/circle/underline/arrow/notes) rendered as a separate overlay — the
 * original file is always preserved untouched.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ImageIcon, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AnswerSheetViewer, type ViewerImage } from '@/components/admin/answer-sheet-viewer'
import { useUI } from '@/store/ui-store'
import { apiGet } from '@/lib/api-client'
import { digitsBn, fmtDateTime } from '@/lib/format'
import { parseStrokes } from '@/lib/exam-annotations'

interface Detail {
  submission: {
    id: string; submittedAt: string; publishedAt: string | null; markedAt: string | null
    reviewStatus: string; obtainedMarks: number | null; totalMarks: number; percentage: number | null; feedback: string | null
  }
  exam: {
    id: string; title: string; totalMarks: number
    course: { id: string; title: string } | null
    category: { id: string; name: string } | null
    subject: { id: string; name: string; nameEn: string | null } | null
  }
  student: { id: string; name: string }
  images: { id: string; url: string; originalName: string; order: number; strokes: unknown; annotatedAt: string | null }[]
}

export default function WrittenResultDetailView({ submissionId }: { submissionId: string }) {
  const { tx, lang } = useUI()
  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewerIdx, setViewerIdx] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await apiGet<Detail>(`/api/exams/results/${submissionId}`)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }, [submissionId])

  useEffect(() => {
    void load()
  }, [load])

  const viewerImages: ViewerImage[] = useMemo(
    () =>
      data
        ? data.images.map((im) => ({
            id: im.id,
            url: im.url,
            strokes: parseStrokes(im.strokes),
            annotatedAt: im.annotatedAt,
            originalName: im.originalName,
          }))
        : [],
    [data]
  )

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <Trophy className="h-8 w-8 text-muted-foreground" />
          <p className="font-semibold">{tx('রেজাল্ট পাওয়া যায়নি', 'Result not found')}</p>
          <p className="text-sm text-muted-foreground">{tx('রেজাল্টটি হয়তো এখনো প্রকাশিত হয়নি।', 'This result may not be published yet.')}</p>
          <Button variant="outline" asChild><Link href="/dashboard/results">{tx('ফিরে যান', 'Back')}</Link></Button>
        </CardContent>
      </Card>
    )
  }

  const s = data.submission

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => window.history.back()}>
        <ArrowLeft className="h-4 w-4" />{tx('রেজাল্ট', 'Results')}
      </Button>

      {/* marks header */}
      <Card className="overflow-hidden">
        <div className="grad-brand p-5 text-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-white/75">{tx('পরীক্ষার রেজাল্ট', 'Exam result')}</p>
              <h1 className="mt-1 text-xl font-extrabold leading-snug sm:text-2xl">{data.exam.title}</h1>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.exam.course && <Badge className="border-0 bg-white/20 text-white hover:bg-white/20">{data.exam.course.title}</Badge>}
                {data.exam.subject && <Badge className="border-0 bg-white/20 text-white hover:bg-white/20">{data.exam.subject.nameEn || data.exam.subject.name}</Badge>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black tabular-nums leading-none sm:text-4xl">
                {s.obtainedMarks != null ? digitsBn(s.obtainedMarks) : '—'}
                <span className="text-lg font-bold text-white/75"> / {digitsBn(s.totalMarks)}</span>
              </p>
              {s.percentage != null && (
                <p className="mt-1 text-sm font-bold text-white/90">{lang === 'bn' ? digitsBn(s.percentage) : s.percentage}%</p>
              )}
              {s.publishedAt && <p className="mt-1 text-[11px] text-white/70">{tx('প্রকাশ', 'Published')}: {fmtDateTime(s.publishedAt, lang)}</p>}
            </div>
          </div>
        </div>
        {s.feedback && (
          <CardContent className="p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{tx('শিক্ষকের মন্তব্য', "Teacher's feedback")}</p>
            <p className="mt-1.5 whitespace-pre-wrap rounded-xl border bg-muted/30 p-3.5 text-sm leading-relaxed">{s.feedback}</p>
          </CardContent>
        )}
      </Card>

      {/* evaluated sheets */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <ImageIcon className="h-4 w-4 text-primary" />
              {tx('মূল্যায়িত উত্তরপত্র', 'Evaluated answer sheets')} ({digitsBn(data.images.length)})
            </h2>
            <p className="text-xs text-muted-foreground">{tx('ছবিতে ক্লিক করে বড় করে দেখুন', 'Click a sheet to view it large')}</p>
          </div>
          {data.images.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{tx('কোনো ছবি নেই', 'No images')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {data.images.map((im, i) => (
                <button
                  key={im.id}
                  type="button"
                  onClick={() => setViewerIdx(i)}
                  className="group relative overflow-hidden rounded-xl border transition hover:ring-2 hover:ring-primary/50"
                  aria-label={`উত্তরপত্র ${i + 1}`}
                >
                  { }
                  <img src={im.url} alt={`উত্তরপত্র ${i + 1}`} loading="lazy" className="aspect-[3/4] w-full bg-muted object-cover" />
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{digitsBn(i + 1)}</span>
                  {im.annotatedAt && <Badge className="absolute right-1.5 top-1.5 border-0 bg-emerald-600 px-1.5 py-0.5 text-[9px] text-white">{tx('মার্কড', 'Marked')}</Badge>}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {viewerIdx != null && (
        <AnswerSheetViewer
          images={viewerImages}
          index={viewerIdx}
          onIndexChange={setViewerIdx}
          onClose={() => setViewerIdx(null)}
          title={data.exam.title}
        />
      )}
    </div>
  )
}

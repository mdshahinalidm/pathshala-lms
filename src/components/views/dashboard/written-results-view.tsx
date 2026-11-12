'use client'

/**
 * WrittenResultsView — student "রেজাল্ট" (My Results, spec #18).
 * Every PUBLISHED written-exam result: marks, percentage, publish date.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Eye, RefreshCw, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { useUI } from '@/store/ui-store'
import { apiGet } from '@/lib/api-client'
import { digitsBn, fmtDateTime } from '@/lib/format'

interface ResultRow {
  id: string
  submittedAt: string
  publishedAt: string | null
  obtainedMarks: number
  totalMarks: number
  percentage: number | null
  feedback: string | null
  exam: { id: string; title: string; courseTitle: string | null; categoryName: string | null; subjectName: string | null }
}

export default function WrittenResultsView() {
  const { tx, lang } = useUI()
  const [rows, setRows] = useState<ResultRow[] | null>(null)
  const [error, setError] = useState(false)
  const [nonce, setNonce] = useState(0)

  const load = useCallback(async () => {
    setError(false)
    try {
      const data = await apiGet<{ results: ResultRow[] }>('/api/exams/results')
      setRows(data.results ?? [])
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load, nonce])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight sm:text-2xl">
            <Trophy className="h-6 w-6 text-primary" aria-hidden />
            {tx('রেজাল্ট', 'My Results')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {tx('প্রকাশিত লিখিত পরীক্ষার ফলাফল — মূল্যায়িত উত্তরপত্রসহ দেখুন।', 'Published written-exam results — with evaluated answer sheets.')}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw className="h-3.5 w-3.5" />{tx('রিফ্রেশ', 'Refresh')}
        </Button>
      </div>

      {error ? (
        <EmptyState icon={<Trophy className="h-7 w-7" aria-hidden />} title={tx('সমস্যা হয়েছে', 'Something went wrong')} description={tx('রেজাল্ট লোড করা যায়নি।', 'Could not load results.')} actionLabel={tx('আবার চেষ্টা', 'Retry')} onAction={() => setNonce((n) => n + 1)} />
      ) : rows === null ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-7 w-7" aria-hidden />}
          title={tx('এখনো কোনো প্রকাশিত রেজাল্ট নেই', 'No published results yet')}
          description={tx('লিখিত পরীক্ষার রেজাল্ট প্রকাশ হলে এখানে দেখতে পাবেন।', 'Published written-exam results will appear here.')}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="overflow-hidden">
              <CardContent className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                <div className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl text-white ${r.percentage != null && r.percentage >= 60 ? 'grad-emerald' : 'grad-amber'}`}>
                  <span className="text-lg font-black leading-none">{r.percentage != null ? digitsBn(r.percentage) : '—'}</span>
                  <span className="text-[10px] font-bold">%</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-bold">{r.exam.title}</h2>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {r.exam.courseTitle && <Badge variant="outline" className="max-w-[160px] truncate text-[11px]">{r.exam.courseTitle}</Badge>}
                    {r.exam.subjectName && <Badge variant="secondary" className="text-[11px]">{r.exam.subjectName}</Badge>}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {tx('প্রকাশ', 'Published')}: {fmtDateTime(r.publishedAt ?? r.submittedAt, lang)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black tabular-nums">
                    {digitsBn(r.obtainedMarks)} <span className="text-sm font-semibold text-muted-foreground">/ {digitsBn(r.totalMarks)}</span>
                  </p>
                  <Button size="sm" className="mt-1.5 gap-1.5 rounded-xl" asChild>
                    <Link href={`/dashboard/results/${r.id}`}><Eye className="h-3.5 w-3.5" />{tx('রেজাল্ট দেখুন', 'View result')}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

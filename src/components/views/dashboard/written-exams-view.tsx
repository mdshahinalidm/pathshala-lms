'use client'

/**
 * WrittenExamsView — student "লিখিত পরীক্ষা" (My Exams for written/theory).
 * Lists every visible written exam with the student's state:
 * ফ্রি → শুরু করুন · পেইড → কিনুন/চেকআউট · চলমান → চালিয়ে যান ·
 * জমা → অপেক্ষা · প্রকাশিত রেজাল্ট → দেখুন.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  BookOpenCheck, Clock, FileText, Lock, LogIn, PenLine, RefreshCw,
  Trophy, Unlock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { useUI } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet } from '@/lib/api-client'
import { digitsBn, fmtBDT } from '@/lib/format'

interface WrittenExamItem {
  id: string
  title: string
  description: string | null
  courseTitle: string | null
  categoryName: string | null
  subjectName: string | null
  totalMarks: number
  durationMin: number
  price: number
  hasQuestion: boolean
  purchased: boolean
  myAttempt: { id: string; status: string; endsAt: string } | null
  mySubmission: { id: string; reviewStatus: string; obtainedMarks: number | null } | null
}

const TONES = ['grad-violet', 'grad-emerald', 'grad-amber', 'grad-rose', 'grad-cyan', 'grad-orange']

export default function WrittenExamsView() {
  const { tx } = useUI()
  const { user, initialized } = useAuth()
  const [exams, setExams] = useState<WrittenExamItem[] | null>(null)
  const [error, setError] = useState(false)
  const [nonce, setNonce] = useState(0)

  const load = useCallback(async () => {
    setError(false)
    try {
      const data = await apiGet<WrittenExamItem[]>('/api/exams?scope=mine')
      setExams(Array.isArray(data) ? data : [])
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load, nonce])

  if (initialized && !user) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Lock className="h-8 w-8" />
        </span>
        <h1 className="text-lg font-bold">{tx('লগইন করুন', 'Please log in')}</h1>
        <p className="text-sm text-muted-foreground">{tx('লিখিত পরীক্ষায় অংশ নিতে লগইন করুন।', 'Log in to take written exams.')}</p>
        <Button asChild className="gap-2">
          <Link href="/login?next=/dashboard/written-exams"><LogIn className="h-4 w-4" />{tx('লগইন', 'Login')}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight sm:text-2xl">
            <PenLine className="h-6 w-6 text-primary" aria-hidden />
            {tx('লিখিত পরীক্ষা', 'Written Exams')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {tx('খাতায় লিখে ছবি তুলে জমা দিতে হবে — রেজাল্ট মিলবে "রেজাল্ট" সেকশনে।', 'Write on paper, upload photos — results appear in the "Results" section.')}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw className="h-3.5 w-3.5" />{tx('রিফ্রেশ', 'Refresh')}
        </Button>
      </div>

      {error ? (
        <EmptyState
          icon={<PenLine className="h-7 w-7" aria-hidden />}
          title={tx('সমস্যা হয়েছে', 'Something went wrong')}
          description={tx('পরীক্ষা লোড করা যায়নি — আবার চেষ্টা করুন।', 'Could not load exams — please retry.')}
          actionLabel={tx('আবার চেষ্টা', 'Retry')}
          onAction={() => setNonce((n) => n + 1)}
        />
      ) : exams === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : exams.length === 0 ? (
        <EmptyState
          icon={<PenLine className="h-7 w-7" aria-hidden />}
          title={tx('এখনো কোনো লিখিত পরীক্ষা নেই', 'No written exams yet')}
          description={tx('নতুন পরীক্ষা প্রকাশ হলেই এখানে দেখতে পাবেন।', 'New exams will appear here as soon as they are published.')}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {exams.map((e, i) => (
            <ExamCard key={e.id} exam={e} tone={TONES[i % TONES.length]} />
          ))}
        </div>
      )}
    </div>
  )
}

function ExamCard({ exam, tone }: { exam: WrittenExamItem; tone: string }) {
  const { tx, lang } = useUI()
  const submitted = exam.mySubmission && exam.myAttempt?.status !== 'IN_PROGRESS'
  const inProgress = exam.myAttempt?.status === 'IN_PROGRESS' && new Date(exam.myAttempt.endsAt).getTime() > Date.now()
  const needsBuy = exam.price > 0 && !exam.purchased

  const statusChip = (() => {
    if (exam.mySubmission?.reviewStatus === 'PUBLISHED')
      return <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600"><Trophy className="h-3 w-3" />{tx('রেজাল্ট প্রকাশিত', 'Result published')}</Badge>
    if (submitted) return <Badge variant="secondary">{tx('জমা হয়েছে — মূল্যায়ন চলছে', 'Submitted — under evaluation')}</Badge>
    if (inProgress) return <Badge className="gap-1 bg-amber-500 hover:bg-amber-500"><Clock className="h-3 w-3" />{tx('চলমান', 'In progress')}</Badge>
    if (needsBuy) return <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" />{fmtBDT(exam.price, lang)}</Badge>
    return <Badge variant="outline" className="gap-1"><Unlock className="h-3 w-3" />{tx('ফ্রি', 'Free')}</Badge>
  })()

  return (
    <article className="pop-hover flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className={`flex items-center justify-between gap-2 bg-gradient-to-r p-4 text-white ${tone}`}>
        <span className="flex items-center gap-2 text-sm font-bold">
          <PenLine className="h-4 w-4" aria-hidden />
          {tx('লিখিত পরীক্ষা', 'Written Exam')}
        </span>
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold backdrop-blur">
          {digitsBn(exam.totalMarks)} {tx('নম্বর', 'marks')}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug">{exam.title}</h3>
        {exam.description && <p className="line-clamp-2 text-sm text-muted-foreground">{exam.description}</p>}
        <div className="flex flex-wrap gap-1.5">
          {exam.courseTitle && <Badge variant="outline" className="max-w-[160px] truncate text-[11px]">{exam.courseTitle}</Badge>}
          {exam.categoryName && <Badge variant="secondary" className="text-[11px]">{exam.categoryName}</Badge>}
          {exam.subjectName && <Badge variant="secondary" className="text-[11px]">{exam.subjectName}</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{digitsBn(exam.durationMin)} {tx('মিনিট', 'min')}</span>
          {exam.hasQuestion && <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" aria-hidden />{tx('প্রশ্ন সংযুক্ত', 'Question attached')}</span>}
        </div>
        <div className="mt-auto space-y-2 border-t pt-3">
          {statusChip}
          {exam.mySubmission?.reviewStatus === 'PUBLISHED' ? (
            <Button asChild size="sm" className="w-full rounded-xl shadow-md">
              <Link href={`/dashboard/results/${exam.mySubmission.id}`} prefetch={false}>
                <Trophy className="h-3.5 w-3.5" aria-hidden />{tx('রেজাল্ট দেখুন', 'View result')}
              </Link>
            </Button>
          ) : inProgress ? (
            <Button asChild size="sm" className="w-full rounded-xl shadow-md">
              <Link href={`/dashboard/written-exams/${exam.id}/take`} prefetch={false}>
                <BookOpenCheck className="h-3.5 w-3.5" aria-hidden />{tx('চালিয়ে যান', 'Continue exam')}
              </Link>
            </Button>
          ) : submitted ? (
            <Button asChild size="sm" variant="outline" className="w-full rounded-xl">
              <Link href={`/dashboard/written-exams/${exam.id}`} prefetch={false}>
                <FileText className="h-3.5 w-3.5" aria-hidden />{tx('বিস্তারিত দেখুন', 'Details')}
              </Link>
            </Button>
          ) : needsBuy ? (
            <Button asChild size="sm" className="w-full rounded-xl shadow-md">
              <Link href={`/checkout/exam/${exam.id}`} prefetch={false}>
                <Lock className="h-3.5 w-3.5" aria-hidden />{tx('কিনে অংশ নিন', 'Buy & participate')}
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" className="w-full rounded-xl shadow-md">
              <Link href={`/dashboard/written-exams/${exam.id}`} prefetch={false}>
                <BookOpenCheck className="h-3.5 w-3.5" aria-hidden />{tx('পরীক্ষা শুরু করুন', 'Start exam')}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

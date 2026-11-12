'use client'

/**
 * Public QuestionsView — /questions
 * Recent questions (from exams not yet taken) + Archive section
 * (questions of exams that already happened — correct answers revealed).
 */

import { useEffect, useState } from 'react'
import { Archive, BookOpen, Clock, FileQuestion, GraduationCap, HelpCircle, Lock, Unlock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeading } from '@/components/shared/section-heading'
import { useUI } from '@/store/ui-store'
import { apiGet } from '@/lib/api-client'

interface QuestionItem {
  id: string
  text: string
  options: string[]
  correctIndex?: number
  archived: boolean
  quiz: { id: string; title: string; type: 'QUIZ' | 'EXAM'; durationMin: number }
  courseTitle: string | null
  courseSlug: string | null
  categoryName: string | null
}

const OPTION_KEYS = ['ক', 'খ', 'গ', 'ঘ']

function QuestionCard({ q }: { q: QuestionItem }) {
  const { tx } = useUI()
  return (
    <article className="pop-hover flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition-all duration-300 hover:shadow-md">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {q.archived ? (
          <Badge className="border border-slate-500/25 bg-slate-500/10 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            <Archive className="mr-1 h-3 w-3" aria-hidden />
            {tx('আর্কাইভ', 'Archive')}
          </Badge>
        ) : (
          <Badge className="border border-emerald-500/25 bg-emerald-500/10 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            <span aria-hidden className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            {tx('সাম্প্রতিক', 'Recent')}
          </Badge>
        )}
        {q.categoryName && (
          <Badge variant="outline" className="border-violet-500/25 bg-violet-500/10 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
            <GraduationCap className="mr-1 h-3 w-3" aria-hidden />
            {q.categoryName}
          </Badge>
        )}
        {q.courseTitle && (
          <Badge variant="outline" className="border-amber-500/25 bg-amber-500/10 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            <BookOpen className="mr-1 h-3 w-3" aria-hidden />
            {q.courseTitle}
          </Badge>
        )}
      </div>

      <h3 className="text-sm font-semibold leading-relaxed">{q.text}</h3>

      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {q.options.map((opt, i) => {
          const isCorrect = q.archived && q.correctIndex === i
          return (
            <li
              key={i}
              className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                isCorrect
                  ? 'border-emerald-500/40 bg-emerald-500/10 font-semibold text-emerald-800 dark:text-emerald-300'
                  : 'bg-muted/40 text-foreground/80'
              }`}
            >
              <span aria-hidden className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                {OPTION_KEYS[i] ?? i + 1}
              </span>
              <span className="min-w-0 break-words">{opt}</span>
              {isCorrect && (
                <span className="ml-auto shrink-0 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  ✓ {tx('সঠিক', 'Correct')}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2.5 text-[11px] text-muted-foreground mt-3">
        <span className="inline-flex items-center gap-1 font-medium">
          {q.archived ? <Unlock className="h-3 w-3" aria-hidden /> : <Lock className="h-3 w-3" aria-hidden />}
          {q.quiz.title}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden /> {q.quiz.durationMin} {tx('মিনিট', 'min')}
        </span>
        {!q.archived && (
          <span className="text-emerald-600 dark:text-emerald-400">
            {tx('উত্তর পরীক্ষার পর প্রকাশ হবে', 'Answer reveals after the exam')}
          </span>
        )}
      </div>
    </article>
  )
}

function CardsSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border p-4">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ))}
    </div>
  )
}

export default function QuestionsView() {
  const { tx } = useUI()
  const [items, setItems] = useState<QuestionItem[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    apiGet<QuestionItem[]>('/api/questions?filter=all&limit=40')
      .then((d) => alive && setItems(d))
      .catch(() => {
        if (!alive) return
        setError(tx('প্রশ্ন লোড করা যায়নি — আবার চেষ্টা করুন।', 'Could not load questions — please retry.'))
        setItems([])
      })
    return () => {
      alive = false
    }
  }, [tx])

  const recent = (items ?? []).filter((q) => !q.archived)
  const archive = (items ?? []).filter((q) => q.archived)

  return (
    <div className="mx-auto w-full max-w-7xl px-3.5 py-8 sm:py-12">
      <SectionHeading
        title={tx('প্রশ্ন ব্যাংক', 'Question Bank')}
        subtitle={tx(
          'সাম্প্রতিক প্রশ্নগুলো দেখুন — যেসব প্রশ্ন ইতিমধ্যে পরীক্ষায় এসে গেছে সেগুলো আর্কাইভ সেকশনে (সঠিক উত্তরসহ)।',
          'Browse recent questions — questions already used in exams move to the Archive section (with correct answers).'
        )}
      />

      {error ? (
        <div className="mt-8">
          <EmptyState icon={<FileQuestion className="h-7 w-7" aria-hidden />} title={tx('সমস্যা হয়েছে', 'Something went wrong')} description={error} />
        </div>
      ) : items === null ? (
        <div className="mt-8">
          <CardsSkeleton />
        </div>
      ) : (
        <div className="mt-10 flex flex-col gap-14">
          {/* ── Recent ── */}
          <section aria-labelledby="recent-questions">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="recent-questions" className="flex items-center gap-2 text-lg font-bold sm:text-xl">
                  <span aria-hidden className="h-3 w-3 rounded-full grad-emerald" />
                  {tx('সাম্প্রতিক প্রশ্ন', 'Recent Questions')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {recent.length} {tx('টি প্রশ্ন · উত্তর লুকানো', 'questions · answers hidden')}
                </p>
              </div>
            </div>
            {recent.length === 0 ? (
              <EmptyState icon={<HelpCircle className="h-7 w-7" aria-hidden />} title={tx('এখনো নতুন প্রশ্ন নেই', 'No recent questions yet')} />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {recent.map((q) => (
                  <QuestionCard key={q.id} q={q} />
                ))}
              </div>
            )}
          </section>

          {/* ── Archive ── */}
          <section aria-labelledby="archived-questions">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="archived-questions" className="flex items-center gap-2 text-lg font-bold sm:text-xl">
                  <Archive className="h-5 w-5 text-slate-500" aria-hidden />
                  {tx('প্রশ্ন আর্কাইভ', 'Question Archive')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {archive.length} {tx('টি প্রশ্ন · ইতিমধ্যে পরীক্ষা হয়ে গেছে, সঠিক উত্তরসহ', 'questions · exams already held, with correct answers')}
                </p>
              </div>
            </div>
            {archive.length === 0 ? (
              <EmptyState icon={<Archive className="h-7 w-7" aria-hidden />} title={tx('আর্কাইভ এখনো খালি', 'Archive is empty')} description={tx('পরীক্ষা শেষ হলেই সেই প্রশ্নগুলো এখানে যোগ হবে।', 'Questions move here once their exam is held.')} />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {archive.map((q) => (
                  <QuestionCard key={q.id} q={q} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

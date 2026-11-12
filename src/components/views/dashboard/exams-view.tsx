'use client'

/**
 * Exams — list of quizzes available to the student with best-score chips.
 */
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ClipboardList, Clock, HelpCircle, Trophy, Zap, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { useUI, go } from '@/store/ui-store'
import { apiGet } from '@/lib/api-client'
import { digitsBn } from '@/lib/format'
import { cn } from '@/lib/utils'

interface QuizMeta {
  id: string
  title: string
  description: string | null
  durationMin: number
  questionCount: number
  courseTitle: string
  myBest: number | null
}

function bestChip(myBest: number | null, total: number, num: (n: number) => string, newLabel: string) {
  if (myBest === null) {
    return (
      <Badge variant="secondary" className="gap-1 bg-muted text-muted-foreground">
        <Sparkles className="h-3 w-3" /> {newLabel}
      </Badge>
    )
  }
  const pct = total > 0 ? (myBest / total) * 100 : 0
  const cls =
    pct >= 80
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
      : pct >= 50
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
  return (
    <Badge className={cn('gap-1 border-transparent', cls)}>
      <Trophy className="h-3 w-3" /> {num(myBest)}/{num(total)}
    </Badge>
  )
}

/* Colorful 2.0 — rotating card top-strip tones (violet → rose → cyan) */
const EXAM_TONES = ['grad-violet', 'grad-rose', 'grad-cyan'] as const

export default function ExamsView() {
  const { t, tx, lang } = useUI()
  const [quizzes, setQuizzes] = useState<QuizMeta[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    ;(async () => {
      try {
        const data = await apiGet<QuizMeta[]>('/api/quizzes?scope=enrolled&type=EXAM')
        if (alive) setQuizzes(data)
      } catch {
        if (alive) setError(true)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [nonce])

  const num = (n: number) => (lang === 'bn' ? digitsBn(n) : String(n))

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">{t('exams')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tx('লাইভ পরীক্ষায় অংশ নিয়ে নিজের প্রস্তুতি যাচাই করুন।', 'Join live exams and test your preparation.')}
        </p>
      </div>

      {/* Explainer strip */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-100/70 via-accent/60 to-transparent p-4 dark:border-amber-900/40 dark:from-amber-900/20">
        <span className="grad-amber flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-md shadow-amber-500/30">
          <Zap className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-bold">লাইভ পরীক্ষা দিন, লিডারবোর্ডে উঠুন!</p>
          <p className="text-xs text-muted-foreground">
            {tx(
              'সময়মতো সব প্রশ্নের উত্তর দিন — র‍্যাঙ্কিংয়ে নিজের নাম দেখুন।',
              'Answer everything in time — see your name on the leaderboard.'
            )}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7" />}
          title={t('error')}
          description={tx('পরীক্ষার তালিকা লোড করা যায়নি।', 'Could not load the exam list.')}
          actionLabel={t('retry')}
          onAction={() => setNonce((n) => n + 1)}
        />
      ) : !quizzes || quizzes.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7" />}
          title={tx('এখনো কোনো পরীক্ষা নেই', 'No exams available yet')}
          description={tx(
            'নতুন পরীক্ষা প্রকাশ হলেই এখানে দেখতে পাবেন।',
            'New exams will appear here as soon as they are published.'
          )}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {quizzes.map((q, i) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.35, ease: 'easeOut' }}
              className="pop-hover relative flex flex-col overflow-hidden rounded-2xl border bg-card p-5 pt-6 shadow-sm"
            >
              <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${EXAM_TONES[i % EXAM_TONES.length]}`} />
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md ${EXAM_TONES[i % EXAM_TONES.length]}`}
                >
                  <ClipboardList className="h-5 w-5" />
                </span>
                {bestChip(q.myBest, q.questionCount, num, tx('নতুন', 'New'))}
              </div>

              <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-snug">{q.title}</h3>
              {q.description && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{q.description}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[11px]">
                  {q.courseTitle}
                </Badge>
              </div>

              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <HelpCircle className="h-3.5 w-3.5" />
                  {num(q.questionCount)} {t('questions')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {num(q.durationMin)} {t('minutes')}
                </span>
              </div>

              <Button className="mt-4 w-full" onClick={() => go(`/dashboard/exam/${q.id}`)}>
                {t('start_exam')}
              </Button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

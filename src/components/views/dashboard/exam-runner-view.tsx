'use client'

/**
 * Exam Runner — THE QUIZ ENGINE.
 * Pre-start rules → live exam (sticky countdown header, radio-card options,
 * dot navigator, confirm submit) → animated result + breakdown + leaderboard.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList,
  Clock, Crown, ListChecks, Medal, Play, RotateCcw, Timer, Trophy, XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CircularProgress } from '@/components/shared/circular-progress'
import { EmptyState } from '@/components/shared/empty-state'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet, apiPost } from '@/lib/api-client'
import { fmtClock } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/* ── Types (API contract) ─────────────────────────────────────────── */

interface Question {
  id: string
  text: string
  options: string[]
  order: number
}
interface QuizPayload {
  quiz: {
    id: string
    title: string
    description: string | null
    durationMin: number
    questionCount: number
    course: { id: string; title: string } | null
  }
  questions: Question[]
}
interface BreakdownItem {
  questionId: string
  text: string
  options: string[]
  correctIndex: number
  chosenIndex: number | null
  isCorrect: boolean
}
interface QuizResult {
  score: number
  total: number
  percentage: number
  timeTaken: number
  leaderboardRank: number | null
  breakdown: BreakdownItem[]
}
interface LeaderRow {
  rank: number
  userName: string
  score: number
  total: number
  timeTaken: number
  createdAt: string
}

const LETTERS = ['ক', 'খ', 'গ', 'ঘ']
type Phase = 'loading' | 'pre' | 'running' | 'result'

export default function ExamRunnerView({ quizId }: { quizId: string }) {
  const { t, tx } = useUI()
  const { user } = useAuth()

  const [payload, setPayload] = useState<QuizPayload | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState(false)
  const [nonce, setNonce] = useState(0)

  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [qIndex, setQIndex] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<QuizResult | null>(null)
  const [board, setBoard] = useState<LeaderRow[]>([])
  const submittedRef = useRef(false)

  /* ── Fetch quiz + questions ── */
  useEffect(() => {
    let alive = true
    setPhase('loading')
    setError(false)
    ;(async () => {
      try {
        const data = await apiGet<QuizPayload>(`/api/quizzes/${quizId}`)
        if (!alive) return
        setPayload(data)
        setPhase('pre')
      } catch {
        if (alive) setError(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [quizId, nonce])

  const questions = payload?.questions ?? []
  const totalQ = questions.length
  const durationSec = (payload?.quiz.durationMin ?? 0) * 60
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers])
  const unanswered = Math.max(0, totalQ - answeredCount)

  /* ── Submit ── */
  const handleSubmit = useCallback(
    async (auto: boolean) => {
      if (submittedRef.current || submitting) return
      submittedRef.current = true
      setSubmitting(true)
      try {
        const res = await apiPost<QuizResult>(`/api/quizzes/${quizId}/submit`, {
          answers,
          timeTaken: elapsed,
        })
        setResult(res)
        setPhase('result')
        if (auto) toast.warning(tx('সময় শেষ — পরীক্ষা স্বয়ংক্রিয়ভাবে জমা হয়েছে।', "Time's up — exam auto-submitted."))
        // leaderboard (non-blocking)
        try {
          const rows = await apiGet<LeaderRow[]>(`/api/quizzes/${quizId}/leaderboard`)
          setBoard(rows)
        } catch {
          setBoard([])
        }
      } catch {
        submittedRef.current = false
        toast.error(tx('জমা দেওয়া যায়নি। আবার চেষ্টা করুন।', 'Submission failed. Please try again.'))
      } finally {
        setSubmitting(false)
      }
    },
    [answers, elapsed, quizId, submitting, tx]
  )

  /* ── Live countdown (1s interval) ── */
  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => {
      setElapsed((e) => e + 1)
      setRemaining((r) => Math.max(0, r - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  // auto-submit when the clock hits zero
  useEffect(() => {
    if (phase === 'running' && remaining === 0 && durationSec > 0) {
      void handleSubmit(true)
    }
  }, [phase, remaining, durationSec, handleSubmit])

  /* ── Start / retake ── */
  const startExam = () => {
    if (!payload) return
    setAnswers({})
    setQIndex(0)
    setElapsed(0)
    setRemaining((payload.quiz.durationMin ?? 1) * 60)
    submittedRef.current = false
    setResult(null)
    setBoard([])
    setPhase('running')
  }

  const retake = () => setPhase('pre')

  /* ── Loading ── */
  if (phase === 'loading') {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    )
  }

  /* ── Error ── */
  if (error || !payload) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-7 w-7" />}
        title={t('error')}
        description={tx('পরীক্ষাটি লোড করা যায়নি।', 'Could not load this exam.')}
        actionLabel={t('retry')}
        onAction={() => setNonce((n) => n + 1)}
      />
    )
  }

  const { quiz } = payload

  /* ════════════════ PRE-START ════════════════ */
  if (phase === 'pre') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-2xl"
      >
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 gap-1.5 text-muted-foreground"
          onClick={() => go('#/dashboard/exams')}
        >
          <ArrowLeft className="h-4 w-4" /> {t('exams')}
        </Button>

        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="bg-gradient-to-r from-violet-600/15 via-transparent to-transparent p-6">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              <ClipboardList className="h-6 w-6" />
            </span>
            <h1 className="mt-3 text-xl font-bold sm:text-2xl">{quiz.title}</h1>
            {quiz.description && (
              <p className="mt-1.5 text-sm text-muted-foreground">{quiz.description}</p>
            )}
            <Badge variant="outline" className="mt-3">
              {quiz.course?.title}
            </Badge>
          </div>

          <div className="grid gap-3 border-t p-6 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
              <ListChecks className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">{t('questions')}</p>
                <p className="text-sm font-bold">{quiz.questionCount} টি</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
              <Timer className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">{tx('সময়', 'Duration')}</p>
                <p className="text-sm font-bold">{quiz.durationMin} {t('minutes')}</p>
              </div>
            </div>
          </div>

          <div className="mx-6 mb-6 flex items-start gap-3 rounded-xl border border-amber-300/70 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-sm">
              <p className="font-bold text-amber-800 dark:text-amber-300">
                ⚠️ {tx('সতর্কতা: টাইমার থামবে না!', 'Warning: the timer never stops!')}
              </p>
              <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/80">
                {tx(
                  'সময় শেষ হলে পরীক্ষা স্বয়ংক্রিয়ভাবে জমা হয়ে যাবে। রিফ্রেশ করলে উত্তর মুছে যাবে।',
                  'When time runs out the exam auto-submits. Refreshing clears your answers.'
                )}
              </p>
            </div>
          </div>

          <div className="border-t p-6 pt-5">
            <Button size="lg" className="w-full gap-2 text-base" onClick={startExam}>
              <Play className="h-5 w-5" /> {t('start_exam')}
            </Button>
          </div>
        </div>
      </motion.div>
    )
  }

  /* ════════════════ RESULT ════════════════ */
  if (phase === 'result' && result) {
    const scorePct = result.percentage ?? (result.total ? (result.score / result.total) * 100 : 0)
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Score hero */}
        <motion.div
          initial={{ scale: 0.55, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 16 }}
          className="flex flex-col items-center gap-4 rounded-2xl border bg-gradient-to-b from-primary/10 to-transparent p-8 text-center"
        >
          <CircularProgress value={scorePct} size={140} strokeWidth={11} />
          <div>
            <h1 className="text-xl font-bold">{t('result')} · {quiz.title}</h1>
            <p className="mt-1 text-2xl font-extrabold">
              {result.score}
              <span className="text-muted-foreground">/{result.total}</span>
            </p>
            {result.leaderboardRank != null && (
              <Badge className="mt-2 gap-1 bg-amber-400 text-amber-950 hover:bg-amber-400">
                <Trophy className="h-3.5 w-3.5" /> 🏆 #{result.leaderboardRank}
              </Badge>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {tx('সময় লেগেছে', 'Time taken')}: {fmtClock(result.timeTaken)}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" className="gap-2" onClick={retake}>
              <RotateCcw className="h-4 w-4" /> {t('retake')}
            </Button>
            <Button variant="ghost" className="gap-2" onClick={() => go('#/dashboard/exams')}>
              <ArrowLeft className="h-4 w-4" /> {t('exams')}
            </Button>
          </div>
        </motion.div>

        {/* Breakdown */}
        <div className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="mb-3 text-base font-bold">{tx('উত্তরপত্র বিশ্লেষণ', 'Answer breakdown')}</h2>
          <div className="space-y-3">
            {result.breakdown.map((b, i) => (
              <div key={b.questionId} className="rounded-xl border p-3">
                <div className="flex items-start gap-2.5">
                  {b.isCorrect ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug">
                      {i + 1}. {b.text}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {b.options.map((o, oi) => (
                        <span
                          key={oi}
                          className={cn(
                            'rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                            oi === b.correctIndex
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : oi === b.chosenIndex
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {LETTERS[oi]}. {o}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {t('your_score')}:{' '}
                      <span className={b.isCorrect ? 'font-semibold text-emerald-600' : 'font-semibold text-destructive'}>
                        {b.chosenIndex != null ? `${LETTERS[b.chosenIndex]}. ${b.options[b.chosenIndex]}` : '—'}
                      </span>
                      {!b.isCorrect && (
                        <>
                          {' · '}
                          {t('correct')}:{' '}
                          <span className="font-semibold text-emerald-600">
                            {LETTERS[b.correctIndex]}. {b.options[b.correctIndex]}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
            <Trophy className="h-4 w-4 text-amber-500" /> {t('leaderboard')}
          </h2>
          {board.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {tx('লিডারবোর্ড লোড করা যায়নি।', 'Leaderboard could not be loaded.')}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">{t('rank')}</TableHead>
                    <TableHead>{tx('শিক্ষার্থী', 'Student')}</TableHead>
                    <TableHead className="text-right">{t('score')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {board.slice(0, 10).map((row) => {
                    const mine = user && row.userName === user.name
                    return (
                      <TableRow key={`${row.rank}-${row.userName}`} className={cn(mine && 'bg-primary/10 font-semibold')}>
                        <TableCell>
                          <span className="inline-flex items-center gap-1">
                            {row.rank === 1 ? (
                              <Crown className="h-4 w-4 text-amber-500" />
                            ) : row.rank === 2 ? (
                              <Medal className="h-4 w-4 text-slate-400" />
                            ) : row.rank === 3 ? (
                              <Medal className="h-4 w-4 text-orange-500" />
                            ) : (
                              <span className="pl-1 text-xs text-muted-foreground">#{row.rank}</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          {row.userName}
                          {mine && <span className="ml-1.5 text-xs text-primary">({tx('আপনি', 'you')})</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.score}/{row.total}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ════════════════ RUNNING ════════════════ */
  const q = questions[qIndex]
  const danger = remaining <= 60

  return (
    <div>
      {/* Sticky exam header */}
      <div className="sticky top-14 z-30 -mx-4 mb-4 border-b bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold sm:text-lg">{quiz.title}</h1>
            <p className="text-xs text-muted-foreground">
              {t('question')} {qIndex + 1}/{totalQ} · {answeredCount} {tx('উত্তর দেওয়া হয়েছে', 'answered')}
            </p>
          </div>
          <div
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-bold tabular-nums',
              danger
                ? 'animate-pulse border-destructive/40 bg-destructive/10 text-destructive'
                : 'bg-muted text-foreground'
            )}
          >
            <Clock className="h-4 w-4" />
            {fmtClock(remaining)}
          </div>
        </div>
        <Progress value={totalQ ? (answeredCount / totalQ) * 100 : 0} className="mt-2 h-1.5" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* Question card */}
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={q?.id ?? qIndex}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }}
              className="rounded-2xl border bg-card p-5 sm:p-6"
            >
              {q && (
                <>
                  <p className="text-base font-semibold leading-relaxed sm:text-lg">{q.text}</p>
                  <div className="mt-5 space-y-2.5">
                    {q.options.map((opt, i) => {
                      const selected = answers[q.id] === i
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition-all',
                            selected
                              ? 'border-primary bg-primary/10 font-semibold ring-2 ring-primary/40'
                              : 'hover:border-primary/40 hover:bg-muted/60'
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
                              selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {LETTERS[i] ?? i + 1}
                          </span>
                          <span>{opt}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQIndex((i) => Math.max(0, i - 1))}
              disabled={qIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" /> {t('prev')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQIndex((i) => Math.min(totalQ - 1, i + 1))}
              disabled={qIndex === totalQ - 1}
            >
              {t('next')} <ChevronRight className="h-4 w-4" />
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" className="ml-auto" disabled={submitting}>
                  {submitting ? t('loading') : t('submit_exam')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tx('জমা দিতে চান?', 'Submit the exam?')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {unanswered > 0
                      ? tx(
                          `${unanswered} টি প্রশ্নের উত্তর এখনো দেওয়া হয়নি। জমা দিলে সেগুলো ভুল গণ হবে।`,
                          `${unanswered} question(s) are unanswered. They will be marked wrong.`
                        )
                      : tx('সব প্রশ্নের উত্তর দেওয়া হয়েছে। নিশ্চিত?', 'All questions answered. Are you sure?')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void handleSubmit(false)}>
                    {t('submit_exam')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Question dots navigator */}
        <div className="rounded-2xl border bg-card p-4">
          <p className="mb-2.5 text-xs font-semibold text-muted-foreground">
            {tx('প্রশ্ন নেভিগেটর', 'Question navigator')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {questions.map((qq, i) => {
              const answered = answers[qq.id] !== undefined
              const current = i === qIndex
              return (
                <button
                  key={qq.id}
                  type="button"
                  onClick={() => setQIndex(i)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-all',
                    current && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                    answered ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  )}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
          <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            {answeredCount}/{totalQ} {tx('উত্তরকৃত', 'answered')}
          </div>
        </div>
      </div>
    </div>
  )
}

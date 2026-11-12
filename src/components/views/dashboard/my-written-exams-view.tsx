'use client'

/**
 * MyWrittenExamsView — /dashboard/written-exams — the student's WRITTEN exams.
 *  • Purchased (or free) exams → Start / Resume (server timer kept) / Submitted
 *  • Available paid exams → buy via the existing checkout flow
 * Data: GET /api/written-exams (ownership resolved server-side).
 */
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  CalendarClock,
  Clock,
  FileText,
  GraduationCap,
  Lock,
  RefreshCcw,
  ShoppingCart,
  Timer,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeading } from '@/components/shared/section-heading'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet, apiPost } from '@/lib/api-client'
import { digitsBn, fmtBDT } from '@/lib/format'

interface ExamItem {
  id: string
  title: string
  description: string
  categoryName: string | null
  subjectName: string | null
  courseTitle: string | null
  durationMin: number
  totalMarks: number
  isFree: boolean
  price: number | null
  isOwned: boolean
  myPurchase: { id: string; status: string } | null
  myAttempt: {
    id: string
    status: string
    remainingSec: number | null
    submittedAt: string | null
    obtainedMarks: number | null
    isPublished: boolean
  } | null
}

const TONES = ['grad-violet', 'grad-rose', 'grad-cyan', 'grad-emerald', 'grad-amber']

export default function MyWrittenExamsView() {
  const { t, tx, lang } = useUI()
  const { user } = useAuth()
  const [exams, setExams] = useState<ExamItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [buyingId, setBuyingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<{ exams: ExamItem[] }>('/api/written-exams?scope=mine')
      setExams(data.exams ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
      setExams([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const num = (n: number | string) => (lang === 'bn' ? digitsBn(n) : String(n))

  /** free exam → start immediately; paid → checkout */
  async function startOrBuy(e: ExamItem) {
    if (!user) {
      go('/login')
      return
    }
    if (e.isOwned) {
      // start (or resume) the attempt, then open the runner
      try {
        const res = await apiPost<{ attemptId: string; resumed: boolean }>('/api/exam-attempts', {
          examId: e.id,
        })
        go(`/dashboard/written-exams/${res.attemptId}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('error'))
      }
      return
    }
    // paid → go to checkout
    setBuyingId(e.id)
    go(`/checkout/exam/${e.id}`)
  }

  const mine = (exams ?? []).filter((e) => e.isOwned || e.myAttempt)
  const available = (exams ?? []).filter((e) => !e.isOwned && !e.myAttempt)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <SectionHeading
        title={tx('আমার পরীক্ষা', 'My Exams')}
        subtitle={tx(
          'লিখিত পরীক্ষাগুলো এখান থেকে শুরু করুন — খাতায় লিখে ছবি তুলে জমা দিন।',
          'Start your written exams here — write on paper and submit photos.'
        )}
      />

      {/* ── my exams ── */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : mine.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-7 w-7" />}
          title={tx('এখনো কোনো পরীক্ষা নেই', 'No exams yet')}
          description={tx(
            'নিচের তালিকা থেকে পরীক্ষা শুরু করুন বা কিনুন।',
            'Start or buy an exam from the list below.'
          )}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {mine.map((e, i) => {
            const a = e.myAttempt
            const submitted = a && a.status !== 'IN_PROGRESS'
            const inProgress = a && a.status === 'IN_PROGRESS' && !submitted
            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: (i % 4) * 0.05 }}
              >
                <Card className="relative h-full overflow-hidden">
                  <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${TONES[i % TONES.length]}`} />
                  <CardContent className="flex h-full flex-col gap-3 pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 text-base font-bold leading-snug">{e.title}</h3>
                      {submitted ? (
                        <Badge
                          className={
                            a?.status === 'PUBLISHED'
                              ? 'grad-emerald border-transparent text-white'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                          }
                        >
                          {a?.status === 'PUBLISHED' ? tx('ফলাফল প্রকাশিত', 'Result published') : tx('জমা হয়েছে', 'Submitted')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="h-3 w-3" /> {num(e.durationMin)} {tx('মিনিট', 'min')}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {e.categoryName && <Badge variant="outline">{e.categoryName}</Badge>}
                      {e.subjectName && <Badge variant="outline">{e.subjectName}</Badge>}
                      <Badge variant="secondary">
                        {tx('পূর্ণমান', 'Marks')}: {num(e.totalMarks)}
                      </Badge>
                    </div>

                    {inProgress && a?.remainingSec != null && (
                      <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        <Timer className="h-3.5 w-3.5" />
                        {tx('চলমান — বাকি সময়', 'In progress — time left')}:{' '}
                        {num(Math.floor(a.remainingSec / 60))}:{num(String(a.remainingSec % 60).padStart(2, '0'))}
                      </p>
                    )}
                    {a?.status === 'PUBLISHED' && a.obtainedMarks != null && (
                      <p className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        <GraduationCap className="h-3.5 w-3.5" />
                        {tx('প্রাপ্ত নম্বর', 'Obtained')}: {num(a.obtainedMarks)}/{num(e.totalMarks)}
                      </p>
                    )}

                    <div className="mt-auto flex items-center gap-2 pt-1">
                      {submitted ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => go('/dashboard/exam-results')}
                        >
                          <FileText className="h-3.5 w-3.5" /> {tx('ফলাফল দেখুন', 'View results')}
                        </Button>
                      ) : (
                        <Button size="sm" className="gap-1.5" onClick={() => void startOrBuy(e)}>
                          <Timer className="h-3.5 w-3.5" />
                          {inProgress ? tx('পরীক্ষায় ফিরে যান', 'Resume exam') : tx('পরীক্ষা শুরু করুন', 'Start exam')}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* ── available exams ── */}
      {!loading && available.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">{tx('চলমান লিখিত পরীক্ষা', 'Available written exams')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {available.map((e, i) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: (i % 4) * 0.05 }}
              >
                <Card className="relative h-full overflow-hidden">
                  <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${TONES[(i + 2) % TONES.length]}`} />
                  <CardContent className="flex h-full flex-col gap-3 pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 text-base font-bold leading-snug">{e.title}</h3>
                      <Badge className={e.isFree ? 'grad-emerald border-transparent text-white' : 'grad-amber border-transparent text-white'}>
                        {e.isFree ? tx('ফ্রি', 'Free') : fmtBDT(e.price ?? 0)}
                      </Badge>
                    </div>
                    {e.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{e.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="h-3 w-3" /> {num(e.durationMin)} {tx('মিনিট', 'min')}
                      </Badge>
                      <Badge variant="secondary">
                        {tx('পূর্ণমান', 'Marks')}: {num(e.totalMarks)}
                      </Badge>
                      {e.courseTitle && (
                        <Badge variant="outline" className="gap-1">
                          <CalendarClock className="h-3 w-3" /> {e.courseTitle}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-auto flex items-center gap-2 pt-1">
                      <Button size="sm" className="gap-1.5" onClick={() => void startOrBuy(e)} disabled={buyingId === e.id}>
                        {e.isFree ? <Timer className="h-3.5 w-3.5" /> : <ShoppingCart className="h-3.5 w-3.5" />}
                        {e.isFree ? tx('ফ্রি-তে শুরু করুন', 'Start free') : tx('কিনুন', 'Buy now')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* refresh */}
      <div className="flex justify-center">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => void load()}>
          <RefreshCcw className="h-3.5 w-3.5" /> {tx('রিফ্রেশ', 'Refresh')}
        </Button>
      </div>

      {!user && !loading && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> {tx('কিনতে লগইন করুন', 'Log in to purchase')}
        </p>
      )}
    </div>
  )
}

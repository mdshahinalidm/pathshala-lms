'use client'

/**
 * WrittenExamDetailView — exam details page (spec #5).
 * Name, course/category/subject, marks, duration, instructions and the
 * question preview (PDF/images) — question media streams through the
 * server-side gate and is only shown to entitled students. Start Exam →
 * POST /api/exams/[id]/start (server timer starts) → take page.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft, BookOpenCheck, Clock, FileText, ImageIcon, Info, Loader2,
  Lock, PlayCircle, Trophy,
} from 'lucide-react'
import { PdfFileIcon } from '@/components/shared/pdf-file-icon'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet, apiPost } from '@/lib/api-client'
import { digitsBn, fmtBDT } from '@/lib/format'

interface DetailRes {
  exam: {
    id: string; title: string; description: string; instructions: string
    course: { id: string; title: string } | null
    category: { id: string; name: string } | null
    subject: { id: string; name: string; nameEn: string | null } | null
    totalMarks: number; durationMin: number; price: number
    questionImageCount: number
    questionImages: string[]
    questionPdfUrl: string | null
    questionPdfName: string | null
    canPreview: boolean
    purchased: boolean
  }
  my: {
    attempt: { id: string; status: string; startedAt: string; endsAt: string; imageCount: number } | null
    submission: { id: string; reviewStatus: string } | null
  } | null
}

export default function WrittenExamDetailView({ examId }: { examId: string }) {
  const { tx, lang } = useUI()
  const { user, initialized } = useAuth()
  const [data, setData] = useState<DetailRes | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const d = await apiGet<DetailRes>(`/api/exams/${examId}`)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }, [examId])

  useEffect(() => {
    void load()
  }, [load])

  const start = async () => {
    if (startingRef.current) return
    startingRef.current = true
    setStarting(true)
    try {
      await apiPost(`/api/exams/${examId}/start`)
      go(`/dashboard/written-exams/${examId}/take`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('শুরু করা যায়নি', 'Could not start'))
      startingRef.current = false
      setStarting(false)
    }
  }

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
          <Lock className="h-8 w-8 text-muted-foreground" />
          <p className="font-semibold">{tx('পরীক্ষাটি পাওয়া যায়নি', 'Exam not found')}</p>
          <Button variant="outline" asChild><Link href="/dashboard/written-exams">{tx('ফিরে যান', 'Back')}</Link></Button>
        </CardContent>
      </Card>
    )
  }

  const e = data.exam
  const submitted = data.my?.attempt && data.my.attempt.status !== 'IN_PROGRESS'
  const published = data.my?.submission?.reviewStatus === 'PUBLISHED'

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => go('/dashboard/written-exams')}>
        <ArrowLeft className="h-4 w-4" />{tx('লিখিত পরীক্ষা', 'Written exams')}
      </Button>

      {/* header card */}
      <Card className="overflow-hidden">
        <div className="grad-brand p-5 text-white">
          <h1 className="text-xl font-extrabold leading-snug sm:text-2xl">{e.title}</h1>
          {e.description && <p className="mt-1.5 text-sm text-white/85">{e.description}</p>}
        </div>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap gap-1.5">
            {e.course && <Badge variant="outline">{e.course.title}</Badge>}
            {e.category && <Badge variant="secondary">{e.category.name}</Badge>}
            {e.subject && <Badge variant="secondary">{e.subject.nameEn || e.subject.name}</Badge>}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={<Trophy className="h-4 w-4" />} label={tx('পূর্ণমান', 'Total marks')} value={digitsBn(e.totalMarks)} />
            <Stat icon={<Clock className="h-4 w-4" />} label={tx('সময়', 'Duration')} value={`${digitsBn(e.durationMin)} ${tx('মিনিট', 'min')}`} />
            <Stat icon={<FileText className="h-4 w-4" />} label={tx('মূল্য', 'Price')} value={e.price > 0 ? fmtBDT(e.price, lang) : tx('ফ্রি', 'Free')} />
            <Stat
              icon={<ImageIcon className="h-4 w-4" />}
              label={tx('প্রশ্ন', 'Question')}
              value={[e.questionPdfUrl && 'PDF', e.questionImageCount > 0 && `${digitsBn(e.questionImageCount)} ${tx('ছবি', 'img')}`].filter(Boolean).join(' + ') || '—'}
            />
          </div>

          {e.instructions && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <div>
                <p className="font-bold text-amber-900 dark:text-amber-200">{tx('নির্দেশনা', 'Instructions')}</p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed text-amber-900/90 dark:text-amber-100/90">{e.instructions}</p>
              </div>
            </div>
          )}

          {published ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">{tx('রেজাল্ট প্রকাশিত হয়েছে', 'Result has been published')}</p>
              <Button size="sm" asChild><Link href={`/dashboard/results/${data.my?.submission?.id}`}>{tx('দেখুন', 'View')}</Link></Button>
            </div>
          ) : submitted ? (
            <div className="rounded-xl border bg-muted/40 p-4 text-center text-sm font-semibold text-muted-foreground">
              {tx('উত্তরপত্র জমা হয়েছে — মূল্যায়নের অপেক্ষায়।', 'Your answer sheets are submitted — awaiting evaluation.')}
            </div>
          ) : (
            <Button size="lg" className="w-full gap-2 rounded-xl text-base shadow-md" onClick={() => void start()} disabled={starting || (initialized && !user)}>
              {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}
              {e.price > 0 && !e.purchased
                ? tx('প্রথমে কিনতে হবে', 'Purchase required first')
                : tx('পরীক্ষা শুরু করুন', 'Start exam')}
            </Button>
          )}
          {e.price > 0 && !e.purchased && !submitted && (
            <p className="text-center text-xs text-muted-foreground">
              {tx('শুরু করতে হলে আগে চেকআউট সম্পন্ন করুন।', 'Complete the checkout first to unlock this exam.')}{' '}
              <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => go(`/checkout/exam/${e.id}`)}>
                {tx('কিনুন', 'Buy now')}
              </button>
            </p>
          )}
        </CardContent>
      </Card>

      {/* question preview (gated server-side) */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <PdfFileIcon className="h-4 w-4" />
            {tx('প্রশ্নপত্র', 'Question paper')}
          </h2>
          {!e.canPreview ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
              <Lock className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {e.price > 0
                  ? tx('প্রশ্ন দেখতে পরীক্ষাটি কিনতে হবে।', 'Purchase the exam to see the question paper.')
                  : tx('প্রশ্ন দেখতে লগইন করুন।', 'Log in to see the question paper.')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {e.questionPdfUrl && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
                  <PdfFileIcon className="h-5 w-5" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{e.questionPdfName || tx('প্রশ্নপত্র PDF', 'Question PDF')}</span>
                  <Button size="sm" variant="outline" asChild>
                    {/* gated stream — never the raw URL */}
                    <a href={`/api/exams/${e.id}/question-file?pdf=1`} target="_blank" rel="noreferrer">{tx('খুলুন', 'Open')}</a>
                  </Button>
                </div>
              )}
              {e.questionImages.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {e.questionImages.map((_, i) => (
                    <a
                      key={i}
                      href={`/api/exams/${e.id}/question-file?index=${i}`}
                      target="_blank"
                      rel="noreferrer"
                      className="group overflow-hidden rounded-xl border transition hover:ring-2 hover:ring-primary/40"
                      aria-label={`প্রশ্ন ${i + 1}`}
                    >
                      { }
                      <img
                        src={`/api/exams/${e.id}/question-file?index=${i}`}
                        alt={`প্রশ্ন ${i + 1}`}
                        loading="lazy"
                        className="aspect-[3/4] w-full bg-muted object-cover"
                      />
                      <span className="block border-t py-1.5 text-center text-xs font-bold">{digitsBn(i + 1)}</span>
                    </a>
                  ))}
                </div>
              )}
              {!e.questionPdfUrl && e.questionImages.length === 0 && (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {tx('প্রশ্ন এখনো সংযুক্ত হয়নি — পরীক্ষা শুরুর সময় নির্দেশনা অনুসরণ করুন।', 'No question media attached yet — follow the instructions after starting.')}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* how to answer */}
      <Card>
        <CardContent className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <BookOpenCheck className="h-4 w-4 text-primary" />
            {tx('কীভাবে উত্তর জমা দেবেন', 'How to submit your answers')}
          </h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>{tx('শুরু করলেই সার্ভারে সময় গণনা শুরু হবে — রিফ্রেশ করলেও ঘড়ি থামবে না।', 'The server clock starts at Start — refreshing never stops or resets it.')}</li>
            <li>{tx('প্রশ্ন দেখে খাতায় হাতে লিখুন।', 'Read the questions and write by hand on paper.')}</li>
            <li>{tx('মোবাইল ক্যামেরা দিয়ে প্রতিটি পৃষ্ঠার স্পষ্ট ছবি তুলুন ও আপলোড করুন (একাধিক ছবি দেওয়া যায়)।', 'Photograph each page clearly with your phone camera and upload (multiple photos allowed).')}</li>
            <li>{tx('সব ছবি দেওয়ার পর "জমা দিন" চাপুন — সময় শেষ হলে স্বয়ংক্রিয়ভাবে জমা হবে।', 'After uploading all photos press Submit — at 00:00 the exam auto-submits.')}</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{icon}{label}</p>
      <p className="mt-1 font-extrabold">{value}</p>
    </div>
  )
}

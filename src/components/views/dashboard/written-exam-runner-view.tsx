'use client'

/**
 * WrittenExamRunnerView — /dashboard/written-exams/[attemptId].
 * THE exam page: instructions + question file preview, Start (server
 * timestamp), real-time countdown driven by SERVER clock (survives refresh /
 * device switch), answer-sheet photo upload (camera on mobile, multiple, no
 * resolution restriction), reorder-free gallery with delete-before-submit,
 * final submit with confirmation. After deadline the server rejects uploads
 * and auto-locks the attempt.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Clock,
  FileText,
  ImagePlus,
  Loader2,
  Send,
  Timer,
  Trash2,
  ZoomIn,
} from 'lucide-react'
import { PdfFileIcon } from '@/components/shared/pdf-file-icon'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeading } from '@/components/shared/section-heading'
import { useUI, go } from '@/store/ui-store'
import { apiDelete, apiGet, apiPost } from '@/lib/api-client'
import { digitsBn, fmtDate } from '@/lib/format'
import { ImageViewer } from '@/components/exams/image-viewer'

interface AttemptState {
  attempt: {
    id: string
    status: string
    expired: boolean
    startedAt: string
    deadlineAt: string
    submittedAt: string | null
    remainingSec: number
    uploadOpen: boolean
    totalMarks: number
    obtainedMarks: number | null
    percentage: number | null
    grade: string | null
    feedback: string | null
    publishedAt: string | null
  }
  exam: {
    id: string
    title: string
    instructions: string
    durationMin: number
    totalMarks: number
    categoryName: string | null
    subjectName: string | null
    questionPdfUrl: string | null
    questionPdfName: string | null
    questionImages: { url: string; name?: string }[]
  }
  images: { id: string; order: number; url: string; fileName: string | null; fileSize: number | null }[]
  serverNow: string
}

function clockBn(totalSec: number, lang: 'bn' | 'en'): string {
  const s = Math.max(0, totalSec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  const raw = h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
  return lang === 'bn' ? raw.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]) : raw
}

export default function WrittenExamRunnerView({ attemptId }: { attemptId: string }) {
  const { tx, lang } = useUI()

  const [data, setData] = useState<AttemptState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitConfirm, setSubmitConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)
  const [nowTick, setNowTick] = useState(Date.now())

  /** drift-corrected remaining seconds, computed from the SERVER clock */
  const clockOffsetRef = useRef(0)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!attemptId) return
    setLoading(true)
    setError('')
    try {
      const d = await apiGet<AttemptState>(`/api/exam-attempts/${attemptId}`)
      clockOffsetRef.current = new Date(d.serverNow).getTime() - Date.now()
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
    } finally {
      setLoading(false)
    }
  }, [attemptId])

  useEffect(() => {
    void load()
  }, [load])

  // 1-second tick (display only — enforcement is server-side)
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const remaining = useMemo(() => {
    if (!data) return 0
    if (data.attempt.status !== 'IN_PROGRESS') return 0
    const serverNow = nowTick + clockOffsetRef.current
    return Math.max(0, Math.floor((new Date(data.attempt.deadlineAt).getTime() - serverNow) / 1000))
  }, [data, nowTick])

  const uploadOpen = Boolean(
    data && data.attempt.status === 'IN_PROGRESS' && remaining >= 0 && data.attempt.uploadOpen
  )

  // deadline hit → auto-submit (client-triggered, server re-validates)
  const autoSubmitRef = useRef(false)
  useEffect(() => {
    if (!data || data.attempt.status !== 'IN_PROGRESS') return
    if (remaining > 0 || autoSubmitRef.current) return
    autoSubmitRef.current = true
    void (async () => {
      try {
        await apiPost(`/api/exam-attempts/${attemptId}/submit`)
        toast.warning(
          tx('সময় শেষ — পরীক্ষা স্বয়ংক্রিয়ভাবে জমা হয়েছে', "Time's up — the exam was auto-submitted")
        )
      } catch {
        toast.warning(tx('সময় শেষ', "Time's up"))
      }
      void load()
    })()
  }, [remaining, data, attemptId, load, tx])

  async function uploadOne(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`/api/exam-attempts/${attemptId}/images`, { method: 'POST', body: fd })
    const json = (await res.json().catch(() => null)) as
      | { ok: boolean; data?: unknown; error?: string }
      | null
    if (!res.ok || !json?.ok) throw new Error(json?.error ?? tx('আপলোড ব্যর্থ', 'Upload failed'))
  }

  async function onFilesPicked(files: FileList | null, source: 'camera' | 'gallery') {
    if (!files || files.length === 0) return
    setUploading(true)
    let okCount = 0
    try {
      for (const file of Array.from(files)) {
        try {
          await uploadOne(file)
          okCount++
        } catch (e) {
          toast.error(
            `${file.name}: ${e instanceof Error ? e.message : tx('আপলোড ব্যর্থ', 'Upload failed')}`
          )
        }
      }
      if (okCount > 0) {
        toast.success(
          tx(`${okCount}টি উত্তরপত্র যোগ হয়েছে`, `${okCount} answer sheet(s) uploaded`)
        )
        await load()
      }
    } finally {
      setUploading(false)
      const ref = source === 'camera' ? cameraInputRef : galleryInputRef
      if (ref.current) ref.current.value = ''
    }
  }

  async function deleteImage(imageId: string) {
    try {
      await apiDelete(`/api/exam-attempts/${attemptId}/images/${imageId}`)
      toast.success(tx('ছবি মুছে ফেলা হয়েছে', 'Image removed'))
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    }
  }

  async function finalSubmit() {
    setSubmitting(true)
    try {
      await apiPost(`/api/exam-attempts/${attemptId}/submit`)
      toast.success(tx('পরীক্ষা সফলভাবে জমা হয়েছে', 'Exam submitted successfully'))
      setSubmitConfirm(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('জমা ব্যর্থ', 'Submit failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const viewerImages = useMemo(
    () => (data?.exam.questionImages ?? []).map((qi, i) => ({ id: `q${i}`, url: qi.url, label: qi.name ?? `question-${i + 1}` })),
    [data]
  )

  const num = (n: number | string) => (lang === 'bn' ? digitsBn(n) : String(n))

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <EmptyState
          icon={<AlertTriangle className="h-7 w-7" />}
          title={tx('পরীক্ষাটি লোড করা যায়নি', 'Could not load the exam')}
          description={error}
          actionLabel={tx('ফিরে যান', 'Go back')}
          onAction={() => go('/dashboard/written-exams')}
        />
      </div>
    )
  }

  const submitted = data.attempt.status !== 'IN_PROGRESS'

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link
        href="/dashboard/written-exams"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> {tx('আমার পরীক্ষা', 'My Exams')}
      </Link>

      <SectionHeading title={data.exam.title} subtitle={`${data.exam.categoryName ?? ''}${data.exam.subjectName ? ` · ${data.exam.subjectName}` : ''}`} />

      {/* meta chips */}
      <div className="flex flex-wrap gap-1.5 text-xs">
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" /> {num(data.exam.durationMin)} {tx('মিনিট', 'min')}
        </Badge>
        <Badge variant="secondary">
          {tx('পূর্ণমান', 'Marks')}: {num(data.attempt.totalMarks)}
        </Badge>
        <Badge variant="secondary" className="gap-1">
          <FileText className="h-3 w-3" /> {num(data.exam.questionImages.length)} {tx('প্রশ্নের ছবি', 'question images')}
          {data.exam.questionPdfUrl ? ' + PDF' : ''}
        </Badge>
        {data.attempt.startedAt && (
          <Badge variant="outline" className="gap-1">
            {tx('শুরু', 'Started')}: {fmtDate(data.attempt.startedAt)}
          </Badge>
        )}
      </div>

      {/* instructions */}
      {data.exam.instructions && (
        <Card>
          <CardContent className="pt-5">
            <p className="mb-1 text-sm font-semibold">{tx('নির্দেশনা', 'Instructions')}</p>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.exam.instructions}</p>
          </CardContent>
        </Card>
      )}

      {/* question file preview */}
      <Card>
        <CardContent className="pt-5">
          <p className="mb-2 text-sm font-semibold">{tx('প্রশ্নপত্র', 'Question paper')}</p>
          {data.exam.questionPdfUrl && (
            <a
              href={data.exam.questionPdfUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-2 flex items-center justify-between gap-2 rounded-xl border bg-muted/40 px-3 py-2.5 text-sm transition-colors hover:bg-muted"
            >
              <span className="flex min-w-0 items-center gap-2">
                <PdfFileIcon className="h-4 w-4 shrink-0" />
                <span className="truncate font-medium">{data.exam.questionPdfName ?? 'question.pdf'}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{tx('খুলুন', 'Open')}</span>
            </a>
          )}
          {viewerImages.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {viewerImages.map((qi, idx) => (
                <button
                  key={qi.id}
                  type="button"
                  className="group relative overflow-hidden rounded-lg border"
                  onClick={() => {
                    setViewerIndex(idx)
                    setViewerOpen(true)
                  }}
                  aria-label={`${tx('প্রশ্ন', 'Question')} ${idx + 1}`}
                >
                  { }
                  <img src={qi.url} alt={qi.label ?? `question-${idx + 1}`} loading="lazy" className="aspect-[3/4] w-full bg-white object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                    <ZoomIn className="h-5 w-5" />
                  </span>
                  <span className="absolute bottom-0.5 left-1 text-[10px] font-bold text-white drop-shadow">
                    {num(idx + 1)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SUBMITTED state */}
      {submitted ? (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <h2 className="text-lg font-bold">{tx('পরীক্ষা জমা হয়ে গেছে', 'Exam submitted')}</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {data.attempt.submittedAt
                  ? `${tx('জমার সময়', 'Submitted at')}: ${fmtDate(data.attempt.submittedAt)}`
                  : ''}
                {data.attempt.expired
                  ? ` · ${tx('সময় শেষে স্বয়ংক্রিয় জমা', 'auto-submitted at deadline')}`
                  : ''}
                {'. '}
                {tx(
                  'ফলাফল প্রকাশ হলে নোটিফিকেশন পাবেন — "ফলাফল" পেজে মূল্যায়িত উত্তরপত্র দেখতে পারবেন।',
                  'You will be notified when the result is published — see evaluated sheets in My Results.'
                )}
              </p>
              {data.attempt.status === 'PUBLISHED' && data.attempt.obtainedMarks != null && (
                <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                  {num(data.attempt.obtainedMarks)} / {num(data.attempt.totalMarks)}{' '}
                  {data.attempt.grade ? `(${data.attempt.grade})` : ''}
                </p>
              )}
              <Button size="sm" variant="outline" className="mt-2" onClick={() => go('/dashboard/exam-results')}>
                <FileText className="h-4 w-4" /> {tx('ফলাফল দেখুন', 'My results')}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          {/* TIMER + upload */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className={remaining <= 300 ? 'border-rose-300 dark:border-rose-800' : ''}>
              <CardContent className="pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <Timer className="h-4 w-4" /> {tx('বাকি সময়', 'Time remaining')}
                  </p>
                  <p
                    className={`mt-1 font-mono text-4xl font-bold tabular-nums ${
                      remaining <= 300 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                    aria-live="off"
                  >
                    {clockBn(remaining, lang)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {tx(
                      'সার্ভার-ঘড়ি নিয়ন্ত্রিত — রিফ্রেশ বা ডিভাইস বদলালেও সময় ঠিক থাকে।',
                      'Server-clock driven — refresh or switch devices, the timer stays true.'
                    )}
                  </p>
                </div>

                <div className="flex flex-col items-stretch gap-2">
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => void onFilesPicked(e.target.files, 'camera')}
                  />
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => void onFilesPicked(e.target.files, 'gallery')}
                  />
                  <Button
                    className="gap-2"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={!uploadOpen || uploading}
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {tx('ছবি তুলুন', 'Take photo')}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={!uploadOpen || uploading}
                  >
                    <ImagePlus className="h-4 w-4" />
                    {tx('গ্যালারি থেকে দিন', 'Choose image')}
                  </Button>
                </div>
              </div>
              {!uploadOpen && (
                <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                  {tx(
                    'সময় শেষ — নতুন আপলোড বন্ধ। জমা দেওয়ার সুযোগ শেষ হলে স্বয়ংক্রিয়ভাবে জমা হবে।',
                    'Time is up — new uploads closed. The exam will auto-submit when the grace window ends.'
                  )}
                </p>
              )}
              </CardContent>
            </Card>
          </motion.div>

          {/* answer sheets gallery */}
          <Card>
            <CardContent className="pt-5">
              <p className="mb-2 text-sm font-semibold">
                {tx('আপলোড করা উত্তরপত্র', 'Uploaded answer sheets')} (
                {num(data.images.length)})
              </p>
              {data.images.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {tx(
                    'খাতা লিখে প্রতিটি পৃষ্ঠার ছবি তুলে আপলোড করুন।',
                    'Write your answers, photograph each page and upload.'
                  )}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {data.images.map((img, idx) => (
                    <div key={img.id} className="group relative overflow-hidden rounded-xl border">
                      <button
                        type="button"
                        className="block w-full"
                        onClick={() => {
                          setViewerIndex(idx)
                          setViewerOpen(true)
                        }}
                        aria-label={`${tx('উত্তরপত্র', 'Answer sheet')} ${idx + 1}`}
                      >
                        { }
                        <img src={img.url} alt={img.fileName ?? `answer-${idx + 1}`} loading="lazy" className="aspect-[3/4] w-full bg-white object-cover" />
                      </button>
                      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {num(idx + 1)}
                      </span>
                      {uploadOpen && (
                        <button
                          type="button"
                          onClick={() => void deleteImage(img.id)}
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-white transition-opacity hover:bg-rose-600"
                          aria-label={tx('ছবি মুছুন', 'Delete image')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {tx(
                    'JPG/PNG/WEBP — যেকোনো রেজোলিউশনের ছবি চলবে।',
                    'JPG/PNG/WEBP — any resolution is accepted.'
                  )}
                </p>
                <Button
                  className="gap-2 grad-emerald border-transparent text-white"
                  onClick={() => setSubmitConfirm(true)}
                  disabled={data.images.length === 0 || uploading}
                >
                  <Send className="h-4 w-4" /> {tx('পরীক্ষা জমা দিন', 'Submit exam')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* submit confirm */}
      <Dialog open={submitConfirm} onOpenChange={setSubmitConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tx('পরীক্ষা জমা দেবেন?', 'Submit your exam?')}</DialogTitle>
            <DialogDescription>
              {tx(
                'আপনি কি নিশ্চিত পরীক্ষা জমা দেতে চান? জমার পরে আর উত্তরপত্র বদলানো যাবে না।',
                'Are you sure you want to submit your exam? Answer sheets cannot be changed afterwards.'
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            {tx('মোট ছবি', 'Total images')}: <strong>{num(data.images.length)}</strong>
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSubmitConfirm(false)}>
              {tx('আরও কাজ করব', 'Keep working')}
            </Button>
            <Button className="grad-emerald border-transparent text-white" onClick={() => void finalSubmit()} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {tx('জমা দিন', 'Yes, submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* fullscreen viewer */}
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

'use client'

/**
 * WrittenExamTakeView — the exam room (spec #6–#11).
 *
 * TIMER: server-authoritative. On mount GET /api/exams/[id]/my-attempt →
 * endsAt + serverTime → the client derives remaining and re-syncs every 60s;
 * refresh/other device shows the same clock. At 00:00 the UI locks and the
 * exam auto-submits; the server independently rejects late uploads/submits.
 *
 * ANSWERS: mobile-first image upload ("ছবি তুলুন" = camera capture,
 * "গ্যালারি" = picker), JPG/PNG/WEBP, NO dimension restriction, live % per
 * image (XHR upload.onprogress), delete before final submit, preview grid.
 * Files >40MB are auto-downscaled client-side once (still excellent quality)
 * so any camera photo always goes through.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertTriangle, ArrowLeft, Camera, CheckCircle2, Clock, ImageIcon,
  Loader2, Lock, Send, Timer, Trash2, Upload,
} from 'lucide-react'
import { PdfFileIcon } from '@/components/shared/pdf-file-icon'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useUI, go } from '@/store/ui-store'
import { apiDelete, apiGet, apiPost } from '@/lib/api-client'
import { digitsBn } from '@/lib/format'

interface AttemptRes {
  serverTime: string
  attempt: {
    id: string
    status: string
    startedAt: string
    endsAt: string
    isAutoSubmitted: boolean
    remainingMs: number
    imageCount: number
    submission: { id: string; reviewStatus: string; obtainedMarks: number | null } | null
  } | null
}

interface ImgRow {
  id: string
  url: string
  originalName: string
  size: number
  order: number
}

interface ExamMeta {
  exam: {
    id: string; title: string; instructions: string
    totalMarks: number; durationMin: number
    questionPdfUrl: string | null; questionImages: string[]; questionPdfName: string | null
    canPreview: boolean
  }
}

const UPLOAD_MAX_BYTES = 40 * 1024 * 1024

export default function WrittenExamTakeView({ examId }: { examId: string }) {
  const { tx, lang } = useUI()
  const [meta, setMeta] = useState<ExamMeta | null>(null)
  const [attempt, setAttempt] = useState<AttemptRes['attempt']>(null)
  const [images, setImages] = useState<ImgRow[]>([])
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false) // deadline passed
  const [remaining, setRemaining] = useState<number | null>(null)
  const [uploading, setUploading] = useState<{ name: string; pct: number } | null>(null)
  const [submitConfirm, setSubmitConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedDone, setSubmittedDone] = useState(false)
  const [expiredNote, setExpiredNote] = useState(false)

  const camRef = useRef<HTMLInputElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const endsAtRef = useRef<number | null>(null)
  const autoSubmittedRef = useRef(false)

  const attemptId = attempt?.id ?? null

  // ── initial load: attempt + exam meta + images ──
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await apiGet<AttemptRes>(`/api/exams/${examId}/my-attempt`)
        if (!alive) return
        if (!res.attempt) {
          // no attempt yet → send to details (start there)
          go(`/dashboard/written-exams/${examId}`)
          return
        }
        setAttempt(res.attempt)
        endsAtRef.current = new Date(res.attempt.endsAt).getTime()
        const serverNow = new Date(res.serverTime).getTime()
        setRemaining(Math.max(0, endsAtRef.current - serverNow))
        if (res.attempt.status === 'IN_PROGRESS') {
          const [m, imgs] = await Promise.all([
            apiGet<ExamMeta>(`/api/exams/${examId}`),
            apiGet<{ images: ImgRow[] }>(`/api/exams/attempts/${res.attempt.id}/images`),
          ])
          if (!alive) return
          setMeta(m)
          setImages(imgs.images ?? [])
        } else {
          setLocked(true)
          setSubmittedDone(res.attempt.status === 'SUBMITTED')
          setExpiredNote(res.attempt.isAutoSubmitted)
          const m = await apiGet<ExamMeta>(`/api/exams/${examId}`)
          if (!alive) return
          setMeta(m)
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tx('লোড ব্যর্থ', 'Load failed'))
        go(`/dashboard/written-exams/${examId}`)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [examId, tx])

  // ── 1s tick + auto-submit at zero + periodic server re-sync ──
  const doSubmit = useCallback(
    async (auto = false) => {
      if (!attemptId || autoSubmittedRef.current) return
      autoSubmittedRef.current = true
      setSubmitting(true)
      try {
        await apiPost(`/api/exams/attempts/${attemptId}/submit`)
        setSubmittedDone(true)
        setLocked(true)
        toast.success(auto ? tx('সময় শেষ — পরীক্ষা স্বয়ংক্রিয়ভাবে জমা হয়েছে।', "Time's up — the exam was auto-submitted.") : tx('পরীক্ষা জমা হয়েছে ✓', 'Exam submitted ✓'))
      } catch (e) {
        autoSubmittedRef.current = false
        const msg = e instanceof Error ? e.message : 'Submit failed'
        toast.error(msg)
        if (msg.includes('সময় শেষ') || msg.includes('409')) setLocked(true)
      } finally {
        setSubmitting(false)
      }
    },
    [attemptId, tx]
  )

  useEffect(() => {
    if (remaining == null || locked) return
    if (remaining <= 0) {
      setLocked(true)
      if (images.length > 0) void doSubmit(true)
      else {
        setExpiredNote(true)
        toast.error(tx('সময় শেষ — কোনো উত্তরপত্র জমা হয়নি।', "Time's up — no answer sheets were submitted."))
      }
      return
    }
    const t = setTimeout(() => setRemaining((r) => (r == null ? r : r - 1000)), 1000)
    return () => clearTimeout(t)
  }, [remaining, locked, images.length, doSubmit, tx])

  // periodic re-sync (drift correction + cross-device truth)
  useEffect(() => {
    if (locked) return
    const iv = setInterval(async () => {
      try {
        const res = await apiGet<AttemptRes>(`/api/exams/${examId}/my-attempt`)
        if (res.attempt?.status !== 'IN_PROGRESS') {
          setLocked(true)
          setSubmittedDone(res.attempt?.status === 'SUBMITTED')
          setExpiredNote(Boolean(res.attempt?.isAutoSubmitted))
          return
        }
        endsAtRef.current = new Date(res.attempt.endsAt).getTime()
        const serverNow = new Date(res.serverTime).getTime()
        setRemaining(Math.max(0, endsAtRef.current - serverNow))
      } catch {
        /* offline blip — next tick retries */
      }
    }, 60_000)
    return () => clearInterval(iv)
  }, [examId, locked])

  // ── upload one file with real % (XHR onprogress) ──
  const uploadOne = useCallback(
    (file: File) =>
      new Promise<void>((resolve) => {
        if (!attemptId) return resolve()
        const xhr = new XMLHttpRequest()
        const fd = new FormData()
        fd.append('file', file)
        xhr.open('POST', `/api/exams/attempts/${attemptId}/images`)
        xhr.withCredentials = true
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100)
            setUploading({ name: file.name, pct })
          }
        }
        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText)
            if (xhr.status === 200 && json.ok) {
              setImages((prev) => [...prev, json.data.image])
              toast.success(tx('ছবি যোগ হয়েছে ✓', 'Image added ✓'))
            } else {
              toast.error(json.error || tx('আপলোড ব্যর্থ হয়েছে', 'Upload failed'))
            }
          } catch {
            toast.error(tx('আপলোড ব্যর্থ হয়েছে', 'Upload failed'))
          }
          resolve()
        }
        xhr.onerror = () => {
          toast.error(tx('নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন।', 'Network error — please retry.'))
          resolve()
        }
        setUploading({ name: file.name, pct: 0 })
        xhr.send(fd)
      }),
    [attemptId, tx]
  )

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (locked || !files.length) return
      const okFiles: File[] = []
      for (const f of files) {
        const isImg =
          /^image\/(jpeg|png|webp)$/i.test(f.type) ||
          /\.(jpe?g|png|webp)$/i.test(f.name)
        if (!isImg) {
          toast.error(`"${f.name}" — ${tx('শুধু JPG/PNG/WebP ছবি দিন', 'Only JPG/PNG/WebP images are allowed')}`)
          continue
        }
        if (f.size > UPLOAD_MAX_BYTES) {
          const compressed = await shrinkImage(f)
          if (compressed) okFiles.push(compressed)
          else toast.error(`"${f.name}" — ${tx('খুব বড়, আবার চেষ্টা করুন', 'Too large, please retry')}`)
        } else {
          okFiles.push(f)
        }
      }
      for (const f of okFiles) {
        await uploadOne(f)
      }
      setUploading(null)
      if (fileRef.current) fileRef.current.value = ''
      if (camRef.current) camRef.current.value = ''
    },
    [locked, uploadOne, tx]
  )

  const removeImage = async (img: ImgRow) => {
    if (!attemptId) return
    try {
      await apiDelete(`/api/exams/attempts/${attemptId}/images/${img.id}`)
      setImages((prev) => prev.filter((i) => i.id !== img.id))
      toast.success(tx('ছবি মুছে ফেলা হয়েছে', 'Image removed'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছা যায়নি', 'Delete failed'))
    }
  }

  const clock = useMemo(() => {
    if (remaining == null) return null
    const total = Math.max(0, Math.floor(remaining / 1000))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    const raw = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
    return lang === 'bn' ? raw.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]) : raw
  }, [remaining, lang])

  const danger = remaining != null && remaining < 5 * 60 * 1000

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  // ── after submit state ──
  if (submittedDone) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50">
            <CheckCircle2 className="h-9 w-9" />
          </span>
          <h1 className="text-xl font-bold">{tx('পরীক্ষা জমা হয়েছে', 'Exam submitted')}</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {expiredNote
              ? tx('সময় শেষ হওয়ায় পরীক্ষাটি স্বয়ংক্রিয়ভাবে জমা হয়েছে। মূল্যায়নের পর "রেজাল্ট" সেকশনে ফল দেখতে পাবেন।', 'The exam was auto-submitted at the deadline. Your result will appear in the Results section after evaluation.')
              : tx('আপনার উত্তরপত্র মূল্যায়নের অপেক্ষায় — রেজাল্ট প্রকাশ হলে নোটিফিকেশন পাবেন।', 'Your sheets are awaiting evaluation — you will be notified when the result is published.')}
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Button asChild className="gap-2"><Link href="/dashboard/written-exams">{tx('লিখিত পরীক্ষা', 'Written exams')}</Link></Button>
            <Button asChild variant="outline" className="gap-2"><Link href="/dashboard/results">{tx('রেজাল্ট', 'Results')}</Link></Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const e = meta?.exam

  return (
    <div className="space-y-4">
      {/* sticky timer bar */}
      <div className={`sticky top-[4.25rem] z-30 flex flex-wrap items-center gap-3 rounded-2xl border p-3.5 shadow-sm backdrop-blur-lg lg:top-16 ${danger ? 'border-rose-500/40 bg-rose-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${danger ? 'bg-rose-500/15 text-rose-600' : 'bg-emerald-500/15 text-emerald-600'}`}>
          <Timer className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {locked ? tx('সময় শেষ', 'Time over') : tx('বাকি সময় (সার্ভার ঘড়ি)', 'Time remaining (server clock)')}
          </p>
          <p className={`text-2xl font-black tabular-nums leading-none ${danger ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
            {clock ?? '--:--'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary" className="gap-1"><ImageIcon className="h-3 w-3" />{digitsBn(images.length)} {tx('ছবি', 'photos')}</Badge>
          {!locked && images.length > 0 && (
            <Button size="sm" className="gap-1.5 rounded-xl shadow-md" onClick={() => setSubmitConfirm(true)} disabled={submitting}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {tx('জমা দিন', 'Submit')}
            </Button>
          )}
        </div>
        {danger && !locked && (
          <p className="w-full text-xs font-semibold text-rose-600">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            {tx('সময় প্রায় শেষ — দ্রুত ছবিগুলো আপলোড করে জমা দিন।', 'Almost out of time — upload and submit quickly.')}
          </p>
        )}
      </div>

      {locked && !submittedDone && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm font-semibold text-amber-800 dark:text-amber-200">
          <Lock className="h-4 w-4 shrink-0" />
          {tx('সময় শেষ — আর নতুন ছবি যোগ বা পরিবর্তন করা যাবে না।', 'Time is over — no more uploads or changes are allowed.')}
        </div>
      )}

      {/* exam title + question */}
      {e && (
        <Card>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-lg font-extrabold leading-snug">{e.title}</h1>
              <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />{digitsBn(e.durationMin)} {tx('মিনিট', 'min')}</Badge>
            </div>
            {e.instructions && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <p className="whitespace-pre-wrap leading-relaxed text-amber-900 dark:text-amber-200">{e.instructions}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {e.questionPdfUrl && (
                <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" asChild>
                  <a href={`/api/exams/${examId}/question-file?pdf=1`} target="_blank" rel="noreferrer">
                    <PdfFileIcon className="h-3.5 w-3.5" />{tx('প্রশ্নপত্র PDF খুলুন', 'Open question PDF')}
                  </a>
                </Button>
              )}
              {e.questionImages.map((_, i) => (
                <Button key={i} size="sm" variant="outline" className="gap-1.5 rounded-xl" asChild>
                  <a href={`/api/exams/${examId}/question-file?index=${i}`} target="_blank" rel="noreferrer">
                    <ImageIcon className="h-3.5 w-3.5" />{tx('প্রশ্ন', 'Q')} {digitsBn(i + 1)}
                  </a>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* upload controls */}
      {!locked && (
        <Card>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <h2 className="text-sm font-bold">{tx('খাতার ছবি আপলোড করুন', 'Upload your answer sheets')}</h2>
            <p className="text-xs text-muted-foreground">
              {tx('প্রতিটি পৃষ্ঠার স্পষ্ট ছবি তুলুন — যত বড়/উচ্চ-রেজোলিউশন ছবিই হোক আপলোড হবে (সর্বোচ্চ 40MB/ছবি)।', 'Capture each page clearly — any size/high-resolution photo uploads fine (40MB max each).')}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                ref={camRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={(ev) => void handleFiles(Array.from(ev.target.files ?? []))}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(ev) => void handleFiles(Array.from(ev.target.files ?? []))}
              />
              <Button
                size="lg"
                className="h-14 gap-2 rounded-xl text-base shadow-md"
                onClick={() => camRef.current?.click()}
                disabled={Boolean(uploading)}
              >
                <Camera className="h-5 w-5" />{tx('ছবি তুলুন', 'Take photo')}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 gap-2 rounded-xl text-base"
                onClick={() => fileRef.current?.click()}
                disabled={Boolean(uploading)}
              >
                <Upload className="h-5 w-5" />{tx('গ্যালারি থেকে দিন', 'Choose image')}
              </Button>
            </div>
            {uploading && (
              <div className="space-y-1.5 rounded-xl border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-semibold">{uploading.name}</span>
                  <span className="font-bold tabular-nums">{lang === 'bn' ? digitsBn(uploading.pct) : uploading.pct}%</span>
                </div>
                <Progress value={uploading.pct} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* uploaded grid */}
      {images.length > 0 && (
        <Card>
          <CardContent className="p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-bold">
              {tx('আপলোড হওয়া উত্তরপত্র', 'Uploaded answer sheets')} ({digitsBn(images.length)})
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {images.map((img, i) => (
                <div key={img.id} className="group relative overflow-hidden rounded-xl border">
                  { }
                  <img src={img.url} alt={`উত্তরপত্র ${i + 1}`} className="aspect-[3/4] w-full bg-muted object-cover" />
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{digitsBn(i + 1)}</span>
                  {!locked && (
                    <button
                      type="button"
                      aria-label={tx('মুছুন', 'Delete')}
                      onClick={() => void removeImage(img)}
                      className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white opacity-90 transition hover:bg-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* submit confirm */}
      <AlertDialog open={submitConfirm} onOpenChange={setSubmitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('আপনি কি নিশ্চিত পরীক্ষা জমা দিতে চান?', 'Are you sure you want to submit your exam?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `${digitsBn(images.length)} টি ছবি জমা হবে। জমার পর আর কোনো পরিবর্তন করা যাবে না।`,
                `${images.length} photo(s) will be submitted. No changes can be made afterwards.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tx('না, ফিরে যান', 'No, go back')}</AlertDialogCancel>
            <AlertDialogAction className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setSubmitConfirm(false); void doSubmit(false) }} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {tx('হ্যাঁ, জমা দিন', 'Yes, submit')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => go(`/dashboard/written-exams/${examId}`)}>
        <ArrowLeft className="h-4 w-4" />{tx('বিস্তারিত পেজে ফিরুন', 'Back to details')}
      </Button>
    </div>
  )
}

/** Client-side one-time shrink for photos above the 40MB safety cap. */
async function shrinkImage(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const maxDim = 4096
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
    if (!blob) return null
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return null
  }
}

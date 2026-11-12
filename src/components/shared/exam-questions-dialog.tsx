'use client'

/**
 * ExamQuestionsDialog — the shared "প্রশ্ন দেখুন" viewer for WRITTEN exam
 * question media. Mirrors SuggestionPreviewDialog's UX — one
 * dialog, four states:
 *
 * 1. loading — skeleton while the manifest loads ("প্রশ্ন লোড হচ্ছে…").
 * 2. locked  — 401/403 from the server: Lock icon + bilingual message,
 *              guests get a Login CTA (next=/exams).
 * 3. empty   — the exam has no question PDF/images yet.
 * 4. preview — PDF in an iframe / images stacked, footer hint + primary
 *              ডাউনলোড button that auto-downloads in place via
 *              window.location.assign(?download=1) — the media itself is
 *              streamed by the GATED question-file route (login + purchase
 *              enforced server-side, never leaked to non-owners).
 *
 * Used by the public /exams cards (purchased paid exams + free exams).
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, Download, Eye, FileQuestion, Loader2, Lock, LogIn } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet } from '@/lib/api-client'

interface QuestionsData {
  title: string
  isFree: boolean
  durationMin: number
  hasQuestions: boolean
  pdf: { url: string; name: string | null } | null
  images: { url: string; name: string | null }[]
}

interface ExamQuestionsDialogProps {
  examId: string
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Mode = 'loading' | 'locked' | 'error' | 'empty' | 'pdf' | 'images'

export default function ExamQuestionsDialog({
  examId,
  title,
  open,
  onOpenChange,
}: ExamQuestionsDialogProps) {
  const { tx, t } = useUI()
  const { user } = useAuth()
  // Which exam id finished loading — avoids setState-in-effect and resets
  // automatically whenever a different exam is previewed (same idiom as the
  // suggestion preview dialog's loadedId).
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [data, setData] = useState<QuestionsData | null>(null)
  const [err, setErr] = useState('')
  // iframe render flag (PDF only) — drives the skeleton overlay
  const [frameReady, setFrameReady] = useState(false)

  useEffect(() => {
    if (!open || !examId || loadedId === examId) return
    let alive = true
    apiGet<QuestionsData>(`/api/written-exams/${examId}/questions`)
      .then((d) => {
        if (!alive) return
        setData(d)
        setErr('')
        setLoadedId(examId)
      })
      .catch((e: Error) => {
        if (!alive) return
        setErr(e.message || tx('প্রশ্ন লোড করা যায়নি — আবার চেষ্টা করুন।', 'Could not load questions — please retry.'))
        setLoadedId(examId)
      })
    return () => {
      alive = false
    }
  }, [open, examId, loadedId, tx])

  if (!examId) return null

  const loaded = loadedId === examId
  const lockedError = Boolean(err && /লগইন|কেনা|Login required|Purchase required/i.test(err))
  const mode: Mode = !loaded
    ? 'loading'
    : err
      ? lockedError
        ? 'locked'
        : 'error'
      : !data || !data.hasQuestions
        ? 'empty'
        : data.pdf
          ? 'pdf'
          : 'images'

  const fileUrl = (u: string) =>
    `/api/written-exams/${examId}/question-file?url=${encodeURIComponent(u)}`
  const fileDownloadUrl = (u: string) => `${fileUrl(u)}&download=1`

  // Single footer download target: the PDF, or the only image (multiple
  // images get per-image download buttons instead).
  const primaryDownload =
    data?.pdf ?? (data && data.images.length === 1 ? data.images[0] : null)

  /** Footer ডাউনলোড — সেখান থেকেই auto download শুরু (পেজ থেমে থাকে)। */
  const downloadNow = () => {
    if (!primaryDownload) return
    window.location.assign(fileDownloadUrl(primaryDownload.url))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader className="shrink-0 space-y-1.5 pr-6 text-left">
          <DialogTitle className="line-clamp-2 text-lg leading-snug sm:text-xl">{title}</DialogTitle>
          <DialogDescription className="line-clamp-2 text-sm leading-relaxed">
            {tx('পরীক্ষার প্রশ্ন — PDF বা ছবি', 'Exam questions — PDF or images')}
          </DialogDescription>
          {loaded && !err && data && (
            <div className="flex flex-wrap items-center gap-1.5">
              {data.isFree ? (
                <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  {t('free')}
                </Badge>
              ) : (
                <Badge className="border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                  {tx('পেইড', 'Paid')}
                </Badge>
              )}
              <Badge variant="secondary" className="text-[11px]">
                {data.durationMin} {tx('মিনিট', 'min')}
              </Badge>
              {data.pdf?.name && (
                <span className="max-w-[220px] truncate font-mono text-[11px] text-muted-foreground sm:max-w-xs">
                  {data.pdf.name}
                </span>
              )}
              {!data.pdf && data.images.length > 0 && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {data.images.length} {tx('টি ছবি', 'image(s)')}
                </span>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {mode === 'loading' && (
            <div className="flex flex-col items-center justify-center gap-3 py-6">
              <Skeleton className="h-[52vh] w-full rounded-xl" />
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {tx('প্রশ্ন লোড হচ্ছে…', 'Loading questions…')}
              </p>
            </div>
          )}

          {mode === 'locked' && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300">
                <Lock className="h-6 w-6" aria-hidden />
              </span>
              <p className="max-w-sm text-sm text-muted-foreground">{err}</p>
              {!user && (
                <Button
                  className="gap-2"
                  onClick={() => {
                    onOpenChange(false)
                    go('/login?next=/exams')
                  }}
                >
                  <LogIn className="h-4 w-4" aria-hidden />
                  {t('login')}
                </Button>
              )}
            </div>
          )}

          {mode === 'error' && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
                <AlertTriangle className="h-6 w-6" aria-hidden />
              </span>
              <p className="max-w-sm text-sm text-muted-foreground">{err}</p>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setErr('')
                  setLoadedId(null) // refetch on retry click (not in an effect)
                }}
              >
                {t('retry')}
              </Button>
            </div>
          )}

          {mode === 'empty' && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FileQuestion className="h-6 w-6" aria-hidden />
              </span>
              <p className="text-sm text-muted-foreground">
                {tx('এই পরীক্ষায় এখনো প্রশ্ন যোগ করা হয়েছেনি।', 'No questions have been added to this exam yet.')}
              </p>
            </div>
          )}

          {mode === 'pdf' && data?.pdf && (
            <div className="relative">
              {!frameReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <Skeleton className="h-48 w-full rounded-xl" />
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {tx('প্রশ্ন লোড হচ্ছে…', 'Loading questions…')}
                  </p>
                </div>
              )}
              <iframe
                src={fileUrl(data.pdf.url)}
                title={`${title} — ${tx('প্রশ্ন', 'questions')}`}
                onLoad={() => setFrameReady(true)}
                className="h-[68vh] w-full rounded-lg border bg-white"
              />
            </div>
          )}

          {mode === 'images' && data && (
            <div className="space-y-3">
              {data.images.map((img, idx) => (
                <figure key={img.url} className="relative overflow-hidden rounded-lg border bg-muted/30">
                  <img
                    src={fileUrl(img.url)}
                    alt={img.name || `${title} — ${tx('প্রশ্ন', 'question')} ${idx + 1}`}
                    loading="lazy"
                    className="w-full object-contain"
                  />
                  {data.images.length > 1 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="absolute right-2 top-2 h-8 w-8 shadow-md"
                      aria-label={`${t('download')} — ${img.name || `${tx('প্রশ্ন', 'question')} ${idx + 1}`}`}
                      onClick={() => window.location.assign(fileDownloadUrl(img.url))}
                    >
                      <Download className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </figure>
              ))}
            </div>
          )}
        </div>

        {loaded && !err && data?.hasQuestions && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              {tx('প্রশ্ন প্রিভিউ', 'Question preview')}
            </p>
            {primaryDownload && (
              <Button size="sm" className="gap-1.5" onClick={downloadNow} aria-label={`${t('download')}: ${title}`}>
                <Download className="h-4 w-4" aria-hidden />
                {t('download')}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

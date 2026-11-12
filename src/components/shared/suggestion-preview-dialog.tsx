'use client'

/**
 * SuggestionPreviewDialog — the shared "প্রিভিউ" viewer for study materials
 * One dialog, three states:
 *
 * 1. preview  — free / already-owned paid materials render inline (PDF
 *               viewer / image) via /api/suggestions/[id]/preview.
 * 2. locked   — unpaid paid materials show a clear bilingual notice with a
 *               Login or Buy CTA (server enforces the same rule — no leak).
 * 3. no-file  — the material has no file yet ("coming soon").
 *
 * Used by the public /suggestions cards and the student dashboard
 * "আমার সাজেশন" section.
 */

import { useState } from 'react'
import { Download, Eye, ExternalLink, Loader2, Lock, ShoppingBag, FileQuestion } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useUI, go } from '@/store/ui-store'
import { fmtBDT, fmtDate } from '@/lib/format'

export interface PreviewSuggestion {
  id: string
  title: string
  description?: string | null
  category?: string
  isFree: boolean
  price?: number | null
  fileName?: string | null
  fileType?: string | null
  fileSize?: number | null
  hasFile: boolean
  purchased?: boolean
  createdAt?: string | null
}

interface SuggestionPreviewDialogProps {
  item: PreviewSuggestion | null
  open: boolean
  onOpenChange: (open: boolean) => void
  loggedIn: boolean
}

export default function SuggestionPreviewDialog({
  item,
  open,
  onOpenChange,
  loggedIn,
}: SuggestionPreviewDialogProps) {
  const { t, tx, lang } = useUI()
  // Which item id finished loading — avoids setState-in-effect and resets
  // automatically whenever a different suggestion is previewed.
  const [loadedId, setLoadedId] = useState<string | null>(null)

  if (!item) return null

  const canPreview = Boolean(item.hasFile) && (item.isFree || Boolean(item.purchased))
  const mode: 'preview' | 'locked' | 'no-file' = !item.hasFile
    ? 'no-file'
    : canPreview
      ? 'preview'
      : 'locked'
  const previewUrl = `/api/suggestions/${item.id}/preview`
  const downloadUrl = `/api/suggestions/${item.id}/download`
  const isImage = Boolean(item.fileType?.startsWith('image/'))
  const frameLoaded = loadedId === item.id

  /** Footer ডাউনলোড — সেখান থেকেই auto download শুরু (পেজ থেমে থাকে)। */
  const downloadNow = () => {
    window.location.assign(downloadUrl)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader className="shrink-0 space-y-1.5 pr-6 text-left">
          <DialogTitle className="line-clamp-2 text-lg leading-snug sm:text-xl">{item.title}</DialogTitle>
          <DialogDescription className="line-clamp-2 text-sm leading-relaxed">
            {item.description || item.fileName || tx('সাজেশন প্রিভিউ', 'Suggestion preview')}
          </DialogDescription>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {item.category && (
                <Badge variant="secondary" className="text-[11px]">
                  {item.category}
                </Badge>
              )}
              {item.isFree ? (
                <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  {t('free')}
                </Badge>
              ) : (
                <Badge className="border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                  {fmtBDT(item.price ?? 0, lang)}
                </Badge>
              )}
              {item.fileName && (
                <span className="max-w-[220px] truncate font-mono text-[11px] text-muted-foreground sm:max-w-xs">
                  {item.fileName}
                  {item.fileSize ? ` · ${Math.max(1, Math.round(item.fileSize / 1024))} KB` : ''}
                </span>
              )}
            </div>
            {item.createdAt && (
              <span className="text-xs text-muted-foreground">
                {tx('আপলোড', 'Uploaded')}: {fmtDate(item.createdAt, lang)}
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {mode === 'preview' ? (
            <div className="relative">
              {!frameLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <Skeleton className="h-48 w-full rounded-xl" />
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {tx('প্রিভিউ লোড হচ্ছে…', 'Loading preview…')}
                  </p>
                </div>
              )}
              {isImage ? (
                <img
                  src={previewUrl}
                  alt={`${item.title} — ${tx('প্রিভিউ', 'preview')}`}
                  onLoad={() => setLoadedId(item.id)}
                  onError={() => setLoadedId(item.id)}
                  className="mx-auto max-h-[68vh] w-auto rounded-lg border object-contain"
                />
              ) : (
                <iframe
                  src={previewUrl}
                  title={`${item.title} — ${tx('প্রিভিউ', 'preview')}`}
                  onLoad={() => setLoadedId(item.id)}
                  className="h-[68vh] w-full rounded-lg border bg-white"
                />
              )}
            </div>
          ) : mode === 'locked' ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300">
                <Lock className="h-6 w-6" aria-hidden />
              </span>
              {loggedIn ? (
                <>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {tx(
                      'এটি একটি পেইড সাজেশন — কেনার পর সম্পূর্ণ প্রিভিউ ও ডাউনলোড আনলক হবে।',
                      'This is a paid suggestion — buy it to unlock the full preview and download.',
                    )}
                  </p>
                  <Button
                    className="gap-2"
                    onClick={() => {
                      onOpenChange(false)
                      go(`/checkout/suggestion/${item.id}`)
                    }}
                  >
                    <ShoppingBag className="h-4 w-4" aria-hidden />
                    {tx('এখনই কিনুন', 'Buy now')} · {fmtBDT(item.price ?? 0, lang)}
                  </Button>
                </>
              ) : (
                <>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {tx(
                      'প্রিভিউ দেখতে ওয়েবসাইটে লগইন করুন — পেইড সাজেশন কেনার পর সম্পূর্ণ প্রিভিউ ও ডাউনলোড আনলক হবে।',
                      'Log in to preview — buying a paid suggestion unlocks the full preview and download.',
                    )}
                  </p>
                  <Button
                    className="gap-2"
                    onClick={() => {
                      onOpenChange(false)
                      go(`/login?next=/suggestions`)
                    }}
                  >
                    {t('login')}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FileQuestion className="h-6 w-6" aria-hidden />
              </span>
              <p className="text-sm text-muted-foreground">
                {tx('ফাইলটি শীঘ্রই যোগ করা হবে', 'The file will be added soon')}
              </p>
            </div>
          )}
        </div>

        {mode === 'preview' && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              {tx('ডাউনলোডের আগে প্রিভিউ', 'Preview before download')}
            </p>
            <div className="flex items-center gap-2">
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                {tx('নতুন ট্যাবে খুলুন', 'Open in new tab')}
              </a>
              <Button size="sm" className="gap-1.5" onClick={downloadNow} aria-label={`${t('download')}: ${item.title}`}>
                <Download className="h-4 w-4" aria-hidden />
                {t('download')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

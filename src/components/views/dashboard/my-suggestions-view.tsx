'use client'

/**
 * MySuggestionsView — the student's suggestion library ("আমার সাজেশন").
 * purchased (SUCCESS) paid suggestions AND all free suggestions
 * appear here while logged in — each with a প্রিভিউ (preview) viewer and a
 * download button. Pending/manual-review purchases show their live status.
 * Data: GET /api/purchases + GET /api/suggestions.
 */
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Eye, Loader2, ShoppingBag } from 'lucide-react'
import SuggestionPreviewDialog, {
  type PreviewSuggestion,
} from '@/components/shared/suggestion-preview-dialog'
import { PdfFileIcon } from '@/components/shared/pdf-file-icon'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeading } from '@/components/shared/section-heading'
import { useUI } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet } from '@/lib/api-client'
import { fmtBDT, fmtDate, digitsBn } from '@/lib/format'
import { go } from '@/store/ui-store'

interface PurchaseRow {
  id: string
  amount: number
  method: string
  status: string // PENDING | SUCCESS | FAILED
  trxId: string
  invoiceNo: string | null
  payStatus: string // NONE | SUBMITTED | APPROVED | REJECTED
  adminNote: string | null
  createdAt: string
  suggestion: {
    id: string
    title: string
    description: string
    category: string
    fileName: string | null
    fileType?: string | null
    fileSize: number | null
    hasFile?: boolean
    createdAt?: string | null
  }
}

interface FreeSuggestion {
  id: string
  title: string
  description: string
  category: string
  isFree: boolean
  price: number
  fileName?: string | null
  fileType?: string | null
  fileSize?: number | null
  downloads: number
  hasFile: boolean
  createdAt?: string | null
}

export default function MySuggestionsView() {
  const { t, tx, lang } = useUI()
  const { user } = useAuth()
  const [purchases, setPurchases] = useState<PurchaseRow[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // ফ্রি সাজেশন — viewable/downloadable while logged in
  const [freeItems, setFreeItems] = useState<FreeSuggestion[] | null>(null)

  // প্রিভিউ dialog state
  const [previewItem, setPreviewItem] = useState<PreviewSuggestion | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiGet<{ purchases: PurchaseRow[] }>('/api/purchases')
      setPurchases(Array.isArray(data?.purchases) ? data.purchases : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
    }
    // Free suggestions load independently — a purchase-endpoint failure
    // must not hide the free library.
    try {
      const all = await apiGet<FreeSuggestion[]>('/api/suggestions')
      setFreeItems((Array.isArray(all) ? all : []).filter((s) => s.isFree && s.hasFile))
    } catch {
      setFreeItems([])
    }
  }, [t])

  useEffect(() => {
    if (user) void load()
  }, [user, load])

  const download = (id: string) => {
    if (!id) return
    window.location.assign(`/api/suggestions/${id}/download`)
  }

  const openOwnedPreview = (p: PurchaseRow) => {
    if (!p.suggestion) return
    setPreviewItem({
      id: p.suggestion.id,
      title: p.suggestion.title,
      description: p.suggestion.description,
      category: p.suggestion.category,
      isFree: false,
      price: p.amount,
      fileName: p.suggestion.fileName,
      fileType: p.suggestion.fileType,
      fileSize: p.suggestion.fileSize,
      hasFile: p.suggestion.hasFile ?? true,
      purchased: true,
      createdAt: p.suggestion.createdAt,
    })
    setPreviewOpen(true)
  }

  const openFreePreview = (s: FreeSuggestion) => {
    setPreviewItem({ ...s, purchased: false })
    setPreviewOpen(true)
  }

  const owned = (purchases ?? []).filter((p) => p.status === 'SUCCESS')
  const others = (purchases ?? []).filter((p) => p.status !== 'SUCCESS')

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <SectionHeading
        title={tx('আমার সাজেশন', 'My Suggestions')}
        subtitle={tx(
          'কেনা সাজেশন যেকোনো সময় প্রিভিউ ও ডাউনলোড করুন — ফ্রি সাজেশনগুলোও এখানেই পাবেন।',
          'Preview & download your purchased suggestions anytime — free suggestions live here too.',
        )}
      />

      {purchases === null && !error ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title={t('error')} description={error} actionLabel={t('retry')} onAction={() => void load()} />
      ) : (
        <div className="space-y-8">
          {purchases!.length === 0 && (
            <EmptyState
              icon={<ShoppingBag className="h-7 w-7" aria-hidden />}
              title={tx('এখনো কোনো সাজেশন কেনা হয়নি', 'No suggestions purchased yet')}
              description={tx(
                'সাজেশনস পেজ থেকে পছন্দের পেইড সাজেশন কিনে নিন — ফ্রি সাজেশনগুলো নিচেই দেখা যাচ্ছে।',
                'Buy a paid suggestion from the Suggestions page — free suggestions are listed below.',
              )}
              actionLabel={tx('সাজেশনস দেখুন', 'Browse suggestions')}
              onAction={() => go('/suggestions')}
            />
          )}

          {/* Owned → preview + download cards */}
          {owned.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {owned.map((p, i) => (
                <motion.article
                  key={p.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 6) * 0.04 }}
                  className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <PdfFileIcon className="h-5 w-5" aria-hidden />
                    </span>
                    <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      {tx('কেনা হয়েছে', 'Owned')}
                    </Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 font-semibold leading-snug">{p.suggestion?.title}</h3>
                    {p.suggestion?.fileName && (
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                        {p.suggestion.fileName}
                        {p.suggestion.fileSize ? ` · ${Math.max(1, Math.round(p.suggestion.fileSize / 1024))} KB` : ''}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fmtDate(p.createdAt, lang)} · {p.method} · {fmtBDT(p.amount, lang)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button className="min-w-0 flex-1 gap-2" onClick={() => download(p.suggestion?.id ?? '')}>
                      <Download className="h-4 w-4" aria-hidden />
                      {t('download')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => openOwnedPreview(p)}
                      aria-label={`${tx('প্রিভিউ', 'Preview')}: ${p.suggestion?.title ?? ''}`}
                      title={tx('প্রিভিউ', 'Preview')}
                    >
                      <Eye className="h-4 w-4" aria-hidden />
                      <span className="hidden sm:inline">{tx('প্রিভিউ', 'Preview')}</span>
                    </Button>
                  </div>
                </motion.article>
              ))}
            </div>
          )}

          {/* Pending / submitted */}
          {others.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                {tx('প্রসেসিং ক্রয়', 'Processing purchases')}
              </h2>
              <div className="space-y-2">
                {others.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.suggestion?.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.invoiceNo ? `${p.invoiceNo} · ` : ''}
                        {fmtDate(p.createdAt, lang)}
                        {p.adminNote ? ` · ${p.adminNote}` : ''}
                      </p>
                    </div>
                    <Badge
                      className={
                        p.payStatus === 'SUBMITTED'
                          ? 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                          : 'border-transparent bg-secondary text-secondary-foreground'
                      }
                    >
                      {p.payStatus === 'SUBMITTED'
                        ? tx('যাচাই চলছে', 'Under review')
                        : p.status === 'FAILED'
                          ? tx('ব্যর্থ', 'Failed')
                          : tx('পেমেন্ট বাকি', 'Payment pending')}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ফ্রি সাজেশন — free library ── */}
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {tx('ফ্রি সাজেশন', 'Free suggestions')}
              </h2>
              {freeItems !== null && freeItems.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {digitsBn(freeItems.length)}{tx('টি', ' item(s)')}
                </span>
              )}
            </div>
            {freeItems === null ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 rounded-2xl" />
                ))}
              </div>
            ) : freeItems.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                {tx('এখন কোনো ফ্রি সাজেশন নেই।', 'No free suggestions right now.')}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {freeItems.map((s, i) => (
                  <motion.article
                    key={s.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 6) * 0.03 }}
                    className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        <PdfFileIcon className="h-5 w-5" aria-hidden />
                      </span>
                      <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        {t('free')}
                      </Badge>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 font-semibold leading-snug">{s.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {s.category}
                        {s.fileName ? ` · ${Math.max(1, Math.round((s.fileSize ?? 1024) / 1024))} KB` : ''}
                        {' · '}
                        <Download className="inline h-3 w-3" aria-hidden /> {digitsBn(s.downloads)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="min-w-0 flex-1 gap-2"
                        onClick={() => download(s.id)}
                        aria-label={`${t('free_download')}: ${s.title}`}
                      >
                        <Download className="h-4 w-4" aria-hidden />
                        {t('free_download')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => openFreePreview(s)}
                        aria-label={`${tx('প্রিভিউ', 'Preview')}: ${s.title}`}
                        title={tx('প্রিভিউ', 'Preview')}
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                        <span className="hidden sm:inline">{tx('প্রিভিউ', 'Preview')}</span>
                      </Button>
                    </div>
                  </motion.article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        {loading && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
        {tx(
          `কেনা ${digitsBn(owned.length)}টি${freeItems ? ` · ফ্রি ${digitsBn(freeItems?.length ?? 0)}টি` : ''}`,
          `${owned.length} purchased${freeItems ? ` · ${freeItems.length} free` : ''}`,
        )}
      </p>

      {/* প্রিভিউ viewer — inline PDF/image viewer */}
      <SuggestionPreviewDialog
        item={previewItem}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        loggedIn={Boolean(user)}
      />
    </div>
  )
}

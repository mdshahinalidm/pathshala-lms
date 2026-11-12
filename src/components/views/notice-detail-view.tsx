'use client'

/**
 * NoticeDetailView — full view of a single notice, reached by clicking a
 * notice on the board (/notices), a marquee item, or a related-notice link.
 *
 * Shows the complete body, the attached image (if any), a copy-link action
 * and the latest other notices so the reader can keep browsing.
 */

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Download,
  ExternalLink,
  Link2,
  Megaphone,
} from 'lucide-react'
import { PdfFileIcon } from '@/components/shared/pdf-file-icon'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useUI } from '@/store/ui-store'
import { fmtDate, noticeTypeStyle } from '@/lib/format'
import { isFileUrl, pdfEmbedSrc } from '@/lib/video'

export interface NoticeDetailData {
  id: string
  title: string
  body: string
  type: 'URGENT' | 'GENERAL' | 'EVENT'
  isBanner?: boolean
  imageUrl?: string | null
  pdfUrl?: string | null
  pdfName?: string | null
  createdAt: string
}

export interface RelatedNotice {
  id: string
  title: string
  type: 'URGENT' | 'GENERAL' | 'EVENT'
  createdAt: string
}

const TYPE_LABEL: Record<NoticeDetailData['type'], [string, string]> = {
  URGENT: ['জরুরি', 'Urgent'],
  GENERAL: ['সাধারণ', 'General'],
  EVENT: ['ইভেন্ট', 'Event'],
}

export default function NoticeDetailView({
  notice,
  related,
}: {
  notice: NoticeDetailData
  related: RelatedNotice[]
}) {
  const { t, tx, lang } = useUI()
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      toast.success(tx('লিংক কপি হয়েছে', 'Link copied'))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(tx('কপি করা যায়নি', 'Could not copy'))
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-3.5 py-8 sm:py-10">
      {/* Breadcrumb / back */}
      <Link
        href="/notices"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {tx('সব নোটিশ', 'All notices')}
      </Link>

      <motion.article
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mt-4 overflow-hidden rounded-2xl border bg-card shadow-sm"
      >
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={noticeTypeStyle(notice.type)}>
              {tx(TYPE_LABEL[notice.type][0], TYPE_LABEL[notice.type][1])}
            </Badge>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {fmtDate(notice.createdAt, lang)}
            </span>
            {notice.isBanner && (
              <Badge variant="outline" className="text-primary">
                {tx('ব্যানার', 'Banner')}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={copyLink}
              className="ml-auto h-8 gap-1.5 text-xs text-muted-foreground"
              aria-label={tx('লিংক কপি করুন', 'Copy link')}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
              ) : (
                <Link2 className="h-3.5 w-3.5" aria-hidden />
              )}
              {copied ? tx('কপি হয়েছে', 'Copied') : tx('লিংক কপি', 'Copy link')}
            </Button>
          </div>

          <h1 className="mt-3 text-xl font-extrabold leading-snug sm:text-2xl">{notice.title}</h1>

          <div className="mt-4 h-px bg-border" aria-hidden />

          <div className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">
            {notice.body}
          </div>

          {/* Attached PDF — inline viewer + open/download (same-origin files
              hide the browser toolbar so OUR buttons are the only path). */}
          {notice.pdfUrl && (
            <div className="mt-5">
              <div className="h-[65vh] min-h-[380px] w-full overflow-hidden rounded-xl border bg-white">
                <iframe
                  src={isFileUrl(notice.pdfUrl) ? pdfEmbedSrc(notice.pdfUrl) : notice.pdfUrl}
                  title={notice.pdfName || notice.title}
                  className="h-full w-full"
                  loading="lazy"
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a href={notice.pdfUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <ExternalLink className="h-4 w-4" /> {tx('খুলুন', 'Open')}
                  </Button>
                </a>
                <a href={notice.pdfUrl} download={notice.pdfName || undefined}>
                  <Button size="sm" className="gap-1.5">
                    <Download className="h-4 w-4" /> {tx('ডাউনলোড', 'Download')}
                  </Button>
                </a>
                {notice.pdfName && (
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <PdfFileIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate">{notice.pdfName}</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {notice.imageUrl && (
          <div className="relative aspect-[21/9] w-full border-t">
            <Image
              src={notice.imageUrl}
              alt={notice.title}
              fill
              sizes="(max-width: 768px) 100vw, 896px"
              className="object-cover"
              priority
            />
          </div>
        )}
      </motion.article>

      {/* Related / latest notices — all clickable */}
      {related.length > 0 && (
        <section className="mt-8" aria-labelledby="related-notices">
          <h2 id="related-notices" className="text-base font-bold sm:text-lg">
            {tx('অন্যান্য নোটিশ', 'Other notices')}
          </h2>
          <ul className="mt-3 space-y-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/notices/${r.id}`}
                  className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-all hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary"
                    aria-hidden
                  >
                    <Megaphone className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold group-hover:text-primary">
                      {r.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {tx(TYPE_LABEL[r.type][0], TYPE_LABEL[r.type][1])} · {fmtDate(r.createdAt, lang)}
                    </span>
                  </span>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 text-center">
        <Button asChild variant="outline">
          <Link href="/notices">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {tx('নোটিশ বোর্ডে ফিরুন', 'Back to notice board')}
          </Link>
        </Button>
      </div>
    </div>
  )
}

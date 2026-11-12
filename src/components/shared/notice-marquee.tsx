'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Megaphone } from 'lucide-react'
import { apiGet } from '@/lib/api-client'
import { useUI } from '@/store/ui-store'
import { usePublicSettings } from '@/hooks/use-public-settings'

interface BannerNotice {
  id: string
  title: string
}

export function NoticeMarquee() {
  const { tx } = useUI()
  const settings = usePublicSettings()
  const [items, setItems] = useState<BannerNotice[]>([])

  useEffect(() => {
    apiGet<BannerNotice[]>('/api/notices?banner=1')
      .then(setItems)
      .catch(() => setItems([]))
  }, [])

  /** Master switch (Admin → Settings → Home page notice bar). */
  if (!settings.noticeBarEnabled) return null
  if (items.length === 0) return null
  const doubled = [...items, ...items]

  return (
    <div
      className="grad-brand animate-grad-pan relative flex items-center gap-3 overflow-hidden border-b py-2 text-white"
      role="marquee"
      aria-label={tx('নোটিশ', 'Notices')}
    >
      <span className="z-10 ml-4 hidden shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-0.5 text-xs font-bold sm:flex">
        <Megaphone className="h-3.5 w-3.5" />
        {tx('নোটিশ', 'NOTICE')}
      </span>
      <div className="flex w-max animate-marquee items-center gap-12 whitespace-nowrap px-4 text-sm">
        {doubled.map((n, i) => (
          <Link
            key={`${n.id}-${i}`}
            href={`/notices/${n.id}`}
            className="inline-flex items-center gap-2 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-1"
            aria-label={`${n.title} — ${tx('নোটিশ পড়ুন', 'Read notice')}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden />
            <span className="font-medium underline decoration-white/40 underline-offset-4 hover:decoration-white">
              {n.title}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

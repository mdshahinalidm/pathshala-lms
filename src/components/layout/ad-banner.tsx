'use client'

/**
 * AdBanner — the ONE site-wide advertisement slot.
 * Rendered by PublicShell between the page content and the footer, so it
 * appears on every public page exactly once without touching any view.
 *
 * Design: festive-gradient framed card that matches the site's existing
 * token system (grad-festive / rainbow-bar / animate-grad-pan). Bilingual
 * copy follows the active language via useUI().tx().
 *
 * The slot is a placeholder ("advertise with us") — when a real ad network
 * (e.g. AdSense) is configured later, only this component needs editing.
 * A dismiss (×) button keeps it non-intrusive; hidden for the session
 * after dismissal (sessionStorage, no persistence beyond the tab).
 */
import { useState } from 'react'
import Link from 'next/link'
import { Megaphone, X } from 'lucide-react'
import { useUI } from '@/store/ui-store'

const DISMISS_KEY = 'ps_ad_banner_dismissed'

export function AdBanner() {
  const { tx } = useUI()
  const [hidden, setHidden] = useState(false)

  // Skip render entirely once dismissed in this browser session.
  if (hidden) return null

  return (
    <aside aria-label={tx('বিজ্ঞাপন', 'Advertisement')} className="mx-auto w-full max-w-7xl px-3.5 pb-8 pt-2">
      <div className="relative overflow-hidden rounded-2xl p-[2px]">
        {/* Animated festive gradient frame */}
        <div aria-hidden className="grad-festive animate-grad-pan absolute inset-0" />
        <div className="relative flex w-full flex-col items-center gap-3 rounded-[14px] bg-background px-4 py-4 text-center sm:flex-row sm:justify-between sm:gap-4 sm:px-6 sm:text-left">
          {/* Label + copy */}
          <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
            <span className="grad-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md">
              <Megaphone className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground sm:justify-start">
                <span className="grad-festive animate-grad-pan rounded-full px-2 py-0.5 text-[9px] text-white">
                  {tx('স্পনসর্ড', 'Sponsored')}
                </span>
                {tx('বিজ্ঞাপন', 'Advertisement')}
              </p>
              <p className="mt-0.5 text-sm font-semibold leading-snug sm:text-base">
                {tx('আপনার বিজ্ঞাপনটি এখানে দিন — হাজারো শিক্ষার্থীর কাছে পৌঁছান', 'Place your ad here — reach thousands of learners')}
              </p>
            </div>
          </div>

          {/* CTA + dismiss */}
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/contact"
              className="grad-brand inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold text-white shadow transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tx('বিজ্ঞাপন দিন', 'Advertise with us')}
            </Link>
            <button
              type="button"
              onClick={() => {
                try { sessionStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* private mode */ }
                setHidden(true)
              }}
              aria-label={tx('বিজ্ঞাপন বন্ধ করুন', 'Dismiss advertisement')}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}

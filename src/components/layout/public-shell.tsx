'use client'

/**
 * PublicShell — site-wide chrome for all NON-admin pages:
 * SiteHeader (sticky) + content + SiteFooter (sticky bottom via mt-auto).
 * The student dashboard shell reuses the same header/footer so the whole
 * site feels like ONE app; /admin keeps its own dedicated admin shell.
 */
import { SiteHeader } from './site-header'
import { SiteFooter } from './site-footer'
import { BackToTop } from './back-to-top'
import { SitePopup } from './site-popup'
import { AdBanner } from './ad-banner'
import { NoticeMarquee } from '@/components/shared/notice-marquee'

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Top notice scroll-bar — ABOVE the header on every public page
          (matches the reference site: the marquee IS the top bar). */}
      <NoticeMarquee />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      {/* The single site-wide ad slot — between page content and footer. */}
      <AdBanner />
      <SiteFooter />
      <BackToTop />
      <SitePopup />
    </div>
  )
}

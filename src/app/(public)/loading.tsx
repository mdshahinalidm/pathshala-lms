/**
 * (public) route-group loading boundary — shows INSTANTLY inside the shell
 * (header/footer stay put) whenever a public page is compiling/fetching,
 * so navigation always feels immediate.
 *
 * the splash is ADMIN-CUSTOMIZABLE. This is a server component —
 * it reads the SiteSetting row directly (≈1ms SQLite read, try/catch → safe
 * defaults) and adds no client JS beyond what existed before:
 *  • preloaderEnabled=true  → splash with the admin logo (or the default
 *    graduation-cap mark) + admin text (or 'লোড হচ্ছে…') + the bouncing dots.
 *  • preloaderEnabled=false → a minimal dots-only spinner (no custom logo/text).
 */
import { GraduationCap } from 'lucide-react'
import { db } from '@/lib/db'

interface PreloaderConfig {
  enabled: boolean
  text: string
  logoUrl: string
}

/** Read the public preloader config; never throws (DB hiccup → defaults). */
async function loadPreloaderConfig(): Promise<PreloaderConfig> {
  try {
    const row = await db.siteSetting.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    })
    return {
      enabled: row.preloaderEnabled,
      text: row.preloaderText.trim(),
      logoUrl: row.preloaderLogoUrl.trim(),
    }
  } catch {
    return { enabled: true, text: '', logoUrl: '' }
  }
}

export default async function PublicLoading() {
  const pre = await loadPreloaderConfig()

  // Preloader OFF → previous minimal spinner, no custom splash at all.
  if (!pre.enabled) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center" role="status" aria-live="polite">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.3s]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-500 [animation-delay:-0.15s]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-amber-500" />
        </div>
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  return (
    <div className="flex min-h-[65vh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      {pre.logoUrl ? (
        // Admin-uploaded preloader logo — plain <img> (unoptimized by design).
        <img
          src={pre.logoUrl}
          alt=""
          width={72}
          height={72}
          className="animate-pulse object-contain"
        />
      ) : (
        <span className="grad-brand flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl text-white shadow-lg shadow-emerald-500/30">
          <GraduationCap className="h-7 w-7" />
        </span>
      )}
      <div className="flex items-center gap-1.5" aria-hidden>
        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.3s]" />
        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-500 [animation-delay:-0.15s]" />
        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-amber-500" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{pre.text || 'লোড হচ্ছে…'}</p>
      <span className="sr-only">Loading…</span>
    </div>
  )
}

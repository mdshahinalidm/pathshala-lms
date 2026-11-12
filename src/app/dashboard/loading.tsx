/**
 * (public) route-group loading boundary — shows INSTANTLY inside the shell
 * (header/footer stay put) whenever a public page is compiling/fetching,
 * so navigation always feels immediate.
 */
import { GraduationCap } from 'lucide-react'

export default function PublicLoading() {
  return (
    <div className="flex min-h-[65vh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <span className="grad-brand flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl text-white shadow-lg shadow-emerald-500/30">
        <GraduationCap className="h-7 w-7" />
      </span>
      <div className="flex items-center gap-1.5" aria-hidden>
        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.3s]" />
        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-500 [animation-delay:-0.15s]" />
        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-amber-500" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">লোড হচ্ছে…</p>
      <span className="sr-only">Loading…</span>
    </div>
  )
}

'use client'

/**
 * Route-level error boundary — production-grade resilience.
 * If a view ever throws while rendering, users see a friendly bilingual
 * screen with a Retry button instead of a raw crash. The NetworkGuard
 * (network-guard.tsx) covers async/network failures; this covers render
 * failures. Both together = "1000+ users, website never breaks".
 */
import { useEffect } from 'react'
import { AlertTriangle, Home, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log for diagnosis; never crash-loop the UI.
    console.error('[Route error boundary]', error)
  }, [error])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-8 w-8" />
      </span>
      <h1 className="text-xl font-bold sm:text-2xl">
        কিছু একটা সমস্যা হয়েছে
        <span className="mx-2 text-muted-foreground">·</span>
        <span className="text-muted-foreground">Something went wrong</span>
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        পেজটি লোড করতে সমস্যা হয়েছে। ইন্টারনেট সংযোগ ঠিক থাকলে নিচের বাটনে চাপ দিয়ে আবার চেষ্টা
        করুন — আপনার ডেটা নিরাপদ।
        <br />
        The page failed to load. Press retry below — your data is safe.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset} className="gap-2">
          <RefreshCcw className="h-4 w-4" /> আবার চেষ্টা করুন · Retry
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => (window.location.href = '/')}>
          <Home className="h-4 w-4" /> হোমপেজ · Home
        </Button>
      </div>
    </div>
  )
}

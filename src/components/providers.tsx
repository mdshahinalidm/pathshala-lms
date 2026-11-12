'use client'

import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import { useEffect } from 'react'
import { useAuth } from '@/store/auth-store'
import { UILangProvider } from '@/store/ui-store'
import type { Lang } from '@/lib/i18n'
import { NextRouterBridge } from '@/components/next-router-bridge'
import { RouteProgress } from '@/components/layout/route-progress'

export function Providers({ initialLang, children }: { initialLang: Lang; children: React.ReactNode }) {
  const fetchMe = useAuth((s) => s.fetchMe)

  useEffect(() => {
    // Fetch the session after mount. Language rehydration is handled by
    // <UILangProvider> (cookie-synced with the server — see ui-store), so
    // no post-mount localStorage flip is needed here anymore.
    fetchMe()
  }, [fetchMe])

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <UILangProvider initialLang={initialLang}>
        <RouteProgress />
        <NextRouterBridge />
        {children}
        <Toaster position="top-right" richColors closeButton />
      </UILangProvider>
    </ThemeProvider>
  )
}

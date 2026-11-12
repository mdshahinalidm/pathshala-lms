'use client'

/**
 * UI store — language (bn default) + REAL-PATH navigation helper.
 *
 * go() drives the Next.js App Router (pushState via useRouter), so every
 * URL is a real path like /courses, /dashboard, /admin/courses. The
 * argument stays backwards compatible: leading '#' is stripped.
 *
 * HYDRATION SAFETY (definitive fix for "Hydration failed — server rendered
 * text didn't match the client"):
 * The chosen language lives in a COOKIE (ps_lang) and the ROOT LAYOUT
 * (server) reads it per request, feeding it through LangContext. Server
 * HTML and the first client render therefore ALWAYS use the same language —
 * including late-hydrating Suspense boundaries (e.g. dev-compiled dynamic
 * pages). The previous approach (zustand + localStorage rehydrate after
 * mount) raced against boundaries that hydrate in a later React pass and
 * produced recoverable hydration errors on slow/streamed pages.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { dictionaries, type Lang } from '@/lib/i18n'

/* ── language cookie helpers ─────────────────────────────────────────── */

export const LANG_COOKIE = 'ps_lang'

export function readLangCookie(): Lang | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|;\s*)ps_lang=(bn|en)/)
  return m ? (m[1] as Lang) : null
}

export function writeLangCookie(lang: Lang) {
  if (typeof document === 'undefined') return
  document.cookie = `ps_lang=${lang}; path=/; max-age=31536000; samesite=lax`
}

/* ── public API (identical shape to the old zustand store) ───────────── */

export interface UIApi {
  lang: Lang
  setLang: (lang: Lang) => void
  toggleLang: () => void
  t: (key: string) => string
  tx: (bn: string, en: string) => string
}

function dict(lang: Lang, key: string): string {
  return (
    (dictionaries[lang] as Record<string, string>)[key] ??
    (dictionaries.en as Record<string, string>)[key] ??
    key
  )
}

const LangContext = createContext<UIApi | null>(null)

export function UILangProvider({ initialLang, children }: { initialLang: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  const value = useMemo<UIApi>(
    () => ({
      lang,
      setLang: (next) => {
        setLangState(next)
        writeLangCookie(next)
      },
      toggleLang: () => {
        const next: Lang = lang === 'bn' ? 'en' : 'bn'
        setLangState(next)
        writeLangCookie(next)
      },
      t: (key) => dict(lang, key),
      tx: (bn, en) => (lang === 'bn' ? bn : en),
    }),
    [lang]
  )

  /* One-time legacy migration: the previous build kept the choice in
   * localStorage ("pathshala-ui"). If the cookie is missing, adopt the
   * stored language, persist it to the cookie, and — when it differs from
   * what the server just rendered — reload once so SSR matches from now
   * on. Runs after mount → never causes a hydration mismatch itself. */
  useEffect(() => {
    if (readLangCookie()) return
    try {
      const raw = localStorage.getItem('pathshala-ui')
      const stored: Lang | undefined = raw ? JSON.parse(raw)?.state?.lang : undefined
      if (stored !== 'bn' && stored !== 'en') return
      writeLangCookie(stored)
      if (stored !== lang) window.location.reload()
    } catch {
      /* ignore corrupt entries */
    }
  }, [])

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

/** Same call sites as before: const { t, tx, lang, toggleLang } = useUI() */
export function useUI(): UIApi {
  return (
    useContext(LangContext) ?? {
      lang: 'bn',
      setLang: () => {},
      toggleLang: () => {},
      t: (key) => dict('bn', key),
      tx: (bn) => bn,
    }
  )
}

/* ── Next.js router bridge ─────────────────────────────────────────────
 * Providers mounts <NextRouterBridge/> which hands the App Router instance
 * to this module, letting `go()` calls (and stores outside React) perform
 * real client-side navigation.
 */
interface NextRouterLike {
  push: (url: string, options?: { scroll?: boolean }) => void
  replace: (url: string, options?: { scroll?: boolean }) => void
  refresh: () => void
}

let nextRouter: NextRouterLike | null = null

export function setNextRouter(router: NextRouterLike | null) {
  nextRouter = router
}

/** Normalize legacy "#/x" arguments into clean paths ("/x"). */
export function toPath(url: string): string {
  const stripped = url.startsWith('#') ? url.slice(1) : url
  return stripped === '' ? '/' : stripped
}

/** Navigate to a real path (e.g. go('/courses'), go('#/dashboard') → /dashboard). */
export function go(url: string) {
  if (typeof window === 'undefined') return
  const target = toPath(url)
  if (nextRouter) {
    nextRouter.push(target)
  } else {
    window.location.assign(target)
  }
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
}

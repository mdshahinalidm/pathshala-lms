'use client'

/**
 * UI store: language (bn default) + REAL-PATH navigation helper.
 *
 * go() used to mutate window.location.hash — it now drives the Next.js
 * App Router (pushState via useRouter), so every URL is a real path like
 * /courses, /dashboard, /admin/courses. The argument stays backwards
 * compatible: leading '#' is stripped automatically.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { dictionaries, type Lang } from '@/lib/i18n'

interface UIState {
  lang: Lang
  setLang: (lang: Lang) => void
  toggleLang: () => void
  t: (key: string) => string
  tx: (bn: string, en: string) => string
}

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      lang: 'bn',
      setLang: (lang) => set({ lang }),
      toggleLang: () => set({ lang: get().lang === 'bn' ? 'en' : 'bn' }),
      t: (key) => {
        const lang = get().lang
        const dict = dictionaries[lang] as Record<string, string>
        return dict[key] ?? (dictionaries.en as Record<string, string>)[key] ?? key
      },
      tx: (bnText, enText) => (get().lang === 'bn' ? bnText : enText),
    }),
    {
      name: 'pathshala-ui',
      // HYDRATION SAFETY (fixes "Hydration failed — server rendered text
      // didn't match the client"): the server always renders the 'bn'
      // default. If localStorage were rehydrated during store creation, the
      // FIRST client render would already carry the persisted 'en' → every
      // language-dependent string mismatches and React recovers by
      // regenerating the tree (the recoverable-error overlay users saw).
      // skipHydration keeps the first render identical to the server;
      // Providers rehydrates explicitly after mount instead.
      skipHydration: true,
    }
  )
)

/* ── Next.js router bridge ─────────────────────────────────────────────
 * Providers mounts <NextRouterBridge/> which hands the App Router instance
 * to this module, letting legacy `go()` calls (and zustand stores outside
 * React) perform real client-side navigation.
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

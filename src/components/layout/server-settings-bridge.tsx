'use client'

/**
 * ServerSettingsBridge — receives the PUBLIC settings subset read
 * by the ROOT LAYOUT (server component) and provides it through
 * PublicSettingsContext so every client consumer (hero variant, logos,
 * notice bar, popup, WhatsApp, stats) starts with the admin-selected state
 * in the very first paint.
 *
 * WHY: previously `usePublicSettings` began with EMPTY defaults
 * (heroVariant 'classic'), so with hero 2 selected the classic hero flashed
 * for a frame until /api/settings answered. With this bridge the SSR HTML
 * itself already carries the selected variant — nothing to flash, and the
 * first-paint network round-trip is gone (faster too).
 *
 * Values are plain strings/numbers/booleans picked from the same SiteSetting
 * row the API returns — never any secret field. `initial` null (DB hiccup)
 * renders children without a value and the hook falls back to its client
 * fetch, preserving the old behavior as a safety net.
 */

import type { PublicSettings } from '@/hooks/use-public-settings'
import { PublicSettingsContext } from '@/hooks/use-public-settings'

export function ServerSettingsBridge({
  initial,
  children,
}: {
  initial: PublicSettings | null
  children: React.ReactNode
}) {
  if (!initial) return <>{children}</>
  return <PublicSettingsContext.Provider value={initial}>{children}</PublicSettingsContext.Provider>
}

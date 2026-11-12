'use client'

/**
 * usePublicSettings — shared, cached fetch of PUBLIC site settings
 * (brand, social links, WhatsApp widget config, popup, notice bar, logos).
 * One network call per page load no matter how many components need it
 * (footer, popup, floating WhatsApp button). Secret fields are stripped
 * server-side.
 *
 * (ServerSettingsBridge): the ROOT LAYOUT reads the same public
 * subset on the server and provides it through PublicSettingsContext — so
 * every consumer starts with the admin-selected state in the very FIRST
 * paint (top notice bar, logos, popup, WhatsApp — no empty flash, no
 * first-paint round-trip). `usePublicSettings` prefers that context value
 * and skips the client fetch entirely; without the bridge the old
 * client-fetch behavior remains as the safety net.
 *
 * NOTE: the plain data shape/defaults live in '@/lib/public-settings' (a
 * neutral module) — server components must NOT import runtime values from
 * this 'use client' file (they'd receive client references, not data).
 */
import { createContext, useContext, useEffect, useState } from 'react'
import { apiGet } from '@/lib/api-client'
import {
  EMPTY_PUBLIC_SETTINGS,
  pickPublicSettings,
  type PublicSettings,
} from '@/lib/public-settings'

export type { PublicSettings }
export { EMPTY_PUBLIC_SETTINGS }

/** Server-provided settings (root layout → ServerSettingsBridge). */
export const PublicSettingsContext = createContext<PublicSettings | null>(null)

let cache: PublicSettings | null = null
let inflight: Promise<PublicSettings> | null = null

async function fetchSettings(): Promise<PublicSettings> {
  if (cache) return cache
  if (!inflight) {
    inflight = apiGet<Record<string, unknown>>('/api/settings')
      .then((data) => {
        const merged = pickPublicSettings(data)
        cache = merged
        inflight = null
        return merged
      })
      .catch(() => {
        inflight = null
        return EMPTY_PUBLIC_SETTINGS
      })
  }
  return inflight
}

export function usePublicSettings(): PublicSettings {
  const serverValue = useContext(PublicSettingsContext)
  const [settings, setSettings] = useState<PublicSettings>(
    serverValue ?? cache ?? EMPTY_PUBLIC_SETTINGS
  )
  useEffect(() => {
    // Server already delivered the full public subset — share it with the
    // module cache and skip the network entirely.
    if (serverValue) {
      cache = serverValue
      return
    }
    void fetchSettings().then(setSettings)
  }, [serverValue])
  return settings
}

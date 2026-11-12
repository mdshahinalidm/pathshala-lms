/**
 * PUBLIC site-settings shape + defaults + a safe row→object picker.
 *
 * This module is deliberately NEUTRAL (no 'use client' directive, no React):
 * both server components (root layout) and client components (the
 * usePublicSettings hook) import it. Keep anything React-related (context,
 * hooks) in src/hooks/use-public-settings.ts — importing RUNTIME values from
 * a 'use client' file into a server component would yield a client reference
 * (spread → {}) instead of the real data.
 */

export interface PublicSettings {
  brandName: string
  facebookUrl: string
  instagramUrl: string
  youtubeUrl: string
  linkedinUrl: string
  twitterUrl: string
  tiktokUrl: string
  whatsappNumber: string
  whatsappEnabled: boolean
  whatsappMessage: string
  popupActive: boolean
  popupTitle: string
  popupMessage: string
  popupImageUrl: string
  popupImageLink: string
  popupButtonText: string
  popupButtonUrl: string
  footerCopyrightBn: string
  footerCopyrightEn: string
  noticeBarEnabled: boolean
  supportPhone: string
  supportEmail: string
  address: string
  invoiceNote: string
  // ── Branding: logos & favicon — uploaded from Admin → Settings.
  // Empty URL = keep the built-in GraduationCap mark.
  headerLogoUrl: string
  headerLogoHeight: number
  footerLogoUrl: string
  footerLogoHeight: number
  loginLogoUrl: string
  loginLogoHeight: number
  faviconUrl: string
  faviconSize: number
  // ── Preloader (loading screen) public-safe so the loading
  // boundaries / client splash can render the admin-selected state.
  preloaderEnabled: boolean
  preloaderText: string
  preloaderLogoUrl: string
  // ── Login/registration option toggles: show/hide the OTP
  // options on the public login & register pages.
  otpLoginEnabled: boolean
  otpRegisterEnabled: boolean
  // ── Header menu / Footer customization JSON. Empty = built-in
  // defaults render exactly as before (see lib/nav-config.ts).
  headerMenuConfig: string
  footerConfig: string
}

export const EMPTY_PUBLIC_SETTINGS: PublicSettings = {
  brandName: '',
  facebookUrl: '',
  instagramUrl: '',
  youtubeUrl: '',
  linkedinUrl: '',
  twitterUrl: '',
  tiktokUrl: '',
  whatsappNumber: '',
  whatsappEnabled: false,
  whatsappMessage: '',
  popupActive: false,
  popupTitle: '',
  popupMessage: '',
  popupImageUrl: '',
  popupImageLink: '',
  popupButtonText: '',
  popupButtonUrl: '',
  footerCopyrightBn: '',
  footerCopyrightEn: '',
  noticeBarEnabled: true,
  supportPhone: '',
  supportEmail: '',
  address: '',
  invoiceNote: '',
  headerLogoUrl: '',
  headerLogoHeight: 40,
  footerLogoUrl: '',
  footerLogoHeight: 40,
  loginLogoUrl: '',
  loginLogoHeight: 48,
  faviconUrl: '',
  faviconSize: 64,
  preloaderEnabled: true,
  preloaderText: '',
  preloaderLogoUrl: '',
  otpLoginEnabled: true,
  otpRegisterEnabled: false,
  headerMenuConfig: '',
  footerConfig: '',
}

/**
 * Pick the known public fields off a raw settings row (DB row or API
 * payload). Unknown/secret fields are ignored; missing fields fall back to
 * the safe defaults above, so the result is ALWAYS a complete PublicSettings.
 */
export function pickPublicSettings(
  row: Record<string, unknown> | null | undefined
): PublicSettings {
  const merged: PublicSettings = { ...EMPTY_PUBLIC_SETTINGS }
  if (!row) return merged
  for (const key of Object.keys(EMPTY_PUBLIC_SETTINGS) as (keyof PublicSettings)[]) {
    const v = row[key]
    if (typeof v === 'string') (merged[key] as string) = v
    else if (typeof v === 'boolean') (merged[key] as boolean) = v
    else if (typeof v === 'number') (merged[key] as number) = v
  }
  return merged
}

'use client'

/**
 * SitePopup — global website popup (admin-configurable in Settings → Popup).
 * Shown on the visitor's FIRST page load (100% viewport, no scrolling needed)
 * when popupActive=true. Frequency-capped: once per 12h per browser
 * (localStorage `ps_popup_seen_at`). Fully responsive, mobile-friendly.
 *
 * the popup IMAGE itself is clickable — when popupImageLink is set,
 * clicking the image navigates there (internal routes in-app, external URLs
 * in a new tab). The buy/enroll button below keeps its own popupButtonUrl.
 */

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Image from 'next/image'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { go, useUI } from '@/store/ui-store'
import { usePublicSettings } from '@/hooks/use-public-settings'

const STORAGE_KEY = 'ps_popup_seen_at'
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

export function SitePopup() {
  const { tx } = useUI()
  const settings = usePublicSettings()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!settings.popupActive) return
    if (!settings.popupTitle.trim() && !settings.popupMessage.trim() && !settings.popupImageUrl.trim()) return
    let timer: number | undefined
    try {
      const seen = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0)
      if (Date.now() - seen < TWELVE_HOURS_MS) return
      timer = window.setTimeout(() => setOpen(true), 600)
    } catch {
      /* storage blocked → show once per page load */
      timer = window.setTimeout(() => setOpen(true), 600)
    }
    return () => window.clearTimeout(timer)
  }, [settings.popupActive, settings.popupTitle, settings.popupMessage, settings.popupImageUrl])

  const close = () => {
    setOpen(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()))
    } catch {
      /* ignore */
    }
  }

  const cta = (rawUrl: string) => {
    const url = rawUrl.trim()
    close()
    if (url) {
      // Internal routes navigate in-app; external URLs open in a new tab.
      if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener')
      else go(url)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="site-popup-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={close}
          role="presentation"
        >
          <motion.div
            key="site-popup"
            initial={{ scale: 0.9, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={settings.popupTitle || tx('ঘোষণা', 'Announcement')}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={close}
              aria-label={tx('বন্ধ করুন', 'Close')}
              className="absolute top-2.5 right-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/70"
            >
              <X className="h-4 w-4" />
            </button>

            {settings.popupImageUrl.trim() !== '' && (
              <div className="relative aspect-[16/9] w-full bg-muted">
                {settings.popupImageLink.trim() !== '' ? (
                  <button
                    type="button"
                    onClick={() => cta(settings.popupImageLink)}
                    aria-label={settings.popupTitle || tx('অফার দেখুন', 'View offer')}
                    className="group absolute inset-0 block cursor-pointer"
                  >
                    <Image
                      src={settings.popupImageUrl}
                      alt={settings.popupTitle || tx('পপআপ ছবি', 'Popup image')}
                      fill
                      sizes="(max-width: 768px) 100vw, 448px"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      unoptimized={settings.popupImageUrl.startsWith('/uploads/')}
                    />
                  </button>
                ) : (
                  <Image
                    src={settings.popupImageUrl}
                    alt={settings.popupTitle || tx('পপআপ ছবি', 'Popup image')}
                    fill
                    sizes="(max-width: 768px) 100vw, 448px"
                    className="object-cover"
                    unoptimized={settings.popupImageUrl.startsWith('/uploads/')}
                  />
                )}
              </div>
            )}

            <div className="p-5 sm:p-6">
              {settings.popupTitle.trim() !== '' && (
                <h2 className="text-xl font-bold sm:text-2xl">{settings.popupTitle}</h2>
              )}
              {settings.popupMessage.trim() !== '' && (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {settings.popupMessage}
                </p>
              )}
              {settings.popupButtonText.trim() !== '' && (
                <Button className="mt-4 w-full sm:w-auto" onClick={() => cta(settings.popupButtonUrl)}>
                  {settings.popupButtonText}
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

'use client'

/**
 * WelcomePopup — global site announcement popup.
 *
 * Mounted ONCE inside PublicShell (after <SiteHeader/>). On mount it fetches
 * the PUBLIC /api/settings once; if the admin has enabled the welcome popup
 * (popupEnabled + non-empty title/body) and this browser TAB session has not
 * seen it yet (sessionStorage flag), it shows a shadcn Dialog.
 *
 * - Image banner (object-cover h-40) when popupImageUrl is set.
 * - Body renders with whitespace-pre-line (admin line breaks preserved).
 * - Optional CTA button (popupBtnText → navigate popupBtnUrl via go()).
 * - ANY close (X, button, overlay/Esc) sets the sessionStorage flag so the
 *   popup shows once per tab session.
 * - SSR-safe: everything happens in effects; nothing differs between server
 *   and client on first paint. /admin never sees it (PublicShell is only used
 *   by the (public) route group — admin keeps its own shell).
 */

import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '@/lib/api-client'
import { useUI, go } from '@/store/ui-store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const FLAG = 'ps_welcome_popup'

/** Popup-relevant slice of the public settings payload. */
interface PopupSettings {
  popupEnabled?: boolean
  popupTitle?: string | null
  popupBody?: string | null
  popupImageUrl?: string | null
  popupBtnText?: string | null
  popupBtnUrl?: string | null
}

export function WelcomePopup() {
  const { tx } = useUI()
  const [open, setOpen] = useState(false)
  const [popup, setPopup] = useState<PopupSettings | null>(null)

  useEffect(() => {
    let cancelled = false
    apiGet<PopupSettings>('/api/settings')
      .then((s) => {
        if (cancelled) return
        // Only eligible when enabled AND title/body are actually filled in.
        if (!s?.popupEnabled || !s.popupTitle?.trim() || !s.popupBody?.trim()) return
        // Show at most once per browser tab session.
        try {
          if (sessionStorage.getItem(FLAG) === '1') return
        } catch {
          /* storage unavailable (private mode) — show anyway */
        }
        setPopup(s)
        setOpen(true)
      })
      .catch(() => {
        /* settings unavailable — never block the page for a popup */
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** ANY close marks the flag so it stays hidden for the rest of the session. */
  const close = useCallback(() => {
    setOpen(false)
    try {
      sessionStorage.setItem(FLAG, '1')
    } catch {
      /* ignore */
    }
  }, [])

  const handleCta = useCallback(() => {
    const url = popup?.popupBtnUrl
    close()
    if (url) go(url)
  }, [popup, close])

  if (!popup) return null

  const btnText = popup.popupBtnText?.trim()

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close()
      }}
    >
      <DialogContent className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        {popup.popupImageUrl && (
          <div className="relative h-40 w-full" aria-hidden>
            {/* Plain <img> like the admin notice cards — popup images may be
                remote URLs that next/image cannot optimize without config. */}
            <img
              src={popup.popupImageUrl}
              alt=""
              className="absolute inset-0 h-40 w-full object-cover"
            />
          </div>
        )}

        <div className="p-4 sm:p-6">
          <DialogTitle className="pr-6 text-lg font-bold leading-snug sm:text-xl">
            {popup.popupTitle}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {tx('সাইটের ঘোষণা', 'Site announcement')}
          </DialogDescription>

          <div className="mt-3 max-h-[50vh] overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-foreground/90 sm:text-[15px]">
            {popup.popupBody}
          </div>

          <DialogFooter className="mt-5 flex-col gap-2 sm:flex-row sm:justify-end">
            {btnText && popup.popupBtnUrl?.trim() && (
              <Button onClick={handleCta} className="w-full sm:w-auto">
                {btnText}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={close}
              className="w-full sm:w-auto"
              aria-label={tx('পপআপ বন্ধ করুন', 'Close the popup')}
            >
              {tx('বন্ধ করুন', 'Close')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

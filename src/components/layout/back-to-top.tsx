'use client'

/**
 * FloatingActions — site-wide floating action stack (bottom-right):
 *   [ WhatsApp / Chat ]   ← above (opens wa.me with the admin's number/message)
 *   [ Back to top     ]   ← below
 *
 * • WhatsApp only renders when the admin enabled it + set a number
 *   (Settings → WhatsApp widget). BackToTop appears after ~420px of scroll.
 * • Both respect env(safe-area-inset-bottom), stay inside the viewport on
 *   mobile, never overlap dialogs (z-40) and have 44px+ touch targets.
 */
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp } from 'lucide-react'
import { useUI } from '@/store/ui-store'
import { usePublicSettings } from '@/hooks/use-public-settings'

const SHOW_AFTER = 420 // px scrolled before Back-to-Top appears

const spring = { type: 'spring' as const, stiffness: 380, damping: 28 }

/** Official WhatsApp brand glyph (speech bubble + handset). */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  )
}

export function FloatingActions() {
  const { tx } = useUI()
  const settings = usePublicSettings()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER)
    onScroll() // correct initial state for deep-linked / restored scroll positions
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const toTop = () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
  }

  const waNumber = settings.whatsappNumber.replace(/[^\d]/g, '')
  const waUrl = `https://wa.me/${waNumber}${settings.whatsappMessage ? `?text=${encodeURIComponent(settings.whatsappMessage)}` : ''}`
  const showWhatsApp = settings.whatsappEnabled && waNumber.length >= 8

  return (
    <div
      className="fixed z-40 flex flex-col items-center gap-2.5"
      style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom))', right: '1.25rem' }}
    >
      {/* ── WhatsApp / chat widget (above Back-to-Top) ── */}
      {showWhatsApp && (
        <motion.a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          key="whatsapp-widget"
          initial={{ opacity: 0, y: 16, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={spring}
          aria-label={tx('হোয়াটসঅ্যাপে মেসেজ করুন', 'Chat on WhatsApp')}
          title={tx('হোয়াটসঅ্যাপে মেসেজ করুন', 'Chat on WhatsApp')}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/25 outline-none transition-transform hover:scale-110 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 sm:h-12 sm:w-12"
        >
          <WhatsAppIcon className="h-6 w-6" />
        </motion.a>
      )}

      {/* ── Back to top ── */}
      <AnimatePresence>
        {visible && (
          <motion.button
            type="button"
            key="back-to-top"
            initial={{ opacity: 0, y: 16, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.85 }}
            transition={spring}
            onClick={toTop}
            aria-label={tx('উপরে ফিরে যান', 'Back to top')}
            title={tx('উপরে ফিরে যান', 'Back to top')}
            className="grad-brand flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg shadow-black/25 outline-none ring-offset-background transition-transform hover:scale-110 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 sm:h-12 sm:w-12"
          >
            <ArrowUp className="h-5 w-5" aria-hidden />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Backwards-compatible alias used by the shells. */
export const BackToTop = FloatingActions

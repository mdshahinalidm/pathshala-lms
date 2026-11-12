'use client'

/**
 * PdfBadge — the one recognizable "PDF" lesson-type mark used EVERYWHERE a
 * PDF lesson appears (course curriculum, classroom sidebar, preview dialogs).
 * Renders the official red PDF file icon so it stays instantly
 * distinguishable from the green play icon of video lessons.
 */
import { PdfFileIcon } from '@/components/shared/pdf-file-icon'

export function PdfBadge({
  size = 'sm',
  className = '',
}: {
  size?: 'sm' | 'lg'
  className?: string
}) {
  return (
    <PdfFileIcon
      className={`${size === 'lg' ? 'h-9 w-9' : 'h-[18px] w-[18px]'} ${className}`}
    />
  )
}

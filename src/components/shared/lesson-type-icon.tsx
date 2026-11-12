import { cn } from '@/lib/utils'
import { AlignLeft, PlayCircle } from 'lucide-react'
import { PdfFileIcon } from '@/components/shared/pdf-file-icon'

/**
 * LessonTypeIcon — ONE consistent lesson-type icon everywhere a lesson list
 * is rendered (course-detail curriculum, classroom sidebar).
 *
 * PDF lessons get the official red "PDF" file icon (universally recognized,
 * and visually distinct from the generic file glyph that previously made PDF
 * lessons look like they had "no PDF icon"). VIDEO keeps the play-circle,
 * TEXT keeps the lines glyph.
 */
export function PdfIcon({ className }: { className?: string }) {
  return <PdfFileIcon className={cn('h-[18px] w-[18px]', className)} />
}

export function LessonTypeIcon({
  type,
  className,
}: {
  type: 'VIDEO' | 'PDF' | 'TEXT' | string
  className?: string
}) {
  if (type === 'PDF') return <PdfIcon className={className} />
  if (type === 'TEXT') {
    return <AlignLeft className={cn('h-[18px] w-[18px] shrink-0 text-teal-600', className)} aria-hidden />
  }
  return <PlayCircle className={cn('h-[18px] w-[18px] shrink-0 text-primary/70', className)} aria-hidden />
}

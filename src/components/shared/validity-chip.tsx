'use client'

import { Hourglass, Infinity as InfinityIcon } from 'lucide-react'
import { VALIDITY_TONES, validityChipLabel, validityKey } from '@/lib/course-validity'
import { useUI } from '@/store/ui-store'

/**
 * Colorful validity pill — one consistent way to show a course's access
 * duration everywhere (course cards, course detail, checkout, dashboard).
 * Renders nothing when the course has no validity metadata.
 */
export function ValidityChip({
  isLifetime,
  validityMonths,
  className = '',
}: {
  isLifetime?: boolean | null
  validityMonths?: number | null
  className?: string
}) {
  const { lang } = useUI()
  const key = validityKey(isLifetime, validityMonths)
  if (!key) return null
  const tone = VALIDITY_TONES[key]
  const label = validityChipLabel(isLifetime, validityMonths, lang)
  const Icon = isLifetime ? InfinityIcon : Hourglass
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white shadow-sm ${tone.solid} ${className}`}
      title={isLifetime ? 'Lifetime Access' : `${validityMonths} ${validityMonths === 1 ? 'Month' : 'Months'} Validity`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  )
}

'use client'

/**
 * Admin panel "created" stamp, shown in EVERY admin section list.
 * Renders the owner-specified fixed format on two tidy lines:
 *   22 September 2026
 *   12:10 PM
 * (always English, independent of the bn/en language toggle).
 */
import { fmtStamp } from '@/lib/format'

export function DateStamp({
  iso,
  className = '',
  label,
}: {
  iso: string | Date | null | undefined
  className?: string
  label?: string
}) {
  const st = fmtStamp(iso)
  if (!st.date) {
    return <span className={`text-xs text-muted-foreground ${className}`}>—</span>
  }
  return (
    <div className={`leading-snug ${className}`}>
      {label ? <div className="sr-only">{label}</div> : null}
      <div className="whitespace-nowrap text-xs font-medium">{st.date}</div>
      <div className="whitespace-nowrap text-[11px] text-muted-foreground">{st.time}</div>
    </div>
  )
}

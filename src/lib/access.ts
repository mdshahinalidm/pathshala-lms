/**
 * Course access validity — shared helpers (client + server safe).
 *
 * A course stores `validityMonths`: null = LIFETIME access, otherwise
 * 1 | 2 | 3 | 6 | 12. An Enrollment snapshot `expiresAt` is written at
 * enrollment time; when it passes, course access expires automatically.
 */

export interface ValidityOption {
  /** null = lifetime */
  months: number | null
  bn: string
  en: string
}

/** The fixed validity options the admin can pick when creating/editing a course. */
export const VALIDITY_OPTIONS: ValidityOption[] = [
  { months: null, bn: 'লাইফটাইম অ্যাক্সেস', en: 'Lifetime Access' },
  { months: 1, bn: '১ মাস', en: '1 Month' },
  { months: 2, bn: '২ মাস', en: '2 Months' },
  { months: 3, bn: '৩ মাস', en: '3 Months' },
  { months: 6, bn: '৬ মাস', en: '6 Months' },
  { months: 12, bn: '১ বছর', en: '1 Year' },
]

/** Human label for a validityMonths value. */
export function validityLabel(
  months: number | null | undefined,
  lang: 'bn' | 'en' = 'bn'
): string {
  if (months == null) return lang === 'bn' ? 'লাইফটাইম অ্যাক্সেস' : 'Lifetime Access'
  const opt = VALIDITY_OPTIONS.find((o) => o.months === months)
  if (!opt) return lang === 'bn' ? `${months} মাস` : `${months} Month(s)`
  return lang === 'bn' ? opt.bn : opt.en
}

/** Short label (no "access" suffix) for badges/cards. Bengali digits in bn. */
export function validityShort(
  months: number | null | undefined,
  lang: 'bn' | 'en' = 'bn'
): string {
  if (months == null) return lang === 'bn' ? 'লাইফটাইম' : 'Lifetime'
  if (lang === 'bn') {
    const bnDigits = '০১২৩৪৫৬৭৮৯'
    const num = String(months)
      .split('')
      .map((d) => bnDigits[Number(d)] ?? d)
      .join('')
    return `${num} মাস`
  }
  return `${months} Month${months > 1 ? 's' : ''}`
}

/** Compute the absolute expiry for an enrollment starting `from`. null = lifetime. */
export function accessExpiryFrom(
  months: number | null | undefined,
  from: Date = new Date()
): Date | null {
  if (months == null || months <= 0) return null
  const d = new Date(from)
  d.setMonth(d.getMonth() + months)
  return d
}

/** Is an enrollment still active? (null/undefined expiry = lifetime = active) */
export function isEnrollmentActive(
  expiresAt: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() > now.getTime()
}

/** Days left before expiry (fractional). null = ∞ (lifetime). */
export function daysLeft(expiresAt: string | Date | null | undefined): number | null {
  if (!expiresAt) return null
  return (new Date(expiresAt).getTime() - Date.now()) / 86_400_000
}

/**
 * Course Validity — shared design system (colorful).
 *
 * A course's access duration is stored as:
 *   - isLifetime = true                 → Lifetime Access (∞)
 *   - validityMonths = 1 | 2 | 3 | 6 | 12 → limited duration
 *
 * Every duration gets its own bright tone so validity is instantly
 * recognizable across admin forms, course cards, course detail,
 * checkout and the student dashboard.
 */

export type ValidityKey = '1' | '2' | '3' | '6' | '12' | 'lifetime'

export interface ValidityTone {
  /** Gradient pill — white bold text on colored gradient. */
  solid: string
  /** Outline badge — colored border/text on tinted background. */
  outline: string
  /** Icon-circle gradient used in the admin picker cards. */
  circle: string
  /** Selected-card ring/border + tinted background. */
  selected: string
  /** Raw text color (for sub-labels). */
  text: string
}

/** Bright, distinct tone per duration (rose → orange → amber → cyan → violet → emerald). */
export const VALIDITY_TONES: Record<ValidityKey, ValidityTone> = {
  '1': {
    solid: 'bg-gradient-to-r from-rose-500 to-pink-500 text-white',
    outline: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    circle: 'from-rose-500 to-pink-500',
    selected: 'border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/40',
    text: 'text-rose-600 dark:text-rose-400',
  },
  '2': {
    solid: 'bg-gradient-to-r from-orange-500 to-amber-500 text-white',
    outline: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
    circle: 'from-orange-500 to-amber-500',
    selected: 'border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/40',
    text: 'text-orange-600 dark:text-orange-400',
  },
  '3': {
    solid: 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white',
    outline: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    circle: 'from-amber-500 to-yellow-500',
    selected: 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/40',
    text: 'text-amber-600 dark:text-amber-400',
  },
  '6': {
    solid: 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white',
    outline: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
    circle: 'from-cyan-500 to-teal-500',
    selected: 'border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500/40',
    text: 'text-cyan-600 dark:text-cyan-400',
  },
  '12': {
    solid: 'bg-gradient-to-r from-violet-500 to-purple-500 text-white',
    outline: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    circle: 'from-violet-500 to-purple-500',
    selected: 'border-violet-500 bg-violet-500/10 ring-2 ring-violet-500/40',
    text: 'text-violet-600 dark:text-violet-400',
  },
  lifetime: {
    solid: 'bg-gradient-to-r from-emerald-500 to-green-500 text-white',
    outline: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    circle: 'from-emerald-500 to-green-500',
    selected: 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/40',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
}

/** Bilingual label per duration key. */
export const VALIDITY_LABELS: Record<ValidityKey, { bn: string; en: string; subBn: string; subEn: string }> = {
  '1': { bn: '১ মাস', en: '1 Month', subBn: '৩০ দিনের অ্যাক্সেস', subEn: '30 days of access' },
  '2': { bn: '২ মাস', en: '2 Months', subBn: '৬০ দিনের অ্যাক্সেস', subEn: '60 days of access' },
  '3': { bn: '৩ মাস', en: '3 Months', subBn: '৯০ দিনের অ্যাক্সেস', subEn: '90 days of access' },
  '6': { bn: '৬ মাস', en: '6 Months', subBn: '৬ মাসের অ্যাক্সেস', subEn: 'Half-year access' },
  '12': { bn: '১ বছর', en: '1 Year', subBn: '৩৬৫ দিনের অ্যাক্সেস', subEn: 'Full-year access' },
  lifetime: { bn: 'লাইফটাইম অ্যাক্সেস', en: 'Lifetime Access', subBn: 'সীমাহীন — কখনো মেয়াদ শেষ হয় না', subEn: 'Unlimited — never expires' },
}

/** Resolve the tone key from a course's stored fields. `null` → course has no validity metadata. */
export function validityKey(
  isLifetime?: boolean | null,
  validityMonths?: number | null,
): ValidityKey | null {
  if (isLifetime) return 'lifetime'
  if (validityMonths == null) return null
  if (validityMonths <= 1) return '1'
  if (validityMonths === 2) return '2'
  if (validityMonths === 3) return '3'
  if (validityMonths <= 6) return '6'
  return '12'
}

/**
 * Short chip label, e.g. "৩ মাস" / "3 Months" or "লাইফটাইম" / "Lifetime".
 * Uses Bengali digits when the UI language is Bangla.
 */
export function validityChipLabel(
  isLifetime?: boolean | null,
  validityMonths?: number | null,
  lang: 'bn' | 'en' = 'bn',
): string | null {
  if (isLifetime) return lang === 'bn' ? 'লাইফটাইম' : 'Lifetime'
  if (validityMonths == null) return null
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']
  const toBn = (n: number) => String(n).replace(/\d/g, (d) => bnDigits[Number(d)])
  if (validityMonths >= 12) {
    const years = validityMonths / 12
    return lang === 'bn' ? `${toBn(years)} বছর` : `${years} Year${years > 1 ? 's' : ''}`
  }
  return lang === 'bn' ? `${toBn(validityMonths)} মাস` : `${validityMonths} Month${validityMonths > 1 ? 's' : ''}`
}

import type { Lang } from '@/lib/i18n'

/** Format BDT price: bn → "৳১,৪৯০" (beautiful Bengali digits), en → "৳1,490". */
export function fmtBDT(amount: number | null | undefined, lang: Lang = 'bn'): string {
  const zero = lang === 'bn' ? '০' : '0'
  if (amount === null || amount === undefined) return `৳${zero}`
  const grouped = amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  return `৳${lang === 'bn' ? digitsBn(grouped) : grouped}`
}

/** Localize any number/numeric string: bn → Bengali digits (১২৩), en → as-is. */
export function fmtNum(n: number | string, lang: Lang = 'bn'): string {
  return lang === 'bn' ? digitsBn(n) : String(n)
}

export function fmtDate(iso: string | Date, lang: Lang = 'bn'): string {
  const d = new Date(iso)
  return d.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function fmtDateTime(iso: string | Date, lang: Lang = 'bn'): string {
  const d = new Date(iso)
  return `${fmtDate(d, lang)} · ${d.toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

/**
 * Admin panel "created" stamp, EXACTLY as specified by the owner:
 *   { date: "22 September 2026", time: "12:10 PM" }
 * Always English (Latin digits, long English month, 12-hour AM/PM) regardless
 * of the bn/en toggle, so every admin section shows the same fixed format.
 * Pinned to Asia/Dhaka so the wall-clock matches the site's audience.
 */
const STAMP_TZ = 'Asia/Dhaka'

export function fmtStamp(iso: string | Date | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const date = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: STAMP_TZ,
  })
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: STAMP_TZ,
  })
  return { date, time }
}

/** One-line variant for detail dialogs: "22 September 2026, 12:10 PM". */
export function fmtStampText(iso: string | Date | null | undefined): string {
  const st = fmtStamp(iso)
  return st.date ? `${st.date}, ${st.time}` : '—'
}

export function fmtDuration(seconds: number, lang: Lang = 'bn'): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return lang === 'bn' ? `${mm}:${ss} মিনিট` : `${mm}:${ss}`
}

export function fmtClock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function levelLabel(level: string, lang: Lang = 'bn'): string {
  const map: Record<string, [string, string]> = {
    BEGINNER: ['বিগিনার', 'Beginner'],
    INTERMEDIATE: ['ইন্টারমিডিয়েট', 'Intermediate'],
    ADVANCED: ['অ্যাডভান্সড', 'Advanced'],
  }
  const pair = map[level] || [level, level]
  return lang === 'bn' ? pair[0] : pair[1]
}

export function orderStatusStyle(status: string): string {
  switch (status) {
    case 'SUCCESS':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
    case 'PENDING':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
    case 'FAILED':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function noticeTypeStyle(type: string): string {
  switch (type) {
    case 'URGENT':
      return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    case 'EVENT':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
    default:
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
  }
}

export function digitsBn(n: number | string): string {
  const map: Record<string, string> = {
    '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
    '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯',
  }
  return String(n).replace(/[0-9]/g, (d) => map[d])
}

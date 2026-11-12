/**
 * nav-config.ts — Header menu & Footer customization data model.
 *
 * A NEUTRAL module (no 'use client', no React) shared by:
 *   • server code (settings API validation of the JSON blobs)
 *   • client components (site-header, site-footer, admin editors)
 *
 * The admin edits the header menu / footer columns in the Settings panel;
 * the result is stored as a JSON string in SiteSetting.headerMenuConfig /
 * SiteSetting.footerConfig. EMPTY string = built-in defaults render exactly
 * as before (the site never changes until the admin actually edits).
 */

// ──────────────────────────────── TYPES ────────────────────────────────

export interface NavItemConfig {
  labelBn: string
  labelEn: string
  href: string
  enabled: boolean
}

export interface FooterLinkItem {
  labelBn: string
  labelEn: string
  href: string
}

export type FooterColumnKey = 'quick' | 'classes' | 'tools' | 'essential' | 'contact'

export interface FooterColumnConfig {
  key: FooterColumnKey
  titleBn: string
  titleEn: string
  enabled: boolean
  /** Link columns only — the contact column renders phone/email/address. */
  links?: FooterLinkItem[]
}

export interface FooterConfig {
  aboutTextBn: string
  aboutTextEn: string
  columns: FooterColumnConfig[]
}

// ─────────────────────────────── LIMITS ────────────────────────────────

export const NAV_LIMITS = {
  headerItems: 12,
  footerColumns: 5,
  linksPerColumn: 14,
  labelMax: 60,
  hrefMax: 300,
  aboutMax: 400,
  titleMax: 60,
} as const

// ────────────────────────────── DEFAULTS ───────────────────────────────

/** Built-in header menu — mirrors the previous hardcoded NAV + dictionary. */
export const DEFAULT_HEADER_MENU: NavItemConfig[] = [
  { labelBn: 'হোম', labelEn: 'Home', href: '/', enabled: true },
  { labelBn: 'কোর্সসমূহ', labelEn: 'Courses', href: '/courses', enabled: true },
  { labelBn: 'পরীক্ষা', labelEn: 'Exam', href: '/exams', enabled: true },
  { labelBn: 'প্রশ্ন', labelEn: 'Question', href: '/questions', enabled: true },
  { labelBn: 'নোটিশ', labelEn: 'Notice', href: '/notices', enabled: true },
  { labelBn: 'সাজেশন', labelEn: 'Suggestions', href: '/suggestions', enabled: true },
]

/** Built-in footer column defaults — mirrors the previous hardcoded columns. */
export const DEFAULT_FOOTER_CONFIG: FooterConfig = {
  aboutTextBn:
    'বাংলাদেশের সবচেয়ে বিশ্বস্ত অনলাইন লার্নিং প্ল্যাটফর্ম। মানসম্মত কোর্স, পরীক্ষা ও ফ্রি রিসোর্স — সব এক জায়গায়।',
  aboutTextEn:
    "Bangladesh's most trusted online learning platform. Quality courses, exams and free resources — all in one place.",
  columns: [
    {
      key: 'quick',
      titleBn: 'কুইক লিংক',
      titleEn: 'Quick Links',
      enabled: true,
      links: DEFAULT_HEADER_MENU.slice(1).map((n) => ({
        labelBn: n.labelBn,
        labelEn: n.labelEn,
        href: n.href,
      })),
    },
    {
      key: 'classes',
      titleBn: 'ক্লাস',
      titleEn: 'Classes',
      enabled: true,
      links: [
        { labelBn: 'নবম শ্রেণি', labelEn: 'Class 9', href: '/courses?cat=class-9' },
        { labelBn: 'দশম শ্রেণি (SSC)', labelEn: 'Class 10 (SSC)', href: '/courses?cat=class-10' },
        { labelBn: 'একাদশ শ্রেণি (HSC)', labelEn: 'Class 11 (HSC)', href: '/courses?cat=class-11' },
        { labelBn: 'দ্বাদশ শ্রেণি (HSC)', labelEn: 'Class 12 (HSC)', href: '/courses?cat=class-12' },
        { labelBn: 'অনার্স ১ম বর্ষ', labelEn: 'Honours 1st Year', href: '/courses?cat=honours-1st-year' },
      ],
    },
    {
      key: 'tools',
      titleBn: 'মিনি টুলস',
      titleEn: 'Mini Tools',
      enabled: true,
      links: [
        { labelBn: 'GPA ক্যালকুলেটর', labelEn: 'GPA Calculator', href: '/tools/gpa-calculator' },
        { labelBn: 'CGPA ক্যালকুলেটর', labelEn: 'CGPA Calculator', href: '/tools/cgpa-calculator' },
        { labelBn: 'শতকরা ↔ GPA', labelEn: 'Percentage ↔ GPA', href: '/tools/percentage-gpa' },
      ],
    },
    {
      key: 'essential',
      titleBn: 'প্রয়োজনীয় লিংক',
      titleEn: 'Essential Links',
      enabled: true,
      links: [
        { labelBn: 'আমাদের সম্পর্কে', labelEn: 'About Us', href: '/about' },
        { labelBn: 'যোগাযোগ করুন', labelEn: 'Contact Us', href: '/contact' },
        { labelBn: 'প্রাইভেসি পলিসি', labelEn: 'Privacy Policy', href: '/privacy-policy' },
        { labelBn: 'শর্তাবলী', labelEn: 'Terms & Conditions', href: '/terms' },
        { labelBn: 'সাইটম্যাপ', labelEn: 'Sitemap', href: '/sitemap' },
      ],
    },
    {
      key: 'contact',
      titleBn: 'যোগাযোগ',
      titleEn: 'Contact',
      enabled: true,
    },
  ],
}

// ────────────────────────────── PARSERS ────────────────────────────────

function asTrimmedString(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function parseLinkItems(raw: unknown, limit: number): FooterLinkItem[] | null {
  if (!Array.isArray(raw)) return null
  const out: FooterLinkItem[] = []
  for (const entry of raw.slice(0, limit)) {
    if (typeof entry !== 'object' || entry === null) continue
    const o = entry as Record<string, unknown>
    const labelBn = asTrimmedString(o.labelBn, NAV_LIMITS.labelMax)
    const labelEn = asTrimmedString(o.labelEn, NAV_LIMITS.labelMax)
    const href = asTrimmedString(o.href, NAV_LIMITS.hrefMax)
    if (!href) continue // a link without a destination is useless — drop it
    out.push({
      labelBn: labelBn || labelEn,
      labelEn: labelEn || labelBn,
      href,
    })
  }
  return out
}

/**
 * Parse SiteSetting.headerMenuConfig. Returns NULL for empty/invalid config
 * so callers fall back to the built-in menu (site unchanged).
 */
export function parseHeaderMenu(raw: string | null | undefined): NavItemConfig[] | null {
  if (!raw || !raw.trim()) return null
  try {
    const arr: unknown = JSON.parse(raw)
    if (!Array.isArray(arr)) return null
    const items: NavItemConfig[] = []
    for (const entry of arr.slice(0, NAV_LIMITS.headerItems)) {
      if (typeof entry !== 'object' || entry === null) continue
      const o = entry as Record<string, unknown>
      const labelBn = asTrimmedString(o.labelBn, NAV_LIMITS.labelMax)
      const labelEn = asTrimmedString(o.labelEn, NAV_LIMITS.labelMax)
      const href = asTrimmedString(o.href, NAV_LIMITS.hrefMax)
      if (!href) continue
      items.push({
        labelBn: labelBn || labelEn,
        labelEn: labelEn || labelBn,
        href,
        enabled: o.enabled !== false,
      })
    }
    return items
  } catch {
    return null
  }
}

const FOOTER_COLUMN_KEYS: readonly FooterColumnKey[] = ['quick', 'classes', 'tools', 'essential', 'contact']

/**
 * Parse SiteSetting.footerConfig. Returns NULL for empty/invalid config so
 * callers fall back to the built-in footer (site unchanged).
 */
export function parseFooterConfig(raw: string | null | undefined): FooterConfig | null {
  if (!raw || !raw.trim()) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const o = parsed as Record<string, unknown>
    const columns: FooterColumnConfig[] = []
    const rawCols = Array.isArray(o.columns) ? o.columns : []
    for (const entry of rawCols) {
      if (typeof entry !== 'object' || entry === null) continue
      const c = entry as Record<string, unknown>
      const key = asTrimmedString(c.key, 20) as FooterColumnKey
      if (!FOOTER_COLUMN_KEYS.includes(key)) continue
      const titleBn = asTrimmedString(c.titleBn, NAV_LIMITS.titleMax)
      const titleEn = asTrimmedString(c.titleEn, NAV_LIMITS.titleMax)
      const col: FooterColumnConfig = {
        key,
        titleBn: titleBn || titleEn,
        titleEn: titleEn || titleBn,
        enabled: c.enabled !== false,
      }
      if (key !== 'contact') {
        const links = parseLinkItems(c.links, NAV_LIMITS.linksPerColumn)
        // A link column with zero links renders empty — treat as defaults.
        if (links && links.length > 0) col.links = links
      }
      columns.push(col)
    }
    if (columns.length === 0) return null
    return {
      aboutTextBn: asTrimmedString(o.aboutTextBn, NAV_LIMITS.aboutMax),
      aboutTextEn: asTrimmedString(o.aboutTextEn, NAV_LIMITS.aboutMax),
      columns,
    }
  } catch {
    return null
  }
}

// ───────────────────────────── VALIDATORS ──────────────────────────────
// Server-side: the settings PUT route validates the admin-supplied JSON and
// stores a normalized (re-stringified) copy — malformed JSON is rejected
// with 422 instead of silently breaking the site.

export function validateHeaderMenuJson(raw: unknown): string | null {
  const items = parseHeaderMenu(typeof raw === 'string' ? raw : '')
  if (!items) return null
  return JSON.stringify(items)
}

export function validateFooterConfigJson(raw: unknown): string | null {
  const cfg = parseFooterConfig(typeof raw === 'string' ? raw : '')
  if (!cfg) return null
  return JSON.stringify(cfg)
}

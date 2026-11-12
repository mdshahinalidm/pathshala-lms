'use client'

/**
 * SiteFooter — the ONE site-wide deep-gradient footer used everywhere EXCEPT /admin.
 * Columns: brand · quick links · classes · education mini-tools ·
 * essential links · contact + social icons.
 * Social icons: ONLY the platforms the admin configured (Settings → Social media).
 *
 * full admin customization: every column (title, links, on/off)
 * plus the brand description is editable from Settings → ফুটার. The config
 * JSON (lib/nav-config.ts shape) is stored in SiteSetting.footerConfig.
 * EMPTY config → the built-in defaults render EXACTLY as before, and each
 * column falls back individually so a partial config only overrides the
 * columns the admin actually touched.
 */
import Link from 'next/link'
import { useMemo } from 'react'
import { GraduationCap, Calculator, Facebook, Instagram, Youtube, Linkedin, Twitter } from 'lucide-react'
import { useUI } from '@/store/ui-store'
import { usePublicSettings } from '@/hooks/use-public-settings'
import {
  parseFooterConfig,
  parseHeaderMenu,
  DEFAULT_HEADER_MENU,
  type FooterColumnConfig,
  type FooterLinkItem,
} from '@/lib/nav-config'

/** Real DB category slugs (built-in Classes column) */
const FOOTER_CATS: FooterLinkItem[] = [
  { labelBn: 'নবম শ্রেণি', labelEn: 'Class 9', href: '/courses?cat=class-9' },
  { labelBn: 'দশম শ্রেণি (SSC)', labelEn: 'Class 10 (SSC)', href: '/courses?cat=class-10' },
  { labelBn: 'একাদশ শ্রেণি (HSC)', labelEn: 'Class 11 (HSC)', href: '/courses?cat=class-11' },
  { labelBn: 'দ্বাদশ শ্রেণি (HSC)', labelEn: 'Class 12 (HSC)', href: '/courses?cat=class-12' },
  { labelBn: 'অনার্স ১ম বর্ষ', labelEn: 'Honours 1st Year', href: '/courses?cat=honours-1st-year' },
]

/** Education mini-tools (built-in Mini Tools column) */
const TOOLS: FooterLinkItem[] = [
  { labelBn: 'GPA ক্যালকুলেটর', labelEn: 'GPA Calculator', href: '/tools/gpa-calculator' },
  { labelBn: 'CGPA ক্যালকুলেটর', labelEn: 'CGPA Calculator', href: '/tools/cgpa-calculator' },
  { labelBn: 'শতকরা ↔ GPA', labelEn: 'Percentage ↔ GPA', href: '/tools/percentage-gpa' },
]

/** Essential pages (built-in Essential Links column) */
const ESSENTIAL_LINKS: FooterLinkItem[] = [
  { labelBn: 'আমাদের সম্পর্কে', labelEn: 'About Us', href: '/about' },
  { labelBn: 'যোগাযোগ করুন', labelEn: 'Contact Us', href: '/contact' },
  { labelBn: 'প্রাইভেসি পলিসি', labelEn: 'Privacy Policy', href: '/privacy-policy' },
  { labelBn: 'শর্তাবলী', labelEn: 'Terms & Conditions', href: '/terms' },
  { labelBn: 'সাইটম্যাপ', labelEn: 'Sitemap', href: '/sitemap' },
]

/** Heading dot tone per column key — matches the original design. */
const COLUMN_DOT: Record<string, string> = {
  quick: 'grad-amber',
  classes: 'grad-violet',
  tools: 'grad-cyan',
  essential: 'grad-emerald',
  contact: 'grad-rose',
}

/** Link dot tones for the mini-tools column (cycles for custom links). */
const LINK_DOTS = ['grad-emerald', 'grad-violet', 'grad-amber', 'grad-cyan', 'grad-rose']

/** TikTok brand glyph (lucide has no TikTok icon). */
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  )
}

/**
 * Default footer copyright lines (HTML) — used when the admin setting is
 * empty. The developer credit with the LinkedIn link lives INSIDE the text,
 * so each language renders as ONE complete line:
 *   bn → © বছর পাঠশালা | সর্বস্বত্ব সংরক্ষিত | Developed By Md Shahin Ali(link)
 *   en → © year PathShala | All rights reserved | Developed By Md Shahin Ali(link)
 */
const DEV_LINK = 'https://www.linkedin.com/in/mdshahinalidm/'
const DEV_CREDIT = `<a href="${DEV_LINK}" target="_blank" rel="noopener noreferrer">Md Shahin Ali</a>`
const defaultCopyrightBn = `© ${new Date().getFullYear()} পাঠশালা | সর্বস্বত্ব সংরক্ষিত | Developed By ${DEV_CREDIT}`
const defaultCopyrightEn = `© ${new Date().getFullYear()} PathShala | All rights reserved | Developed By ${DEV_CREDIT}`

export function SiteFooter() {
  const { t, tx, lang } = useUI()
  const settings = usePublicSettings()

  // admin-uploaded footer logo (falls back to the brand mark).
  const footerLogo = settings.footerLogoUrl.trim()
  const footerLogoPx = Math.min(200, Math.max(16, settings.footerLogoHeight || 40))

  // admin footer config (null → every column falls back to its
  // built-in content — the site is pixel-identical until the admin edits).
  const fc = useMemo(() => parseFooterConfig(settings.footerConfig), [settings.footerConfig])
  const col = (key: string): FooterColumnConfig | undefined =>
    fc?.columns.find((c) => c.key === key)

  // Quick-links default: derive from the EFFECTIVE header menu (built-in or
  // admin-customized) minus Home — the exact behavior of the original footer.
  const defaultQuickLinks: FooterLinkItem[] = useMemo(() => {
    const menu = parseHeaderMenu(settings.headerMenuConfig) ?? DEFAULT_HEADER_MENU
    return menu
      .filter((i) => i.enabled)
      .slice(1)
      .map((i) => ({ labelBn: i.labelBn, labelEn: i.labelEn, href: i.href }))
  }, [settings.headerMenuConfig])

  const quickCol = col('quick')
  const classesCol = col('classes')
  const toolsCol = col('tools')
  const essentialCol = col('essential')
  const contactCol = col('contact')

  /** Resolved links for a column: config wins, otherwise the built-in list. */
  const quickLinks = quickCol?.links ?? defaultQuickLinks
  const classLinks = classesCol?.links ?? FOOTER_CATS
  const toolLinks = toolsCol?.links ?? TOOLS
  const essentialLinks = essentialCol?.links ?? ESSENTIAL_LINKS

  const aboutText =
    fc && fc.aboutTextBn.trim() !== ''
      ? tx(fc.aboutTextBn, fc.aboutTextEn.trim() !== '' ? fc.aboutTextEn : fc.aboutTextBn)
      : tx('বাংলাদেশের সবচেয়ে বিশ্বস্ত অনলাইন লার্নিং প্ল্যাটফর্ম। মানসম্মত কোর্স, পরীক্ষা ও ফ্রি রিসোর্স — সব এক জায়গায়।', "Bangladesh's most trusted online learning platform. Quality courses, exams and free resources — all in one place.")

  /** Only the configured platforms render (admin decides which appear). */
  const socials = [
    { key: 'facebook', url: settings.facebookUrl, label: 'Facebook', Icon: Facebook, tone: 'hover:bg-[#1877F2]' },
    { key: 'instagram', url: settings.instagramUrl, label: 'Instagram', Icon: Instagram, tone: 'hover:bg-[#E4405F]' },
    { key: 'youtube', url: settings.youtubeUrl, label: 'YouTube', Icon: Youtube, tone: 'hover:bg-[#FF0000]' },
    { key: 'linkedin', url: settings.linkedinUrl, label: 'LinkedIn', Icon: Linkedin, tone: 'hover:bg-[#0A66C2]' },
    { key: 'x', url: settings.twitterUrl, label: 'X (Twitter)', Icon: Twitter, tone: 'hover:bg-black' },
    { key: 'tiktok', url: settings.tiktokUrl, label: 'TikTok', Icon: TikTokIcon, tone: 'hover:bg-[#010101]' },
  ].filter((s) => s.url.trim() !== '')

  return (
    <footer className="footer-deep mt-auto pb-[env(safe-area-inset-bottom)] text-white">
      <div aria-hidden className="rainbow-bar h-1 w-full" />
      <div className="mx-auto max-w-7xl px-3.5 py-10">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1 min-w-0">
            <div className="flex items-center gap-2">
              {footerLogo ? (
                <img
                  src={footerLogo}
                  alt={t('brand')}
                  className="w-auto max-w-[180px] object-contain"
                  style={{ height: `${footerLogoPx}px` }}
                />
              ) : (
                <>
                  <span className="grad-brand flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md shadow-black/20">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <span className="text-lg font-bold">{t('brand')}</span>
                </>
              )}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-white/70">{aboutText}</p>
          </div>

          {/* Quick links — hidden when the admin switched the column off */}
          {quickCol?.enabled !== false && (
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <span aria-hidden className={`h-2 w-2 rounded-full ${COLUMN_DOT.quick}`} />
                {tx(quickCol?.titleBn ?? 'কুইক লিংক', quickCol?.titleEn ?? 'Quick Links')}
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-white/70">
                {quickLinks.map((l) => (
                  <li key={l.href + l.labelEn}>
                    <Link href={l.href} prefetch className="transition-colors hover:text-amber-300">
                      {lang === 'bn' ? l.labelBn : l.labelEn}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Classes */}
          {classesCol?.enabled !== false && (
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <span aria-hidden className={`h-2 w-2 rounded-full ${COLUMN_DOT.classes}`} />
                {tx(classesCol?.titleBn ?? 'ক্লাস', classesCol?.titleEn ?? 'Classes')}
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-white/70">
                {classLinks.map((c) => (
                  <li key={c.href + c.labelEn}>
                    <Link href={c.href} prefetch className="transition-colors hover:text-violet-300">
                      {lang === 'bn' ? c.labelBn : c.labelEn}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Mini tools */}
          {toolsCol?.enabled !== false && (
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <span aria-hidden className={`h-2 w-2 rounded-full ${COLUMN_DOT.tools}`} />
                <Calculator className="h-3.5 w-3.5" aria-hidden />
                {tx(toolsCol?.titleBn ?? 'মিনি টুলস', toolsCol?.titleEn ?? 'Mini Tools')}
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-white/70">
                {toolLinks.map((tool, idx) => (
                  <li key={tool.href + tool.labelEn}>
                    <Link href={tool.href} prefetch className="group inline-flex items-center gap-1.5 transition-colors hover:text-rose-300">
                      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${LINK_DOTS[idx % LINK_DOTS.length]}`} />
                      {lang === 'bn' ? tool.labelBn : tool.labelEn}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Essential links */}
          {essentialCol?.enabled !== false && (
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <span aria-hidden className={`h-2 w-2 rounded-full ${COLUMN_DOT.essential}`} />
                {tx(essentialCol?.titleBn ?? 'প্রয়োজনীয় লিংক', essentialCol?.titleEn ?? 'Essential Links')}
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-white/70">
                {essentialLinks.map((l) => (
                  <li key={l.href + l.labelEn}>
                    <Link href={l.href} prefetch className="transition-colors hover:text-emerald-300">
                      {lang === 'bn' ? l.labelBn : l.labelEn}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Contact + socials */}
          {contactCol?.enabled !== false && (
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <span aria-hidden className={`h-2 w-2 rounded-full ${COLUMN_DOT.contact}`} />
                {tx(contactCol?.titleBn ?? 'যোগাযোগ', contactCol?.titleEn ?? 'Contact')}
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-white/70">
                <li>📍 {tx('ধানমন্ডি, ঢাকা-১২০৫, বাংলাদেশ', 'Dhanmondi, Dhaka-1205, Bangladesh')}</li>
                <li>
                  <a href={`tel:${settings.supportPhone.replace(/\s/g, '')}`} className="transition-colors hover:text-white">
                    📞 {settings.supportPhone || '+880 1700-000000'}
                  </a>
                </li>
                <li>
                  <a href={`mailto:${settings.supportEmail}`} className="transition-colors hover:text-white">
                    ✉️ {settings.supportEmail || 'support@pathshala.com'}
                  </a>
                </li>
              </ul>
              {/* Social icons — only platforms configured by the admin */}
              {socials.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {socials.map(({ key, url, label, Icon, tone }) => (
                    <a
                      key={key}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      title={label}
                      className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/85 transition-all hover:scale-110 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${tone}`}
                    >
                      <Icon className="h-4 w-4" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {/* Copyright — admin-authored CODE rendered as HTML (per owner
            request: "admin panel e copyright code hisebe dewa jabe, ja dewa
            hobe website show korbe"). ONE line per active language:
              bn mode → Bangla line (with the linked developer credit inside)
              en mode → English line (with the linked developer credit inside)
            Only the site owner (admin) can edit these values via Settings →
            Footer copyright, so rendering them as HTML is intentional. Empty
            setting falls back to the built-in defaults above. */}
        <div className="mt-8 border-t border-white/10 pt-6">
          <div
            className="footer-copyright text-center text-xs text-white/60"
            dangerouslySetInnerHTML={{
              __html:
                lang === 'bn'
                  ? (settings.footerCopyrightBn.trim() || defaultCopyrightBn)
                  : (settings.footerCopyrightEn.trim() || defaultCopyrightEn),
            }}
          />
        </div>
      </div>
    </footer>
  )
}

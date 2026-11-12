import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { ArrowRight, Calculator, GraduationCap, Percent } from 'lucide-react'
import { SectionHeading } from '@/components/shared/section-heading'
import { serverOrigin } from '@/lib/site-origin'

/**
 * Page "/tools" — mini-tools hub.
 *
 * The sitemap.xml (and the footer's "মিনি টুলস" concept) reference a tools
 * section; until now only the three individual calculators existed and the
 * hub URL itself was a 404 — Google Search Console flags every sitemap URL
 * that resolves to 404 ("Submitted URL not found"), so this page completes
 * the set with a lightweight, fully server-rendered index. Zero client JS
 * of its own (only the shared SectionHeading boundary) — loads instantly.
 *
 * No existing page changes: this is a NEW route that was previously a 404.
 */
export const metadata: Metadata = {
  title: 'মিনি টুলস | Mini Tools',
  description:
    'ফ্রি অনলাইন এডুকেশনাল টুলস — GPA ক্যালকুলেটর, CGPA ক্যালকুলেটর ও শতকরা ↔ GPA রূপান্তর। SSC/HSC গ্রেডিং সিস্টেম অনুযায়ী সাথে সাথে হিসাব।',
  alternates: { canonical: '/tools' },
}

/** Language from the cookie — same rule as the root layout (bn default). */
async function readLang(): Promise<'bn' | 'en'> {
  const lang = (await cookies()).get('ps_lang')?.value
  return lang === 'en' ? 'en' : 'bn'
}

const TOOLS = [
  {
    href: '/tools/gpa-calculator',
    icon: Calculator,
    chip: 'grad-emerald',
    border: 'border-emerald-500/30',
    bn: { title: 'GPA ক্যালকুলেটর', desc: 'প্রতিটি বিষয়ের নম্বর দিলেই সাথে সাথে GPA ও গ্রেড — SSC ও HSC গ্রেডিং সিস্টেম অনুযায়ী।' },
    en: { title: 'GPA Calculator', desc: 'Enter subject marks and get instant GPA and letter grades — SSC & HSC grading systems.' },
  },
  {
    href: '/tools/cgpa-calculator',
    icon: GraduationCap,
    chip: 'grad-violet',
    border: 'border-violet-500/30',
    bn: { title: 'CGPA ক্যালকুলেটর', desc: 'একাধিক সেমিস্টার/বর্ষের GPA থেকে চূড়ান্ত CGPA — অনার্স ও বিশ্ববিদ্যালয় শিক্ষার্থীদের জন্য।' },
    en: { title: 'CGPA Calculator', desc: 'Combine multiple semester GPA values into a final CGPA — for honours and university students.' },
  },
  {
    href: '/tools/percentage-gpa',
    icon: Percent,
    chip: 'grad-amber',
    border: 'border-amber-500/30',
    bn: { title: 'শতকরা ↔ GPA', desc: 'শতকরা নম্বরকে GPA-তে এবং GPA-কে শতকরায় রূপান্তর — দুই দিকেই হিসাব এক জায়গায়।' },
    en: { title: 'Percentage ↔ GPA', desc: 'Convert percentage marks to GPA and back — both directions in one tool.' },
  },
] as const

/** Structured data — helps search engines understand the tools hub. */
function toolsJsonLd(base: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'পাঠশালা মিনি টুলস',
    url: `${base}/tools`,
    description:
      'PathShala free online educational tools — GPA calculator, CGPA calculator and percentage ↔ GPA converter.',
    hasPart: TOOLS.map((t) => ({
      '@type': 'WebApplication',
      name: t.bn.title,
      url: `${base}${t.href}`,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Any',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'BDT' },
    })),
  }
}

export default async function ToolsHubPage() {
  const lang = await readLang()
  // resolve the request origin through the shared helper (the
  // env pin wins when set; otherwise the serving host, on any domain).
  const base = await serverOrigin()

  return (
    <div className="mx-auto w-full max-w-4xl px-3.5 py-8 sm:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(toolsJsonLd(base)) }}
      />
      <SectionHeading
        title={lang === 'en' ? 'Mini Tools' : 'মিনি টুলস'}
        subtitle={
          lang === 'en'
            ? 'Free instant calculators — GPA, CGPA and percentage conversions, made for Bangladeshi students.'
            : 'ফ্রি ইনস্ট্যান্ট ক্যালকুলেটর — GPA, CGPA ও শতকরা রূপান্তর, বাংলাদেশি শিক্ষার্থীদের জন্য।'
        }
      />
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => {
          const copy = lang === 'en' ? t.en : t.bn
          const Icon = t.icon
          return (
            <article
              key={t.href}
              className={`pop-hover group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${t.border}`}
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-primary/15 via-accent to-amber-500/15">
                <div className="flex h-full items-center justify-center">
                  <span
                    className={`${t.chip} flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg transition-transform duration-500 group-hover:scale-110`}
                  >
                    <Icon className="h-8 w-8" aria-hidden />
                  </span>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="line-clamp-2 min-h-[44px] text-base font-semibold leading-snug transition-colors group-hover:text-primary">
                  <Link href={t.href} className="after:absolute after:inset-0 after:content-['']">
                    {copy.title}
                  </Link>
                </h3>
                <p className="line-clamp-3 text-sm text-muted-foreground">{copy.desc}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-primary">
                  {lang === 'en' ? 'Open' : 'খুলুন'}
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                    aria-hidden
                  />
                </span>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

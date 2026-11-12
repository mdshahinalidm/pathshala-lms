'use client'

/**
 * SitemapView — human-readable URL directory at /sitemap.
 *
 * Every public URL grouped by section with absolute URL + one-click copy.
 * "Copy all URLs" copies the complete list (newline-separated) ready to
 * paste into Google Search Console for instant crawling & indexing.
 * Pure display component — data is fetched server-side by the page.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Home,
  Info,
  ListTree,
  Megaphone,
  Package,
  Scale,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useUI } from '@/store/ui-store'

export interface SitemapUrl {
  path: string
  titleBn: string
  titleEn: string
  priority: number
  freq: string
  lastModified?: string
}

export interface SitemapSection {
  key: string
  titleBn: string
  titleEn: string
  urls: SitemapUrl[]
}

const SECTION_ICONS: Record<string, typeof Home> = {
  main: Home,
  courses: ListTree,
  combos: Package,
  notices: Megaphone,
  tools: Wrench,
  policy: Scale,
}

const FREQ_BN: Record<string, string> = {
  daily: 'প্রতিদিন',
  weekly: 'সাপ্তাহিক',
  monthly: 'মাসিক',
  yearly: 'বার্ষিক',
}

export function SitemapView({ sections, base }: { sections: SitemapSection[]; base: string }) {
  const { lang } = useUI()
  const bn = lang === 'bn'
  const { toast } = useToast()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const total = useMemo(() => sections.reduce((n, s) => n + s.urls.length, 0), [sections])

  const allUrls = useMemo(
    () => sections.flatMap((s) => s.urls.map((u) => `${base}${u.path}`)),
    [sections, base]
  )

  async function copyText(text: string, key: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      toast({ description: label })
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000)
    } catch {
      toast({ description: bn ? 'কপি করা যায়নি — ম্যানুয়ালি সিলেক্ট করুন' : 'Could not copy — select manually' })
    }
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <section className="hero-dots relative overflow-hidden border-b bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto w-full max-w-7xl px-3.5 py-10 sm:py-14">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Globe className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                {bn ? 'সাইটম্যাপ — সব পেজের তালিকা' : 'Sitemap — All Pages'}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {bn
                  ? 'গুগল সার্চ কনসোলে সাবমিট করার জন্য প্রস্তুত সম্পূর্ণ URL তালিকা — ইনস্ট্যান্ট ক্রল ও ইনডেক্সিংয়ের জন্য।'
                  : 'Complete URL list ready for Google Search Console submission — for instant crawling & indexing.'}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
              <ListTree className="h-4 w-4" />
              {total} {bn ? 'টি URL' : 'URLs'}
            </Badge>
            <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
              <FileText className="h-4 w-4" />
              <a className="hover:underline" href="/sitemap.xml" target="_blank" rel="noreferrer">
                {bn ? 'XML সাইটম্যাপ' : 'XML sitemap'}
              </a>
            </Badge>
            <Button size="sm" className="gap-2 min-h-11" onClick={() => copyText(allUrls.join('\n'), '__all__', bn ? 'সব URL কপি হয়েছে' : 'All URLs copied')}>
              {copiedKey === '__all__' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {bn ? 'সব URL কপি করুন' : 'Copy all URLs'}
            </Button>
          </div>
        </div>
      </section>

      {/* GSC hint */}
      <section className="mx-auto w-full max-w-7xl px-3.5 pt-6">
        <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            {bn ? (
              <>
                <strong className="text-foreground">Google Search Console:</strong>{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">সাইটম্যাপ → নতুন সাইটম্যাপ যোগ করুন</code>-এ গিয়ে{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/sitemap.xml</code> জমা দিন, অথবা{' '}
                <strong className="text-foreground">URL পরিদর্শন</strong>-এ নিচের যেকোনো URL পেস্ট করে{' '}
                <em>ইনডেক্সিংয়ের জন্য অনুরোধ</em> করুন।
              </>
            ) : (
              <>
                <strong className="text-foreground">Google Search Console:</strong> submit{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/sitemap.xml</code> under{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">Sitemaps → Add a new sitemap</code>, or paste any URL
                below into <strong className="text-foreground">URL Inspection</strong> →{' '}
                <em>Request indexing</em>.
              </>
            )}
          </p>
        </div>
      </section>

      {/* Sections */}
      <section className="mx-auto grid w-full max-w-7xl gap-4 px-3.5 py-6 sm:py-8">
        {sections.map((section) => {
          const Icon = SECTION_ICONS[section.key] ?? FileText
          const isCollapsed = collapsed[section.key] ?? section.urls.length > 60
          const visible = isCollapsed ? section.urls.slice(0, 30) : section.urls
          return (
            <Card key={section.key} className="overflow-hidden">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b bg-muted/30 py-3.5">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  {bn ? section.titleBn : section.titleEn}
                  <Badge variant="secondary" className="ml-1">
                    {section.urls.length}
                  </Badge>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-9 gap-1.5 text-xs"
                  onClick={() => copyText(section.urls.map((u) => `${base}${u.path}`).join('\n'), section.key, bn ? 'সেকশনের URL কপি হয়েছে' : 'Section URLs copied')}
                >
                  {copiedKey === section.key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {bn ? 'কপি' : 'Copy'}
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {visible.map((u) => (
                    <li key={u.path} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40">
                      <div className="min-w-0">
                        <Link href={u.path} className="block truncate text-sm font-medium hover:text-primary hover:underline">
                          {bn ? u.titleBn : u.titleEn}
                        </Link>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {u.path}
                          {u.lastModified ? ` · ${new Date(u.lastModified).toLocaleDateString(bn ? 'bn-BD' : 'en-US')}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge variant="outline" className="hidden font-mono text-[10px] sm:inline-flex">
                          P{u.priority.toFixed(1)} · {bn ? FREQ_BN[u.freq] ?? u.freq : u.freq}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={bn ? 'URL কপি করুন' : 'Copy URL'}
                          onClick={() => copyText(`${base}${u.path}`, u.path, bn ? 'URL কপি হয়েছে' : 'URL copied')}
                        >
                          {copiedKey === u.path ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                        <a
                          href={`${base}${u.path}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={bn ? 'নতুন ট্যাবে খুলুন' : 'Open in new tab'}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
                {section.urls.length > 30 && (
                  <div className="border-t p-2 text-center">
                    <Button variant="ghost" size="sm" className="min-h-9 gap-1.5 text-xs" onClick={() => setCollapsed((c) => ({ ...c, [section.key]: !isCollapsed }))}>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
                      {isCollapsed
                        ? bn
                          ? `আরও ${section.urls.length - 30} টি দেখুন`
                          : `Show ${section.urls.length - 30} more`
                        : bn
                          ? 'সংকুচিত করুন'
                          : 'Collapse'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </section>
    </main>
  )
}

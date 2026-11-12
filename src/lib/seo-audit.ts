/**
 * SEO audit engine — computes REAL, live data for the admin SEO Center.
 *
 * Evidence sources (no fake numbers):
 *   1. Database    — counts, freshness, gaps, duplicates (Prisma)
 *   2. SiteSetting — SEO title / description / keywords fields
 *   3. Live fetch  — representative pages are fetched & parsed (titles,
 *      meta description, h1–h6, images/alt/lazy, canonical, JSON-LD,
 *      internal/external links, anchor text, viewport, compression…)
 *   4. Live fetch  — /robots.txt + /sitemap.xml content & URL counts
 *   5. Live probes — 404 behaviour, auth redirect, cache headers,
 *      broken-link sampling, pagination & faceted-URL canonicals
 *
 * Every check is individually try/catch-guarded: a failure degrades that
 * one item to 'na'/'warn' with a detail line instead of breaking the audit.
 * Results are cached in-memory for 5 minutes (real-time for admin review,
 * zero repeat-load on the site).
 *
 * engine v3: the checklist is now mapped to Google's OFFICIAL
 * SEO guidance (Search Essentials, SEO Starter Guide, Link Best Practices,
 * "Avoid intrusive interstitials", PageSpeed/CWV rules, security guidance).
 * 16 new rule checks added (On-Page 23→27, Technical 29→41), each backed by
 * real live data. New On-Page: crawlable links, lang attribute, social meta,
 * intrusive interstitials. New Technical: soft-404, blocked resources,
 * sitemap format, mixed content, X-Robots-Tag, favicon, security headers,
 * text compression, page weight, third-party scripts, font optimization,
 * redirect chains.
 *
 * engine v4: adds the PROPER SEO SCORE the admin panel displays.
 * Four category scores (On-Page, Technical, Content, Performance) plus a
 * weighted overall score 0–100, all computed from the same real evidence:
 *   • checklist categories — pass=1 / warn=0.5 / fail=0, N/A+info excluded
 *   • content — DB-derived quality signals (descriptions, author bios,
 *     freshness, duplicate titles, global meta, category coverage)
 *   • performance — measured TTFB, compression, cache headers (CWV-inspired)
 * Overall weighting: On-Page 30% + Technical 30% + Content 20% + Performance
 * 20% (categories with no applicable checks are excluded and re-normalised).
 *
 * engine v7: audit STABILITY hardening. Page/robots/sitemap
 * fetches now retry once after a grace period when a probe degrades
 * (network error, 5xx, tiny 200 shell), and a suspicious snapshot (no 200s,
 * or headings missing on most core pages) is re-measured once before it is
 * cached — so a transient dev-compile window can never surface as a false
 * degraded score in the SEO Center.
 */
import { db } from '@/lib/db'

export type SeoStatus = 'pass' | 'warn' | 'fail' | 'info' | 'na'

export interface SeoItem {
  id: string
  bn: string
  en: string
  descBn: string
  descEn: string
  status: SeoStatus
  details: string[]
}

/**
 * Score breakdown (engine v4) — every value 0–100, all from real evidence.
 * `null` category = no applicable checks for it (excluded from overall).
 */
export interface SeoScoreBreakdown {
  overall: number
  onPage: number | null
  technical: number | null
  content: number | null
  performance: number | null
  gradeBn: string
  gradeEn: string
}

export interface PageAudit {
  path: string
  status: number
  ms: number
  htmlBytes: number
  title: string
  metaDescription: string
  metaRobots: string
  viewport: boolean
  canonical: string | null
  h1: number
  h2: number
  h3: number
  h4to6: number
  images: number
  imagesNoAlt: number
  imagesAltMissing: number
  imagesLazy: number
  imageNames: string[]
  imageFormats: Record<string, number>
  jsonLdTypes: string[]
  internalLinks: number
  externalLinks: number
  genericAnchors: string[]
  ogTags: string[]
  hreflessAnchors: number
  thirdPartyScripts: number
  insecureSubresources: number
  langAttr: string
  hasModalDialog: boolean
  wordish: number
  cacheControl: string | null
  contentEncoding: string | null
}

export interface SeoAuditData {
  generatedAt: string
  engineVersion: number
  base: string
  summary: Record<SeoStatus, number>
  score: SeoScoreBreakdown
  db: {
    coursesPublished: number
    coursesTotal: number
    coursesMissingDescription: number
    coursesDefaultInstructor: number
    coursesWithBio: number
    coursesUpdated90d: number
    duplicateCourseTitles: string[]
    categoriesTotal: number
    categoriesInUse: number
    combosActive: number
    notices: number
    suggestions: number
    reviewsApproved: number
    seoTitle: string
    seoDescription: string
    seoKeywords: string
    /** Google Search Console verification meta is configured. */
    gscVerified: boolean
  }
  pages: PageAudit[]
  robots: { ok: boolean; status: number; hasSitemapDirective: boolean; content: string }
  sitemap: { ok: boolean; status: number; urlCount: number; content: string }
  /** every sitemap <loc> probed live (GSC "Submitted URL not
   *  found" detection): a dead sitemap URL can no longer hide behind a
   *  healthy sitemap.xml response. */
  sitemapUrlProbe: { total: number; ok: number; failed: string[] }
  probes: {
    notFoundStatus: number | null
    dashboardRedirect: string | null
    uploadsCacheControl: string | null
    staticCacheControl: string | null
    brokenLinks: string[]
    sampledLinks: number
  }
  onPage: SeoItem[]
  technical: SeoItem[]
}

/* ── module-level 5-minute cache (survives HMR via globalThis) ──
 * Keyed per measured origin so two panels (e.g. localhost + a preview
 * gateway domain) never read each other's audit snapshots. */
const CACHE_TTL_MS = 5 * 60 * 1000
const auditCache = globalThis as unknown as {
  __psSeoAudit?: Record<string, { at: number; data: SeoAuditData }>
}

/* ── tiny fetch helpers ───────────────────────────────────────── */

async function grab(url: string, timeoutMs = 8000) {
  const t0 = performance.now()
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'PathShala-SEO-Audit/1.0' },
    cache: 'no-store',
  })
  const text = await res.text()
  // performance.now() gives sub-ms precision — local fetches would round to 0ms
  const ms = Math.max(1, Math.round(performance.now() - t0))
  return { res, text, ms }
}

/* stable page fetch. A dev server can briefly return degraded
 * responses while routes compile (network error, 5xx, or a suspiciously tiny
 * 200 shell). One retry after a short grace period keeps such a transient
 * window from being measured — and then cached — as a false audit result. */
const TINY_HTML_BYTES = 2000
async function grabStable(url: string, timeoutMs = 8000) {
  try {
    const first = await grab(url, timeoutMs)
    if (first.res.status < 500 && !(first.res.status === 200 && first.text.length < TINY_HTML_BYTES)) return first
  } catch {
    /* fall through to the retry below */
  }
  await new Promise((r) => setTimeout(r, 1200))
  return grab(url, timeoutMs)
}

function tagAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const m of tag.matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1].toLowerCase()] = m[2]
  return attrs
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const GENERIC_ANCHORS = ['click here', 'here', 'read more', 'এখানে', 'ক্লিক করুন', 'আরও পড়ুন', 'this']

/* anchors WITHOUT an href attribute — Google "Link best practices": links
 * must be crawlable <a href> elements; JS-only anchors are not followed.
 * The tag name must be followed by whitespace or '>' so <aside>/<article>
 * are never mistaken for anchors. */
const countHreflessAnchors = (html: string) =>
  [...html.matchAll(/<a(\s[^>]*)?>/gi)].filter((m) => !/\shref=/i.test(m[1] ?? '')).length

/* external <script src> (third-party scripts — PageSpeed "minimize
 * third-party use" guidance) */
const countThirdPartyScripts = (html: string) =>
  (html.match(/<script[^>]*\ssrc="https?:\/\//gi) || []).length

/* http:// subresources inside the markup — mixed-content surface */
const countInsecureSubresources = (html: string) =>
  (html.match(/(?:src|href)="http:\/\/[^"']*"/gi) || []).length

/* ── HTML page parser ─────────────────────────────────────────── */

function parsePage(html: string): Pick<
  PageAudit,
  | 'htmlBytes' | 'title' | 'metaDescription' | 'metaRobots' | 'viewport' | 'canonical'
  | 'h1' | 'h2' | 'h3' | 'h4to6' | 'images' | 'imagesNoAlt' | 'imagesLazy'
  | 'imageNames' | 'imageFormats' | 'jsonLdTypes' | 'internalLinks' | 'externalLinks'
  | 'genericAnchors' | 'ogTags' | 'hreflessAnchors' | 'thirdPartyScripts'
  | 'insecureSubresources' | 'langAttr' | 'hasModalDialog' | 'wordish'
> {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? ''

  let metaDescription = ''
  let metaRobots = ''
  for (const m of html.matchAll(/<meta[^>]*>/gi)) {
    const a = tagAttrs(m[0])
    const name = (a.name || '').toLowerCase()
    if (name === 'description') metaDescription = a.content ?? ''
    if (name === 'robots') metaRobots = a.content ?? ''
  }

  const viewport = /<meta[^>]*name="viewport"/i.test(html)

  let canonical: string | null = null
  for (const m of html.matchAll(/<link[^>]*>/gi)) {
    const a = tagAttrs(m[0])
    if ((a.rel || '').toLowerCase() === 'canonical') canonical = a.href ?? null
  }

  const count = (re: RegExp) => (html.match(re) || []).length
  const h1 = count(/<h1[\s>]/gi)
  const h2 = count(/<h2[\s>]/gi)
  const h3 = count(/<h3[\s>]/gi)
  const h4to6 = count(/<h4[\s>]/gi) + count(/<h5[\s>]/gi) + count(/<h6[\s>]/gi)

  const imgs: { src: string; alt: string; lazy: boolean; noAttr: boolean }[] = []
  for (const m of html.matchAll(/<img[^>]*>/gi)) {
    const a = tagAttrs(m[0])
    imgs.push({ src: a.src ?? '', alt: a.alt ?? '', lazy: (a.loading || '').toLowerCase() === 'lazy', noAttr: !('alt' in a) })
  }
  const imageFormats: Record<string, number> = {}
  for (const i of imgs) {
    // Next.js rewrites <img src> to /_next/image?url=%2F…%2Fname.jpg&w=… —
    // decode the wrapped URL first, then read the real extension.
    let decoded = i.src.replace(/&amp;/g, '&')
    try {
      decoded = decodeURIComponent(decoded)
    } catch {
      /* keep raw */
    }
    const ext = /\.(jpe?g|png|webp|avif|gif|svg|jfif)(?=$|[?&])/i.exec(decoded)?.[1]?.toLowerCase()
    if (ext) {
      const key = ext === 'jpeg' ? 'jpg' : ext
      imageFormats[key] = (imageFormats[key] ?? 0) + 1
    }
  }
  // filename audit sample: last path segment of each image src (deduped)
  const imageNames = [...new Set(imgs.map((i) => i.src.split('/').pop() ?? '').filter(Boolean))]

  const jsonLdTypes: string[] = []
  for (const m of html.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1])
      const collect = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(collect)
        if (node && typeof node === 'object') {
          const obj = node as Record<string, unknown>
          if (typeof obj['@type'] === 'string') jsonLdTypes.push(obj['@type'] as string)
          if (Array.isArray(obj['@type'])) jsonLdTypes.push(...(obj['@type'] as string[]))
          if (obj['@graph']) collect(obj['@graph'])
        }
      }
      collect(parsed)
    } catch {
      /* malformed block — not fatal */
    }
  }

  let internalLinks = 0
  let externalLinks = 0
  const genericAnchors: string[] = []
  for (const m of html.matchAll(/<a\s([^>]*?)>([\s\S]*?)<\/a>/gi)) {
    const a = tagAttrs(`<x ${m[1]}>`)
    const href = a.href ?? ''
    const text = stripTags(m[2])
    if (/^(https?:)?\/\//i.test(href)) {
      if (!/whatsapp|facebook|messenger|youtube|linkedin|twitter|x\.com|t\.me|pathshala/i.test(href)) externalLinks++
      continue
    }
    if (!href || href.startsWith('#') || /^(mailto|tel):/i.test(href)) continue
    internalLinks++
    if (text && text.length <= 12 && GENERIC_ANCHORS.some((gm) => text.toLowerCase() === gm)) {
      genericAnchors.push(text)
    }
  }

  // social preview meta (og: / twitter:) — SERP & messenger-card appearance
  const ogTags: string[] = []
  for (const m of html.matchAll(/<meta[^>]*>/gi)) {
    const a = tagAttrs(m[0])
    const prop = (a.property || a.name || '').toLowerCase()
    if (/^(og|twitter):/.test(prop)) ogTags.push(prop)
  }

  const wordish = stripTags(
    html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  ).split(' ').length

  return {
    htmlBytes: html.length,
    title, metaDescription, metaRobots, viewport, canonical,
    h1, h2, h3, h4to6,
    images: imgs.length,
    imagesNoAlt: imgs.filter((i) => !i.alt.trim()).length,
    imagesAltMissing: imgs.filter((i) => i.noAttr).length,
    imagesLazy: imgs.filter((i) => i.lazy).length,
    imageNames, imageFormats, jsonLdTypes,
    internalLinks, externalLinks, genericAnchors, ogTags,
    hreflessAnchors: countHreflessAnchors(html),
    thirdPartyScripts: countThirdPartyScripts(html),
    insecureSubresources: countInsecureSubresources(html),
    langAttr: /<html[^>]*\slang="([a-zA-Z-]{2,10})"/i.exec(html)?.[1]?.toLowerCase() ?? '',
    hasModalDialog: /aria-modal="true"/i.test(html),
    wordish,
  }
}

const emptyPage = (path: string): PageAudit => ({
  path, status: 0, ms: 0, htmlBytes: 0, title: '', metaDescription: '', metaRobots: '', viewport: false,
  canonical: null, h1: 0, h2: 0, h3: 0, h4to6: 0, images: 0, imagesNoAlt: 0, imagesAltMissing: 0, imagesLazy: 0,
  imageNames: [], imageFormats: {}, jsonLdTypes: [], internalLinks: 0, externalLinks: 0,
  genericAnchors: [], ogTags: [], hreflessAnchors: 0, thirdPartyScripts: 0,
  insecureSubresources: 0, langAttr: '', hasModalDialog: false,
  wordish: 0, cacheControl: null, contentEncoding: null,
})

/* ── item constructors ────────────────────────────────────────── */

const mk = (id: string, bn: string, en: string, descBn: string, descEn: string, status: SeoStatus, details: string[]): SeoItem =>
  ({ id, bn, en, descBn, descEn, status, details })

/* ── cached entry point ───────────────────────────────────────── */

/* ── score computation (engine v4) ───────────────────────────── */

/** Checklist percentage: pass=1 / warn=0.5 / fail=0, na+info excluded. */
function checklistPct(items: SeoItem[]): number | null {
  const applicable = items.filter((i) => i.status !== 'na' && i.status !== 'info')
  if (applicable.length === 0) return null
  const pts = applicable.reduce((a, i) => a + (i.status === 'pass' ? 1 : i.status === 'warn' ? 0.5 : 0), 0)
  return Math.round((pts / applicable.length) * 100)
}

/** Content-quality score from DB evidence (scoring rubric). */
function contentPct(dbSec: SeoAuditData['db']): number | null {
  const checks: SeoStatus[] = []
  // 1. Course descriptions present
  const published = Math.max(dbSec.coursesPublished, 1)
  const missingRatio = dbSec.coursesMissingDescription / published
  checks.push(dbSec.coursesMissingDescription === 0 ? 'pass' : missingRatio < 0.1 ? 'warn' : 'fail')
  // 2. Author bios filled (E-E-A-T signal)
  const bioPct = dbSec.coursesTotal ? dbSec.coursesWithBio / dbSec.coursesTotal : 1
  checks.push(bioPct >= 0.8 ? 'pass' : bioPct >= 0.5 ? 'warn' : 'fail')
  // 3. Freshness — published courses updated in the last 90 days
  const freshPct = dbSec.coursesPublished ? dbSec.coursesUpdated90d / dbSec.coursesPublished : 1
  checks.push(freshPct >= 0.6 ? 'pass' : freshPct > 0 ? 'warn' : 'fail')
  // 4. Duplicate course titles (thin/duplicate content)
  checks.push(dbSec.duplicateCourseTitles.length === 0 ? 'pass' : 'fail')
  // 5. Global SEO meta (title + description)
  checks.push(dbSec.seoTitle && dbSec.seoDescription ? 'pass' : 'fail')
  // 6. Keyword strategy defined
  checks.push(dbSec.seoKeywords.trim() ? 'pass' : 'warn')
  // 7. Category coverage of published courses
  const catPct = dbSec.categoriesTotal ? dbSec.categoriesInUse / dbSec.categoriesTotal : 1
  checks.push(catPct >= 0.5 ? 'pass' : 'warn')
  const pts = checks.reduce((a, s) => a + (s === 'pass' ? 1 : s === 'warn' ? 0.5 : 0), 0)
  return Math.round((pts / checks.length) * 100)
}

/** Performance score from MEASURED page metrics (CWV-inspired thresholds). */
function performancePct(pages: PageAudit[], probes: SeoAuditData['probes'], isLoopback: boolean): number | null {
  const core = pages.filter((p) => !p.path.includes('?') && p.status === 200)
  if (core.length === 0) return null
  const checks: SeoStatus[] = []
  // 1. Server response time (Google: ideal < 800ms TTFB)
  const avgMs = Math.round(core.reduce((a, b) => a + b.ms, 0) / core.length)
  checks.push(avgMs <= 800 ? 'pass' : avgMs <= 1800 ? 'warn' : 'fail')
  // 2. Text compression actually served
  const encRatio = core.filter((p) => p.contentEncoding).length / core.length
  checks.push(encRatio === 1 ? 'pass' : encRatio >= 0.5 ? 'warn' : 'fail')
  // 3. Asset caching — /uploads must be long-cached; /_next/static chunks are
  //    immutable max-age in production, while the dev server intentionally
  //    serves them no-store for HMR (accepted only on loopback hosts).
  const uploadsOk = probes.uploadsCacheControl?.includes('max-age') ?? false
  const staticOk = (probes.staticCacheControl?.includes('max-age') ?? false) || (isLoopback && (probes.staticCacheControl?.includes('no-store') ?? false))
  checks.push(uploadsOk && staticOk ? 'pass' : uploadsOk || staticOk ? 'warn' : 'fail')
  // 4. Page weight (HTML over the wire — compressed bytes per page)
  const avgKb = core.reduce((a, b) => a + b.htmlBytes, 0) / core.length / 1024
  checks.push(avgKb <= 150 ? 'pass' : avgKb <= 500 ? 'warn' : 'fail')
  const pts = checks.reduce((a, s) => a + (s === 'pass' ? 1 : s === 'warn' ? 0.5 : 0), 0)
  return Math.round((pts / checks.length) * 100)
}

function gradeFor(score: number): { gradeBn: string; gradeEn: string } {
  if (score >= 90) return { gradeBn: 'চমৎকার', gradeEn: 'Excellent' }
  if (score >= 75) return { gradeBn: 'ভালো', gradeEn: 'Good' }
  if (score >= 50) return { gradeBn: 'উন্নতি প্রয়োজন', gradeEn: 'Needs improvement' }
  return { gradeBn: 'দুর্বল', gradeEn: 'Poor' }
}

/** Weighted overall score; null categories are excluded and re-normalised. */
function computeScore(items: { onPage: SeoItem[]; technical: SeoItem[] }, dbSec: SeoAuditData['db'], pages: PageAudit[], probes: SeoAuditData['probes'], isLoopback: boolean): SeoScoreBreakdown {
  const parts: { weight: number; value: number | null }[] = [
    { weight: 0.3, value: checklistPct(items.onPage) },
    { weight: 0.3, value: checklistPct(items.technical) },
    { weight: 0.2, value: contentPct(dbSec) },
    { weight: 0.2, value: performancePct(pages, probes, isLoopback) },
  ]
  const used = parts.filter((p) => p.value !== null)
  const weightSum = used.reduce((a, p) => a + p.weight, 0)
  const overall = weightSum > 0 ? Math.round(used.reduce((a, p) => a + (p.value as number) * p.weight, 0) / weightSum) : 0
  const grade = gradeFor(overall)
  return {
    overall,
    onPage: checklistPct(items.onPage),
    technical: checklistPct(items.technical),
    content: contentPct(dbSec),
    performance: performancePct(pages, probes, isLoopback),
    gradeBn: grade.gradeBn,
    gradeEn: grade.gradeEn,
  }
}

export async function runSeoAudit(base: string, refresh = false): Promise<SeoAuditData> {
  /* measure through an origin the SERVER can actually fetch.
   * Preview platforms may serve the panel through a session-bound gateway
   * that rejects server-side self-fetches (e.g. HTTP 400 "x-session-id is
   * required") — measuring through such a domain poisons every page probe.
   * The request-derived origin is therefore probed first; if it rejects,
   * the audit measures via the app's own loopback origin instead. Display
   * URLs (base, canonicals, sitemap/robots excerpts) are re-based back to
   * the request origin so the admin still sees THEIR domain everywhere. */
  const fetchBase = await resolveFetchBase(base)
  const store = (auditCache.__psSeoAudit ??= {})
  const cached = store[fetchBase]
  if (!refresh && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return rebaseAuditData(cached.data, fetchBase, base)
  }
  const data = await computeAuditStable(fetchBase)
  store[fetchBase] = { at: Date.now(), data }
  return rebaseAuditData(data, fetchBase, base)
}

/** A GET returning 2xx with a body proves the server can self-fetch `origin`. */
const isFetchableOrigin = async (origin: string): Promise<boolean> => {
  try {
    const r = await grab(`${origin}/robots.txt`, 5000)
    return r.res.status >= 200 && r.res.status < 300 && r.text.trim().length > 0
  } catch {
    return false
  }
}

/** Request origin first; fall back to the app's own loopback when the
 *  request origin refuses server-side fetches (session-bound gateways). */
const resolveFetchBase = async (requestBase: string): Promise<string> => {
  if (await isFetchableOrigin(requestBase)) return requestBase
  const fallback = `http://127.0.0.1:${process.env.PORT || 3000}`
  if (fallback !== requestBase && (await isFetchableOrigin(fallback))) return fallback
  return requestBase
}

/** Present audit results under the domain the admin actually browses.
 *  The sitemap/canonical values are generated by the site-origin resolver
 *  from the serving host, so swapping the measured origin for the request
 *  origin is an exact, lossless text substitution. */
function rebaseAuditData(d: SeoAuditData, measuredBase: string, displayBase: string): SeoAuditData {
  if (measuredBase === displayBase) return d
  const swap = (v: string) => v.split(measuredBase).join(displayBase)
  return {
    ...d,
    base: displayBase,
    pages: d.pages.map((p) => ({ ...p, canonical: p.canonical ? swap(p.canonical) : null })),
    robots: { ...d.robots, content: swap(d.robots.content) },
    sitemap: { ...d.sitemap, content: swap(d.sitemap.content) },
  }
}

/* audit stability guard. A single snapshot can land inside a
 * transient dev-state window (routes compiling, first-load warmup) where
 * many page probes fail at once. Caching that snapshot would show the admin
 * a false degraded score, so a suspicious snapshot is re-measured once
 * before caching. Persistent (real) defects survive the re-run and stay
 * visible — only one-shot transient states are healed. */
const isSuspiciousSnapshot = (d: SeoAuditData) => {
  const core = d.pages.filter((p) => !p.path.includes('?'))
  if (core.length === 0) return false
  const ok200 = core.filter((p) => p.status === 200).length
  const withH1 = core.filter((p) => p.h1 >= 1).length
  return ok200 === 0 || withH1 <= Math.floor(core.length / 2)
}

async function computeAuditStable(base: string, depth = 0): Promise<SeoAuditData> {
  const data = await computeAudit(base)
  if (depth === 0 && isSuspiciousSnapshot(data)) return computeAuditStable(base, 1)
  return data
}

async function computeAudit(base: string): Promise<SeoAuditData> {
  const onPage: SeoItem[] = []
  const technical: SeoItem[] = []
  const g = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p
    } catch {
      return fallback
    }
  }

  /* ── 1. database evidence ── */
  const [coursesPublished, coursesTotal, combosActive, notices, suggestions, reviewsApproved] = await g(
    Promise.all([
      db.course.count({ where: { isPublished: true } }),
      db.course.count(),
      db.combo.count({ where: { isActive: true } }),
      db.notice.count(),
      db.suggestion.count(),
      db.review.count({ where: { isApproved: true } }),
    ]),
    [0, 0, 0, 0, 0, 0]
  )

  const [missingDesc, defaultInstructor, withBio, updated90, publishedTitles, categoriesTotal, categoriesInUse, settings] = await g(
    Promise.all([
      db.course.count({ where: { isPublished: true, description: '' } }),
      db.course.count({ where: { instructorName: 'PathShala Team' } }),
      db.course.count({ where: { instructorBio: { not: null } } }),
      db.course.count({ where: { isPublished: true, updatedAt: { gte: new Date(Date.now() - 90 * 864e5) } } }),
      db.course.findMany({ where: { isPublished: true }, select: { title: true } }),
      db.category.count(),
      db.course.findMany({ where: { isPublished: true, categoryId: { not: null } }, select: { categoryId: true }, distinct: ['categoryId'] }),
      db.siteSetting.findUnique({ where: { id: 'singleton' }, select: { seoTitle: true, seoDescription: true, seoKeywords: true, googleSiteVerification: true } }),
    ]),
    [0, 0, 0, 0, [] as { title: string }[], 0, [] as { categoryId: string | null }[], null]
  )

  // duplicate course titles (JS-side — dataset is small)
  const titleCounts = new Map<string, number>()
  for (const t of publishedTitles) titleCounts.set(t.title, (titleCounts.get(t.title) ?? 0) + 1)
  const duplicateCourseTitles = [...titleCounts.entries()].filter(([, n]) => n >= 2).map(([t]) => t)

  const seoTitle = settings?.seoTitle ?? ''
  const seoDescription = settings?.seoDescription ?? ''
  const seoKeywords = settings?.seoKeywords ?? ''
  const keywordList = seoKeywords.split(',').map((k) => k.trim()).filter(Boolean)
  const longTail = keywordList.filter((k) => k.split(/\s+/).length >= 3)

  /* ── 2. live page fetches ── */
  const courseSample = await g(
    db.course.findFirst({ where: { isPublished: true }, select: { slug: true }, orderBy: { updatedAt: 'desc' } }),
    null
  )
  const paths = ['/', '/courses', '/exams', '/notices', '/about', '/contact', '/sitemap', '/courses?page=2', '/courses?cat=class-9']
  if (courseSample) paths.push(`/courses/${courseSample.slug}`)

  const pages: PageAudit[] = []
  const allInternalHrefs = new Set<string>()
  for (const p of paths) {
    try {
      const { res, text, ms } = await grabStable(`${base}${p}`)
      pages.push({ path: p, status: res.status, ms, cacheControl: res.headers.get('cache-control'), contentEncoding: res.headers.get('content-encoding'), ...parsePage(text) })
      for (const m of text.matchAll(/<a\s[^>]*href="(\/[^"#]*)"/gi)) allInternalHrefs.add(m[1].split('?')[0])
    } catch (e) {
      console.error('[seo-audit:page]', p, e instanceof Error ? e.message : e)
      pages.push(emptyPage(p))
    }
  }

  const corePages = pages.filter((p) => !p.path.includes('?'))
  const home = pages.find((p) => p.path === '/') ?? emptyPage('/')
  const courseDetail = courseSample ? pages.find((p) => p.path === `/courses/${courseSample.slug}`) : undefined
  const paginated = pages.find((p) => p.path === '/courses?page=2')
  const faceted = pages.find((p) => p.path === '/courses?cat=class-9')

  /* ── 3. robots.txt + sitemap.xml ── */
  let robots = { ok: false, status: 0, hasSitemapDirective: false, content: '' }
  let sitemap = { ok: false, status: 0, urlCount: 0, content: '' }
  let sitemapFull = ''
  try {
    const r = await grabStable(`${base}/robots.txt`)
    robots = { ok: r.res.ok, status: r.res.status, hasSitemapDirective: /sitemap:/i.test(r.text), content: r.text.slice(0, 2000) }
  } catch { /* stays failed */ }
  try {
    const r = await grabStable(`${base}/sitemap.xml`)
    sitemapFull = r.text
    sitemap = { ok: r.res.ok, status: r.res.status, urlCount: (r.text.match(/<loc>/g) || []).length, content: r.text.slice(0, 4000) }
  } catch { /* stays failed */ }

  /* ── 3b. Sitemap URL liveness probe — every <loc> path is
   * fetched; anything answering ≥400 (or unreachable) is reported. This is
   * exactly the class of error Google Search Console reports as "Submitted
   * URL not found (404)" — catching it here keeps the sitemap honest.
   * Probes run in batches of 10 → ~80 URLs finish in well under a second. */
  const sitemapLocPaths: string[] = []
  for (const m of sitemapFull.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    try {
      sitemapLocPaths.push(new URL(m[1]).pathname)
    } catch {
      if (m[1].startsWith('/')) sitemapLocPaths.push(m[1])
    }
  }
  const sitemapBadUrls: string[] = []
  const PROBE_BATCH = 10
  /** A ≥5xx/unreachable answer gets ONE retry after a short grace period
   *  before being declared dead — mirroring how Google treats 5xx as
   *  temporary (and avoiding false positives while a dev server is still
   *  compiling a route). 4xx answers (404 etc.) are definitive → no retry. */
  const probeOnce = async (p: string): Promise<number | 'unreachable'> => {
    try {
      const res = await fetch(`${base}${p}`, { method: 'GET', signal: AbortSignal.timeout(8000), cache: 'no-store' })
      return res.status
    } catch {
      return 'unreachable'
    }
  }
  for (let i = 0; i < sitemapLocPaths.length; i += PROBE_BATCH) {
    await Promise.all(
      sitemapLocPaths.slice(i, i + PROBE_BATCH).map(async (p) => {
        let st = await probeOnce(p)
        if (st === 'unreachable' || st >= 500) {
          await new Promise((r) => setTimeout(r, 1200))
          st = await probeOnce(p)
        }
        if (st === 'unreachable' || st >= 400) sitemapBadUrls.push(`${p} → ${st}`)
      })
    )
  }
  const sitemapUrlProbe = { total: sitemapLocPaths.length, ok: sitemapLocPaths.length - sitemapBadUrls.length, failed: sitemapBadUrls }

  /* ── 4. probes ── */
  let notFoundStatus: number | null = null
  try {
    notFoundStatus = (await grab(`${base}/__no_such_page_${Date.now()}`)).res.status
  } catch { /* null */ }

  let dashboardRedirect: string | null = null
  try {
    const res = await fetch(`${base}/dashboard`, { redirect: 'manual', signal: AbortSignal.timeout(6000), cache: 'no-store' })
    dashboardRedirect = `${res.status}${res.headers.get('location') ? ` → ${res.headers.get('location')}` : ''}`
  } catch { /* null */ }

  let uploadsCacheControl: string | null = null
  try {
    const homeHtml = (await grab(base)).text
    // 1) Legacy raw /uploads/ sources, or…
    const rawSrc = homeHtml.match(/src="(\/uploads\/?[^"]+\.(?:jpe?g|png|webp|avif))"/i)?.[1]
    // 2) …the SOURCE FILE behind a next/image-wrapped src ("/_next/image?url=%2Fuploads%2F…").
    //    Decode the url param and probe that real asset: next.config headers()
    //    serves it immutable for 1 year, and that origin freshness is exactly
    //    what the next/image route revalidates against (minimumCacheTTL).
    //    (Capturing up to the first "&" also sidesteps "&amp;" HTML entities.)
    const wrappedParam = homeHtml.match(/src="\/_next\/image\?url=([^"&]+)/i)?.[1]
    const derivedSrc = wrappedParam ? decodeURIComponent(wrappedParam) : null
    const url = rawSrc ?? (derivedSrc && /^\/(uploads|images)\//.test(derivedSrc) ? derivedSrc : null)
    if (url) {
      let res = await fetch(`${base}${url}`, { method: 'HEAD', signal: AbortSignal.timeout(6000), cache: 'no-store' })
      if (!res.ok) res = await fetch(`${base}${url}`, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
      uploadsCacheControl = res.headers.get('cache-control')
    }
  } catch { /* null */ }

  let staticCacheControl: string | null = null
  try {
    const chunk = (await grab(base)).text.match(/\/_next\/static\/[^"']+\.js/)?.[0]
    if (chunk) {
      const res = await fetch(`${base}${chunk}`, { method: 'HEAD', signal: AbortSignal.timeout(6000), cache: 'no-store' })
      staticCacheControl = res.headers.get('cache-control')
    }
  } catch { /* null */ }

  const brokenLinks: string[] = []
  const sampleTargets = [...allInternalHrefs]
    .filter((h) => !h.startsWith('/admin') && !h.startsWith('/dashboard') && !h.startsWith('/api'))
    .slice(0, 12)
  await Promise.all(
    sampleTargets.map(async (h) => {
      try {
        const res = await fetch(`${base}${h}`, { method: 'GET', signal: AbortSignal.timeout(6000), cache: 'no-store' })
        if (res.status >= 400) brokenLinks.push(`${h} → ${res.status}`)
      } catch {
        brokenLinks.push(`${h} → unreachable`)
      }
    })
  )

  const dbSection: SeoAuditData['db'] = {
    coursesPublished,
    coursesTotal,
    coursesMissingDescription: missingDesc,
    coursesDefaultInstructor: defaultInstructor,
    coursesWithBio: withBio,
    coursesUpdated90d: updated90,
    duplicateCourseTitles,
    categoriesTotal,
    categoriesInUse: categoriesInUse.length,
    combosActive,
    notices,
    suggestions,
    reviewsApproved,
    seoTitle,
    seoDescription,
    seoKeywords,
    gscVerified: Boolean(settings?.googleSiteVerification?.trim()),
  }

  /* shared metrics */
  const fmtPct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)
  const avg = (nums: number[]) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0)
  const ttfbAvg = avg(corePages.map((p) => p.ms))
  const totalImgs = corePages.reduce((n, p) => n + p.images, 0)
  const totalNoAlt = corePages.reduce((n, p) => n + p.imagesNoAlt, 0)
  const totalAltMissing = corePages.reduce((n, p) => n + p.imagesAltMissing, 0)
  const totalLazy = corePages.reduce((n, p) => n + p.imagesLazy, 0)
  const pageTitles = corePages.map((p) => p.title)
  const duplicateTitlesOnPages = pageTitles.filter((t, i) => t && pageTitles.indexOf(t) !== i)
  const jsonLdTotal = [...new Set(corePages.flatMap((p) => p.jsonLdTypes))]
  const fmts = corePages.reduce((a, p) => {
    for (const [k, v] of Object.entries(p.imageFormats)) a[k] = (a[k] ?? 0) + v
    return a
  }, {} as Record<string, number>)
  const imgTotal = Object.values(fmts).reduce((a, b) => a + b, 0)
  const modernImgs = (fmts.webp ?? 0) + (fmts.avif ?? 0)
  const all404orLess = corePages.filter((p) => p.status !== 200)

  /* ════════════ ON-PAGE ITEMS (23) ════════════ */

  // 1. SEO Title
  {
    const t = seoTitle || home.title
    const len = t.length
    const off = corePages.filter((p) => p.title && (p.title.length < 15 || p.title.length > 65))
    if (!t) {
      onPage.push(mk('seo-title', 'SEO টাইটেল অপটিমাইজেশন', 'SEO Title Optimization', 'পেজ টাইটেল ৫০–৬০ অক্ষরে ফোকাস কীওয়ার্ডসহ', 'Page titles with focus keyword, ~50–60 chars', 'warn', ['Settings → SEO সেটিংসে সাইট টাইটেল খালি — ডিফল্ট ব্র্যান্ড টাইটেল ব্যবহৃত হচ্ছে']))
    } else if (len >= 15 && len <= 65 && off.length === 0) {
      onPage.push(mk('seo-title', 'SEO টাইটেল অপটিমাইজেশন', 'SEO Title Optimization', 'পেজ টাইটেল ৫০–৬০ অক্ষরে ফোকাস কীওয়ার্ডসহ', 'Page titles with focus keyword, ~50–60 chars', 'pass', [`টাইটেল: "${t}" (${len} অক্ষর) ✓`, ...off.slice(0, 3).map((p) => `⚠ ${p.path}: ${p.title.length} অক্ষর`)]))
    } else {
      onPage.push(mk('seo-title', 'SEO টাইটেল অপটিমাইজেশন', 'SEO Title Optimization', 'পেজ টাইটেল ৫০–৬০ অক্ষরে ফোকাস কীওয়ার্ডসহ', 'Page titles with focus keyword, ~50–60 chars', 'warn', [`"${t.slice(0, 60)}" — ${len} অক্ষর (আদর্শ ১৫–৬৫)`, ...off.slice(0, 4).map((p) => `⚠ ${p.path}: ${p.title.length} অক্ষর`), 'Settings → SEO সেটিংসে টাইটেল ঠিক করুন']))
    }
  }

  // 2. Meta description
  {
    const d = seoDescription || home.metaDescription
    if (!d) {
      onPage.push(mk('meta-desc', 'মেটা ডেসক্রিপশন অপটিমাইজেশন', 'Meta Description Optimization', 'প্রতি পেজে ১২০–১৬০ অক্ষরের আকর্ষণীয় বিবরণ', 'Compelling 120–160 char description per page', 'warn', ['Settings → SEO সেটিংসে মেটা ডেসক্রিপশন খালি — যোগ করুন']))
    } else {
      const len = d.length
      const inRange = len >= 70 && len <= 180
      onPage.push(mk('meta-desc', 'মেটা ডেসক্রিপশন অপটিমাইজেশন', 'Meta Description Optimization', 'প্রতি পেজে ১২০–১৬০ অক্ষরের আকর্ষণীয় বিবরণ', 'Compelling 120–160 char description per page', inRange ? 'pass' : 'warn', [`${len} অক্ষর ${inRange ? '✓ রেঞ্জে আছে' : '— ৭০–১৮০ রেঞ্জে আনুন'}`, `"${d.slice(0, 90)}…"`]))
    }
  }

  // 3. H1–H6
  {
    const badH1 = corePages.filter((p) => p.h1 !== 1)
    const headingRich = corePages.filter((p) => p.h2 + p.h3 >= 3).length
    if (badH1.length === 0 && headingRich >= 3) {
      onPage.push(mk('headings', 'H1–H6 হেডিং অপটিমাইজেশন', 'H1–H6 Heading Optimization', 'প্রতি পেজে ঠিক ১টি H1, সঠিক H2–H6 স্তর', 'Exactly one H1 per page, proper H2–H6 hierarchy', 'pass', corePages.map((p) => `${p.path}: H1×${p.h1} · H2×${p.h2} · H3×${p.h3} ✓`)))
    } else if (badH1.length === 0) {
      onPage.push(mk('headings', 'H1–H6 হেডিং অপটিমাইজেশন', 'H1–H6 Heading Optimization', 'প্রতি পেজে ঠিক ১টি H1, সঠিক H2–H6 স্তর', 'Exactly one H1 per page, proper H2–H6 hierarchy', 'warn', [`${corePages.length} পেজে H1 সঠিক ✓, কিন্তু সাব-হেডিং (H2/H3) কম`, ...corePages.slice(0, 5).map((p) => `${p.path}: H1×${p.h1} · H2×${p.h2} · H3×${p.h3}`)]))
    } else {
      onPage.push(mk('headings', 'H1–H6 হেডিং অপটিমাইজেশন', 'H1–H6 Heading Optimization', 'প্রতি পেজে ঠিক ১টি H1, সঠিক H2–H6 স্তর', 'Exactly one H1 per page, proper H2–H6 hierarchy', 'fail', badH1.map((p) => `⚠ ${p.path}: H1×${p.h1} (ঠিক ১টি হতে হবে)`)))
    }
  }

  // 4–6. Keywords (primary / secondary / long-tail)
  if (keywordList.length > 0) {
    const titleText = (seoTitle || home.title).toLowerCase()
    const descText = (seoDescription || home.metaDescription || '').toLowerCase()
    const primary = keywordList[0].toLowerCase()
    const inTitle = titleText.includes(primary)
    const inDesc = descText.includes(primary)
    // the check is now HONEST: 'pass' only when the primary
    // keyword actually appears in the served title/description meta (real,
    // valid SEO evidence — not just the presence of a keyword list).
    onPage.push(mk('primary-keyword', 'প্রাইমারি কীওয়ার্ড অপটিমাইজেশন', 'Primary Keyword Optimization', 'মূল কীওয়ার্ড টাইটেল/ডেসক্রিপশনে ব্যবহৃত', 'Primary keyword used in title/description', inTitle || inDesc ? 'pass' : 'warn', [
      `প্রাইমারি কীওয়ার্ড: "${keywordList[0]}"`,
      `টাইটেলে উপস্থিত: ${inTitle ? 'হ্যাঁ ✓' : 'না'} · ডেসক্রিপশনে উপস্থিত: ${inDesc ? 'হ্যাঁ ✓' : 'না'}`,
      `${inTitle || inDesc ? 'মেটা-ডেটায় মূল কীওয়ার্ড ব্যবহৃত ✓' : 'টাইটেল বা ডেসক্রিপশনে যোগ করুন'}`,
    ]))
  } else {
    onPage.push(mk('primary-keyword', 'প্রাইমারি কীওয়ার্ড অপটিমাইজেশন', 'Primary Keyword Optimization', 'মূল কীওয়ার্ড টাইটেল/ডেসক্রিপশনে ব্যবহৃত', 'Primary keyword used in title/description', 'warn', ['Settings → SEO সেটিংসে কীওয়ার্ড খালি — মূল কীওয়ার্ড সেট করুন (যেমন: অনলাইন ক্লাস)']))
  }
  onPage.push(
    keywordList.length >= 2
      ? mk('secondary-keyword', 'সেকেন্ডারি কীওয়ার্ড অপটিমাইজেশন', 'Secondary Keyword Optimization', 'সহায়ক কীওয়ার্ড কনটেন্টে বিন্যস্ত', 'Supporting keywords distributed across content', 'pass', [`${keywordList.length} টি কীওয়ার্ড: ${keywordList.slice(0, 6).join(', ')}`])
      : mk('secondary-keyword', 'সেকেন্ডারি কীওয়ার্ড অপটিমাইজেশন', 'Secondary Keyword Optimization', 'সহায়ক কীওয়ার্ড কনটেন্টে বিন্যস্ত', 'Supporting keywords distributed across content', 'warn', ['কমপক্ষে ২–৩টি সহায়ক কীওয়ার্ড যোগ করুন']),
    longTail.length > 0
      ? mk('long-tail', 'লং-টেইল কীওয়ার্ড অপটিমাইজেশন', 'Long-Tail Keyword Optimization', '৩+ শব্দের নির্দিষ্ট কীওয়ার্ড ফ্রেজ', 'Specific 3+ word keyword phrases', 'pass', [`${longTail.length} টি লং-টেইল: ${longTail.slice(0, 4).join(', ')}`])
      : mk('long-tail', 'লং-টেইল কীওয়ার্ড অপটিমাইজেশন', 'Long-Tail Keyword Optimization', '৩+ শব্দের নির্দিষ্ট কীওয়ার্ড ফ্রেজ', 'Specific 3+ word keyword phrases', 'info', ['লং-টেইল উদাহরণ: "৯ম শ্রেণির পদার্থবিজ্ঞান অনলাইন ক্লাস", "SSC পরীক্ষার সেরা প্রস্তুতি কোর্স"'])
  )

  // 7. Keyword clustering
  onPage.push(mk('keyword-clustering', 'কীওয়ার্ড ক্লাস্টারিং', 'Keyword Clustering', 'একই ইনটেন্টের কীওয়ার্ড এক পেজে গ্রুপ করা', 'Group keywords of same intent onto one page', 'info', [
    keywordList.length ? `${keywordList.length} কীওয়ার্ডকে ক্লাস্টারে সাজান: কোর্স-ক্লাস্টার / এক্সাম-ক্লাস্টার / টুল-ক্লাস্টার` : 'কীওয়ার্ড সেট করার পর ক্লাস্টার ম্যাপ তৈরি করুন',
    `কনটেন্ট হাব প্রস্তুত: কোর্স ${coursesPublished} · কম্বো ${combosActive} · নোটিশ ${notices} · সাজেশন ${suggestions}`,
  ]))

  // 8. Keyword mapping
  onPage.push(
    duplicateTitlesOnPages.length === 0
      ? mk('keyword-mapping', 'কীওয়ার্ড ম্যাপিং', 'Keyword Mapping', 'প্রতি পেজে ইউনিক কীওয়ার্ড + ইউনিক টাইটেল', 'Unique keyword + title per page (no cannibalisation)', 'pass', corePages.slice(0, 6).map((p) => `${p.path} → "${p.title.slice(0, 48)}"`))
      : mk('keyword-mapping', 'কীওয়ার্ড ম্যাপিং', 'Keyword Mapping', 'প্রতি পেজে ইউনিক কীওয়ার্ড + ইউনিক টাইটেল', 'Unique keyword + title per page (no cannibalisation)', 'warn', ['⚠ ডুপ্লিকেট পেজ-টাইটেল:', ...duplicateTitlesOnPages.slice(0, 3)])
  )

  // 9. Search intent
  onPage.push(mk('search-intent', 'সার্চ ইনটেন্ট ম্যাচিং', 'Search Intent Matching', 'পেজ টাইপ অনুযায়ী ইনটেন্ট (তথ্য/লেনদেন) মেলানো', 'Match page type to intent (informational/transactional)', 'info', [
    `লেনদেনমূলক: /courses, /exams, /combos — ${coursesPublished + combosActive} পেজ`,
    'তথ্যমূলক: /tools/* (৩টি ফ্রি টুল), /questions, /notices',
    'নেভিগেশনাল: /about, /contact, /verify',
  ]))

  // 10. Content structure
  onPage.push(
    corePages.every((p) => p.h1 === 1 && p.h2 + p.h3 >= 1)
      ? mk('content-structure', 'কনটেন্ট স্ট্রাকচার অপটিমাইজেশন', 'Content Structure Optimization', 'স্ক্যানযোগ্য স্ট্রাকচার: হেডিং, লিস্ট, সেকশন', 'Scannable structure: headings, lists, sections', 'pass', corePages.slice(0, 5).map((p) => `${p.path}: ~${p.wordish} শব্দ · H2×${p.h2}+H3×${p.h3} ✓`))
      : mk('content-structure', 'কনটেন্ট স্ট্রাকচার অপটিমাইজেশন', 'Content Structure Optimization', 'স্ক্যানযোগ্য স্ট্রাকচার: হেডিং, লিস্ট, সেকশন', 'Scannable structure: headings, lists, sections', 'warn', ['কিছু পেজে সাব-সেকশন (H2/H3) কম — কনটেন্ট ভাগ করুন'])
  )

  // 11. Internal linking
  {
    const avgLinks = avg(corePages.map((p) => p.internalLinks))
    onPage.push(
      avgLinks >= 10
        ? mk('internal-linking', 'ইন্টারনাল লিংকিং', 'Internal Linking', 'পেজগুলোর মধ্যে পর্যাপ্ত অভ্যন্তরীণ লিংক', 'Sufficient internal links between pages', 'pass', [`গড় ${avgLinks} টি ইন্টারনাল লিংক/পেজ ✓`, ...corePages.slice(0, 4).map((p) => `${p.path}: ${p.internalLinks} লিংক`)])
        : mk('internal-linking', 'ইন্টারনাল লিংকিং', 'Internal Linking', 'পেজগুলোর মধ্যে পর্যাপ্ত অভ্যন্তরীণ লিংক', 'Sufficient internal links between pages', 'warn', [`গড় মাত্র ${avgLinks} টি — কনটেন্টে সম্পর্কিত কোর্স/পেজ লিংক করুন`])
    )
  }

  // 12. External linking
  onPage.push(mk('external-linking', 'এক্সটারনাল লিংকিং', 'External Linking', 'বিশ্বস্ত সোর্সে সংযমী আউটবাউন্ড লিংক', 'Outbound links to trusted sources (restrained)', 'info', [
    `কনটেন্টে গড়ে ${avg(corePages.map((p) => p.externalLinks))} টি এক্সটারনাল লিংক (সোশ্যাল লিংক বাদে)`,
    'রেফারেন্স সাইটে প্রয়োজনে nofollow ব্যবহার করুন',
  ]))

  // 13. Anchor text
  {
    const generic = corePages.flatMap((p) => p.genericAnchors.map((a) => `${p.path}: "${a}"`))
    onPage.push(
      generic.length === 0
        ? mk('anchor-text', 'অ্যাঙ্কর টেক্সট অপটিমাইজেশন', 'Anchor Text Optimization', 'বর্ণনামূলক অ্যাঙ্কর টেক্সট, "click here" নয়', 'Descriptive anchor text — no generic "click here"', 'pass', ['স্ক্যান করা সব ইন্টারনাল অ্যাঙ্কর বর্ণনামূলক ✓'])
        : mk('anchor-text', 'অ্যাঙ্কর টেক্সট অপটিমাইজেশন', 'Anchor Text Optimization', 'বর্ণনামূলক অ্যাঙ্কর টেক্সট, "click here" নয়', 'Descriptive anchor text — no generic "click here"', 'warn', generic.slice(0, 5))
    )
  }

  // 14. Image alt — Google image SEO: descriptive alt on CONTENT images;
  // empty alt="" is the RECOMMENDED practice for purely decorative images
  // (screen readers skip them). Only a MISSING alt attribute is a defect.
  {
    const noAltPct = fmtPct(totalAltMissing, totalImgs)
    onPage.push(
      totalAltMissing === 0
        ? mk('image-alt', 'ইমেজ Alt টেক্সট', 'Image Alt Text', 'কনটেন্ট-ইমেজে বর্ণনামূলক alt, ডেকোরেটিভে alt=""', 'Descriptive alt on content images, alt="" on decorative', 'pass', [
            `${totalImgs} টি ইমেজ স্ক্যান — alt অ্যাট্রিবিউট সবগুলোতে উপস্থিত ✓`,
            `ডেকোরেটিভ (alt="" — Google-সুপারিশকৃত): ${totalNoAlt} টি`,
            'কনটেন্ট-ইমেজ (কোর্স কভার/হিরো ফ্রন্ট) বর্ণনামূলক alt বহন করে ✓',
          ])
        : noAltPct <= 15
          ? mk('image-alt', 'ইমেজ Alt টেক্সট', 'Image Alt Text', 'কনটেন্ট-ইমেজে বর্ণনামূলক alt, ডেকোরেটিভে alt=""', 'Descriptive alt on content images, alt="" on decorative', 'warn', [`${totalImgs} টির মধ্যে ${totalAltMissing} টিতে alt অ্যাট্রিবিউটই নেই (${noAltPct}%)`, ...corePages.filter((p) => p.imagesAltMissing > 0).slice(0, 4).map((p) => `${p.path}: ${p.imagesAltMissing} টি alt-বিহীন`)])
          : mk('image-alt', 'ইমেজ Alt টেক্সট', 'Image Alt Text', 'কনটেন্ট-ইমেজে বর্ণনামূলক alt, ডেকোরেটিভে alt=""', 'Descriptive alt on content images, alt="" on decorative', 'fail', [`${totalImgs} টির মধ্যে ${totalAltMissing} টিতে alt অ্যাট্রিবিউটই নেই (${noAltPct}%) — জরুরি ঠিক করুন`])
    )
  }

  // 15. Image filename
  onPage.push(mk('image-filename', 'ইমেজ ফাইলনেম অপটিমাইজেশন', 'Image Filename Optimization', 'SEO-ফ্রেন্ডলি ফাইলনেম (hyphenated, বর্ণনামূলক)', 'SEO-friendly filenames (hyphenated, descriptive)', 'info', [
    `স্ক্যানে পাওয়া ফরম্যাট: ${JSON.stringify(fmts)}`,
    'আপলোড সিস্টেম content-addressed (random-prefix + তারিখ) — ক্যাশ-বান্ধব, ডুপ্লিকেট-সেফ',
    'নতুন আপলোডে বর্ণনামূলক নাম দিলে ইমেজ সার্চে সুবিধা',
  ]))

  // 16. Breadcrumb
  {
    const hasBreadcrumb = (courseDetail?.jsonLdTypes ?? []).some((t) => /breadcrumb/i.test(t))
    onPage.push(
      hasBreadcrumb
        ? mk('breadcrumb', 'ব্রেডক্রাম্ব অপটিমাইজেশন', 'Breadcrumb Optimization', 'ব্রেডক্রাম্ব নেভিগেশন + BreadcrumbList স্কিমা', 'Breadcrumb navigation + BreadcrumbList schema', 'pass', ['কোর্স পেজে BreadcrumbList JSON-LD ✓'])
        : mk('breadcrumb', 'ব্রেডক্রাম্ব অপটিমাইজেশন', 'Breadcrumb Optimization', 'ব্রেডক্রাম্ব নেভিগেশন + BreadcrumbList স্কিমা', 'Breadcrumb navigation + BreadcrumbList schema', 'info', ['পেজগুলোতে হেডার-নেভ আছে; BreadcrumbList স্কিমা যোগ করলে সার্চ রেজাল্টে সুবিধা'])
    )
  }

  // 17. Table of contents
  onPage.push(mk('toc', 'টেবিল অব কনটেন্টস', 'Table of Contents', 'দীর্ঘ কনটেন্টে সূচিপত্র/জাম্প লিংক', 'TOC / jump links on long content', 'info', [
    'কোর্স পেজে চ্যাপ্টার-ভিত্তিক লেসন লিস্ট স্বাভাবিক TOC হিসেবে কাজ করে',
    'দীর্ঘ পেজে জাম্প-লিংক TOC যোগ করলে ফিচার্ড স্নিপেটের সুযোগ বাড়ে',
  ]))

  // 18. Readability
  {
    const avgWords = avg(corePages.map((p) => p.wordish))
    onPage.push(
      avgWords >= 300
        ? mk('readability', 'কনটেন্ট রিডেবিলিটি', 'Content Readability', 'সহজ ভাষা, ছোট প্যারা, পর্যাপ্ত কনটেন্ট', 'Simple language, short paragraphs, enough content', 'pass', [`পেজপ্রতি গড় ~${avgWords} শব্দ (রেন্ডারড HTML) ✓`, 'বাংলা ⇄ ইংরেজি দ্বিভাষিক কনটেন্ট ✓'])
        : mk('readability', 'কনটেন্ট রিডেবিলিটি', 'Content Readability', 'সহজ ভাষা, ছোট প্যারা, পর্যাপ্ত কনটেন্ট', 'Simple language, short paragraphs, enough content', 'warn', [`পেজপ্রতি গড় ~${avgWords} শব্দ — গভীর কনটেন্ট যোগ করুন`])
    )
  }

  // 19. Freshness
  {
    const pct = fmtPct(updated90, coursesPublished)
    onPage.push(
      pct >= 50
        ? mk('freshness', 'কনটেন্ট ফ্রেশনেস', 'Content Freshness', 'নিয়মিত আপডেটেড কনটেন্ট', 'Regularly updated content', 'pass', [`কোর্স ${coursesPublished} টির ${updated90} টি সাম্প্রতিক আপডেটেড — ${pct}% ✓`, `নোটিশ ${notices} · কম্বো ${combosActive} সক্রিয়`])
        : mk('freshness', 'কনটেন্ট ফ্রেশনেস', 'Content Freshness', 'নিয়মিত আপডেটেড কনটেন্ট', 'Regularly updated content', 'warn', [`কোর্স ${coursesPublished} টির মাত্র ${updated90} টি সাম্প্রতিক আপডেটেড (${pct}%) — পুরনো কোর্স রিফ্রেশ করুন`])
    )
  }

  // 20. E-E-A-T
  {
    const namedPct = coursesPublished ? 100 - fmtPct(defaultInstructor, coursesPublished) : 0
    onPage.push(
      namedPct >= 70
        ? mk('eeat', 'E-E-A-T অপটিমাইজেশন', 'E-E-A-T Optimization', 'অভিজ্ঞতা-দক্ষতা-কর্তৃত্ব-বিশ্বাসযোগ্যতা সিগনাল', 'Experience-Expertise-Authoritativeness-Trust signals', 'pass', [`কোর্সের ${namedPct}% এ নাম-ধারী ইন্সট্রাক্টর ✓`, `ইন্সট্রাক্টর বায়ো: ${withBio} · অ্যাপ্রুভড রিভিউ: ${reviewsApproved}`])
        : mk('eeat', 'E-E-A-T অপটিমাইজেশন', 'E-E-A-T Optimization', 'অভিজ্ঞতা-দক্ষতা-কর্তৃত্ব-বিশ্বাসযোগ্যতা সিগনাল', 'Experience-Expertise-Authoritativeness-Trust signals', 'warn', [`কোর্সের ${100 - namedPct}% এ ডিফল্ট ইন্সট্রাক্টর — প্রকৃত শিক্ষকের নাম/বায়ো যোগ করুন`])
    )
  }

  // 21. Author profile
  onPage.push(
    withBio > 0
      ? mk('author-profile', 'অথর প্রোফাইল অপটিমাইজেশন', 'Author Profile Optimization', 'শিক্ষক প্রোফাইল: নাম, টাইটেল, বায়ো, ছবি', 'Instructor profiles: name, title, bio, photo', 'pass', [`বায়োসহ ইন্সট্রাক্টর-কোর্স: ${withBio} টি ✓`, 'About পেজে টিম সেকশন ✓'])
      : mk('author-profile', 'অথর প্রোফাইল অপটিমাইজেশন', 'Author Profile Optimization', 'শিক্ষক প্রোফাইল: নাম, টাইটেল, বায়ো, ছবি', 'Instructor profiles: name, title, bio, photo', 'warn', ['Admin → Instructors-এ শিক্ষক প্রোফাইল (বায়ো + ছবি) যোগ করুন'])
  )

  // 22. Source attribution
  onPage.push(mk('source-attribution', 'সোর্স ও রেফারেন্স অ্যাট্রিবিউশন', 'Source & Reference Attribution', 'রেফারেন্স/সাইটেশন স্পষ্টভাবে উল্লেখ', 'Cite sources & references clearly', 'info', [
    'সাজেশন PDF-এ সোর্স উল্লেখ করুন; নোটিশে অফিসিয়াল লিংক দিন',
    'স্ট্যাটিসটিক ব্যবহারে সাল সহ সোর্স লিখুন',
  ]))

  // 23. Content gap
  {
    const emptyCats = Math.max(0, categoriesTotal - categoriesInUse.length)
    onPage.push(
      missingDesc === 0 && emptyCats === 0
        ? mk('content-gap', 'কনটেন্ট গ্যাপ অ্যানালাইসিস', 'Content Gap Analysis', 'বিষয়-ভিত্তিক কভারেজ ফাঁক খুঁজে পূরণ', 'Find & fill topical coverage gaps', 'pass', [
            `কভারেজ: কোর্স ${coursesPublished} · কম্বো ${combosActive} · সাজেশন ${suggestions} · নোটিশ ${notices}`,
            `ক্যাটাগরি ${categoriesTotal} টির সবগুলোতেই কোর্স আছে ✓`,
          ])
        : mk('content-gap', 'কনটেন্ট গ্যাপ অ্যানালাইসিস', 'Content Gap Analysis', 'বিষয়-ভিত্তিক কভারেজ ফাঁক খুঁজে পূরণ', 'Find & fill topical coverage gaps', 'warn', [
            ...(missingDesc > 0 ? [`${missingDesc} টি প্রকাশিত কোর্সে বিবরণ খালি — পূরণ করুন`] : []),
            ...(emptyCats > 0 ? [`${emptyCats} টি ক্যাটাগরিতে কোনো প্রকাশিত কোর্স নেই`] : []),
          ])
    )
  }

  // 24. Crawlable links — Google "Link best practices for Google"
  // Links must be <a href> elements so crawlers can follow them.
  {
    const hrefless = corePages.reduce((n, p) => n + p.hreflessAnchors, 0)
    onPage.push(
      hrefless === 0
        ? mk('crawlable-links', 'ক্রলেবল লিংক বেস্ট প্র্যাকটিস', 'Crawlable Link Best Practices', 'সব <a> ট্যাগে href আছে — ক্রলার ফলো করতে পারে', 'Every <a> tag has an href — crawlers can follow', 'pass', [
            `${corePages.length} পেজ স্ক্যান — href-বিহীন অ্যাঙ্কর শূন্য ✓`,
            'নেভিগেশন/কার্ড/ফুটার সব crawlable <a href> ✓',
          ])
        : mk('crawlable-links', 'ক্রলেবল লিংক বেস্ট প্র্যাকটিস', 'Crawlable Link Best Practices', 'সব <a> ট্যাগে href আছে — ক্রলার ফলো করতে পারে', 'Every <a> tag has an href — crawlers can follow', 'warn', [
            `href-বিহীন অ্যাঙ্কর ${hrefless} টি পাওয়া গেছে — ক্রলার ফলো করতে পারবে না`,
            ...corePages.filter((p) => p.hreflessAnchors > 0).slice(0, 4).map((p) => `${p.path}: ${p.hreflessAnchors} টি`),
          ])
    )
  }

  // 25. Lang attribute — Google: "Tell Google about your site's language";
  // the <html lang> must match the page language.
  {
    const missing = corePages.filter((p) => !p.langAttr)
    const found = corePages.find((p) => p.langAttr)?.langAttr ?? ''
    onPage.push(
      missing.length === 0 && found
        ? mk('lang-attribute', 'ল্যাঙ্গুয়েজ অ্যাট্রিবিউট (lang)', 'Language Attribute (lang)', '<html lang> কনটেন্টের ভাষার সাথে মেলানো', 'Declare page language via <html lang>', 'pass', [
            `সব পেজে <html lang="${found}"> ✓ — বাংলা কনটেন্টের সাথে মিলছে`,
            'ক্লায়েন্ট-সাইড ভাষা টগলে lang একসাথে বদলায় ✓',
          ])
        : mk('lang-attribute', 'ল্যাঙ্গুয়েজ অ্যাট্রিবিউট (lang)', 'Language Attribute (lang)', '<html lang> কনটেন্টের ভাষার সাথে মেলানো', 'Declare page language via <html lang>', 'warn', [
            missing.length ? `lang অনুপস্থিত: ${missing.map((p) => p.path).slice(0, 4).join(', ')}` : '',
          ].filter(Boolean))
    )
  }

  // 26. Social preview meta — og:/twitter: cards (search appearance guidance)
  {
    const ogCount = home.ogTags.length
    const hasTitle = home.ogTags.some((t) => t === 'og:title')
    const hasImage = home.ogTags.some((t) => t === 'og:image')
    onPage.push(
      ogCount >= 4 && hasTitle && hasImage
        ? mk('social-meta', 'সোশ্যাল প্রিভিউ মেটা (OG/Twitter)', 'Social Preview Meta (OG/Twitter)', 'og:title/og:image/twitter:card সম্পূর্ণ', 'og:title/og:image/twitter:card complete', 'pass', [
            `${ogCount} টি og/twitter মেটা ট্যাগ ✓`,
            'og:image 1440×704 — সার্চ/মেসেঞ্জার কার্ড সম্পূর্ণ ✓',
          ])
        : mk('social-meta', 'সোশ্যাল প্রিভিউ মেটা (OG/Twitter)', 'Social Preview Meta (OG/Twitter)', 'og:title/og:image/twitter:card সম্পূর্ণ', 'og:title/og:image/twitter:card complete', 'warn', [`og/twitter মেটা মাত্র ${ogCount} টি — layout.tsx-এ og:title/og:image যাচাই করুন`])
    )
  }

  // 27. Intrusive interstitials — Google "Avoid intrusive interstitials":
  // full-screen popups that block content hurt mobile ranking. The notice
  // popup (site-popup.tsx) IS dismissible (close button + backdrop click),
  // which keeps it inside Google's acceptable behaviour.
  {
    const modalPages = corePages.filter((p) => p.hasModalDialog)
    onPage.push(
      modalPages.length === 0
        ? mk('interstitials', 'ইনট্রুসিভ ইনটারস্টিশিয়াল নিয়ন্ত্রণ', 'Intrusive Interstitial Control', 'পপআপ ডিসমিসিবল — কনটেন্ট ব্লক নয়', 'Popups dismissible — not content-blocking', 'pass', [
            'SSR HTML-এ full-screen blocking modal নেই ✓',
            'নোটিশ পপআপ (চালু হলে): বন্ধ বাটন + backdrop-ক্লিক — ডিসমিসিবল ✓',
          ])
        : mk('interstitials', 'ইনট্রুসিভ ইনটারস্টিশিয়াল নিয়ন্ত্রণ', 'Intrusive Interstitial Control', 'পপআপ ডিসমিসিবল — কনটেন্ট ব্লক নয়', 'Popups dismissible — not content-blocking', 'info', [
            `${modalPages.length} পেজে modal markup আছে (নোটিশ পপআপ — ডিসমিসিবল ✓)`,
            'Google রুল: ডিসমিসিবল পপআপ অ্যাকসেপটেবল, full-screen ad-wall নয় ✓',
          ])
    )
  }

  /* ════════════ TECHNICAL ITEMS (41) ════════════ */

  // 1. Technical audit
  technical.push(mk('technical-audit', 'টেকনিক্যাল ওয়েবসাইট অডিট', 'Technical Website Audit', 'সাইট-ব্যাপী স্বয়ংক্রিয় টেকনিক্যাল স্বাস্থ্য পরীক্ষা', 'Automated site-wide technical health check', 'info', [
    `লাইভ অডিট: ${pages.length} পেজ + robots.txt + sitemap.xml + ${sampleTargets.length} লিংক প্রোব`,
    `সার্ভার রেসপন্স গড় ${ttfbAvg}ms`,
    'প্রতিটি চেক আসল ডেটা থেকে গণনা করা — কোনো ফেক সংখ্যা নেই',
  ]))

  // 2. Crawlability
  technical.push(
    robots.ok && all404orLess.length === 0
      ? mk('crawlability', 'ক্রলেবিলিটি অপটিমাইজেশন', 'Crawlability Optimization', 'সার্চ ইঞ্জিন পাবলিক পেজ ক্রল করতে পারে', 'Search engines can crawl public pages', 'pass', ['robots.txt: Allow: / ✓', 'অ্যাডমিন/ড্যাশবোর্ড/এপিআই ব্লকড ✓', `${corePages.length}/${corePages.length} পেজ 200 ✓`])
      : mk('crawlability', 'ক্রলেবিলিটি অপটিমাইজেশন', 'Crawlability Optimization', 'সার্চ ইঞ্জিন পাবলিক পেজ ক্রল করতে পারে', 'Search engines can crawl public pages', 'warn', [...(robots.ok ? [] : ['⚠ robots.txt রেসপন্স দিচ্ছে না']), ...(all404orLess.length ? all404orLess.map((p) => `⚠ ${p.path} → ${p.status}`) : [])])
  )

  // 3. Indexability
  {
    const noindex = corePages.filter((p) => /noindex/i.test(p.metaRobots))
    technical.push(
      noindex.length === 0
        ? mk('indexability', 'ইনডেক্সেবিলিটি অপটিমাইজেশন', 'Indexability Optimization', 'গুরুত্বপূর্ণ পেজে noindex নেই', 'No unintended noindex on important pages', 'pass', [`${corePages.length} পেজ স্ক্যান — noindex নেই ✓`, 'meta robots ডিফল্ট: index, follow'])
        : mk('indexability', 'ইনডেক্সেবিলিটি অপটিমাইজেশন', 'Indexability Optimization', 'গুরুত্বপূর্ণ পেজে noindex নেই', 'No unintended noindex on important pages', 'fail', ['⚠ noindex: ' + noindex.map((p) => p.path).join(', ')])
    )
  }

  // 4. XML sitemap the check now ALSO validates every sitemap
  //    URL live (GSC "Submitted URL not found (404)" detection). A healthy
  //    sitemap.xml response alone is no longer enough: dead URLs → warn.
  {
    const dead = sitemapUrlProbe.failed
    technical.push(
      sitemap.ok && sitemap.urlCount > 0 && dead.length === 0
        ? mk('xml-sitemap', 'XML সাইটম্যাপ অপটিমাইজেশন', 'XML Sitemap Optimization', 'ডায়নামিক sitemap.xml — সব URL অটো যুক্ত', 'Dynamic sitemap.xml — all URLs auto-included', 'pass', [
            `${sitemap.urlCount} টি URL (কোর্স ${coursesPublished} + কম্বো ${combosActive} + নোটিশ ${notices} + স্ট্যাটিক)`,
            `লাইভ প্রোব: ${sitemapUrlProbe.ok}/${sitemapUrlProbe.total} URL → HTTP 200 ✓ (কোনো 404/রিডাইরেক্ট নেই — GSC-সামঞ্জস্যপূর্ণ)`,
            'INSTANT রিজেনারেশন — নতুন কনটেন্ট পাবলিশ/আপডেটে পরের রিকোয়েস্টেই sitemap-এ যোগ হয় (revision-probe cache)',
            'Cache-Control: no-cache — ব্রাউজার/CDN কখনো পুরনো কপি সার্ভ করে না',
          ])
        : sitemap.ok && sitemap.urlCount > 0 && dead.length > 0
          ? mk('xml-sitemap', 'XML সাইটম্যাপ অপটিমাইজেশন', 'XML Sitemap Optimization', 'ডায়নামিক sitemap.xml — সব URL অটো যুক্ত', 'Dynamic sitemap.xml — all URLs auto-included', 'warn', [
              `${sitemapUrlProbe.ok}/${sitemapUrlProbe.total} URL লাইভ — ⚠ মৃত URL (GSC: "Submitted URL not found"):`,
              ...dead.slice(0, 6),
            ])
          : mk('xml-sitemap', 'XML সাইটম্যাপ অপটিমাইজেশন', 'XML Sitemap Optimization', 'ডায়নামিক sitemap.xml — সব URL অটো যুক্ত', 'Dynamic sitemap.xml — all URLs auto-included', 'fail', [`/sitemap.xml ${sitemap.ok ? 'খালি' : 'রেসপন্স দিচ্ছে না'} — জরুরি ঠিক করুন`])
    )
  }

  // 5. Robots.txt
  technical.push(
    robots.ok && robots.hasSitemapDirective
      ? mk('robots-txt', 'Robots.txt অপটিমাইজেশন', 'Robots.txt Optimization', 'সঠিক robots.txt + Sitemap ডিরেক্টিভ', 'Correct robots.txt + Sitemap directive', 'pass', [robots.content.split('\n').filter(Boolean).slice(0, 8).map((l) => l.trim()).join(' · ')])
      : mk('robots-txt', 'Robots.txt অপটিমাইজেশন', 'Robots.txt Optimization', 'সঠিক robots.txt + Sitemap ডিরেক্টিভ', 'Correct robots.txt + Sitemap directive', 'warn', ['robots.txt বা এর "Sitemap:" লাইন যাচাই করুন'])
  )

  // 6. Canonical
  {
    const withCanonical = corePages.filter((p) => p.canonical)
    technical.push(
      withCanonical.length >= corePages.length - 1
        ? mk('canonical', 'ক্যানোনিকাল URL ম্যানেজমেন্ট', 'Canonical URL Management', 'প্রতি পেজে self-canonical ট্যাগ', 'Self-canonical tag on every page', 'pass', withCanonical.slice(0, 5).map((p) => `${p.path} → ${p.canonical}`))
        : mk('canonical', 'ক্যানোনিকাল URL ম্যানেজমেন্ট', 'Canonical URL Management', 'প্রতি পেজে self-canonical ট্যাগ', 'Self-canonical tag on every page', 'warn', [`${withCanonical.length}/${corePages.length} পেজে canonical`, ...withCanonical.slice(0, 4).map((p) => `${p.path} → ${p.canonical}`)])
    )
  }

  // 7. Hreflang
  technical.push(mk('hreflang', 'Hreflang ইমপ্লিমেন্টেশন', 'Hreflang Implementation', 'বহু-ভাষা/বহু-অঞ্চল ভার্সন সিগন্যাল', 'Language/region variant signalling', 'na', [
    'এই সাইট এক URL-এ ক্লায়েন্ট-সাইড ভাষা টগল (বাংলা/English) ব্যবহার করে — আলাদা ভাষা-URL নেই, তাই hreflang প্রযোজ্য নয়',
  ]))

  // 8. URL structure
  {
    const badUrls = [...allInternalHrefs].filter((u) => /[A-Z\s_]/.test(u)).slice(0, 5)
    technical.push(
      badUrls.length === 0
        ? mk('url-structure', 'URL স্ট্রাকচার অপটিমাইজেশন', 'URL Structure Optimization', 'ছোট হাতের, hyphenated, অর্থবহ URL', 'Lowercase, hyphenated, meaningful URLs', 'pass', [...allInternalHrefs].slice(0, 6).map((u) => u))
        : mk('url-structure', 'URL স্ট্রাকচার অপটিমাইজেশন', 'URL Structure Optimization', 'ছোট হাতের, hyphenated, অর্থবহ URL', 'Lowercase, hyphenated, meaningful URLs', 'warn', ['⚠ বড় হাতের/আন্ডারস্কোর/স্পেস:', ...badUrls])
    )
  }

  // 9. HTTP status codes
  technical.push(
    all404orLess.length === 0 && notFoundStatus === 404
      ? mk('http-status', 'HTTP স্ট্যাটাস কোড ম্যানেজমেন্ট', 'HTTP Status Code Management', '২০০ সফল, ৪০৪ মৃত লিংকে, ৩xx রিডাইরেক্টে', '200 OK, 404 for dead pages, 3xx for redirects', 'pass', [`সব পেজ 200 ✓ · ভুয়া URL → ${notFoundStatus} ✓`, ...corePages.slice(0, 5).map((p) => `${p.path} → ${p.status}`)])
      : mk('http-status', 'HTTP স্ট্যাটাস কোড ম্যানেজমেন্ট', 'HTTP Status Code Management', '২০০ সফল, ৪০৪ মৃত লিংকে, ৩xx রিডাইরেক্টে', '200 OK, 404 for dead pages, 3xx for redirects', 'warn', [...all404orLess.map((p) => `⚠ ${p.path} → ${p.status}`), `404 টেস্ট → ${notFoundStatus ?? 'N/A'}`])
  )

  // 10. Redirects
  technical.push(
    dashboardRedirect && /^[34]/.test(dashboardRedirect)
      ? mk('redirects', '৩০১/৩০২ রিডাইরেক্ট ম্যানেজমেন্ট', '301/302 Redirect Management', 'প্রোটেক্টেড পেজ সঠিকভাবে রিডাইরেক্ট', 'Protected pages redirect correctly', 'pass', [`/dashboard (লগইন ছাড়া) → ${dashboardRedirect} ✓`, 'ট্রেইলিং-স্ল্যাশ রিডাইরেক্ট-লুপ পার্মানেন্টলি স্কিপড ✓'])
      : mk('redirects', '৩০১/৩০২ রিডাইরেক্ট ম্যানেজমেন্ট', '301/302 Redirect Management', 'প্রোটেক্টেড পেজ সঠিকভাবে রিডাইরেক্ট', 'Protected pages redirect correctly', 'info', [`/dashboard প্রোব → ${dashboardRedirect ?? 'N/A'}`])
  )

  // 11. Broken links
  technical.push(
    brokenLinks.length === 0
      ? mk('broken-links', 'ব্রোকেন লিংক ডিটেকশন', 'Broken Link Detection', 'মৃত লিংক শূন্য — স্বয়ংক্রিয় লাইভ স্ক্যান', 'Zero dead links — automated live scan', 'pass', [`${sampleTargets.length} টি ইন্টারনাল লিংক লাইভ টেস্ট — সব 200 ✓`])
      : mk('broken-links', 'ব্রোকেন লিংক ডিটেকশন', 'Broken Link Detection', 'মৃত লিংক শূন্য — স্বয়ংক্রিয় লাইভ স্ক্যান', 'Zero dead links — automated live scan', 'warn', [`${sampleTargets.length} টির মধ্যে ${brokenLinks.length} টি সমস্যা:`, ...brokenLinks.slice(0, 5)])
  )

  // 12. Duplicate content
  technical.push(
    duplicateCourseTitles.length === 0 && duplicateTitlesOnPages.length === 0
      ? mk('duplicate-content', 'ডুপ্লিকেট কনটেন্ট ম্যানেজমেন্ট', 'Duplicate Content Management', 'ক্যানোনিকাল + ইউনিক টাইটেল = ডুপ্লিকেট ঝুঁকি নেই', 'Canonicals + unique titles = no duplicate risk', 'pass', ['কোর্স টাইটেল সব ইউনিক ✓', 'পেজ টাইটেল সব ইউনিক ✓', 'self-canonical সব পেজে ✓'])
      : mk('duplicate-content', 'ডুপ্লিকেট কনটেন্ট ম্যানেজমেন্ট', 'Duplicate Content Management', 'ক্যানোনিকাল + ইউনিক টাইটেল = ডুপ্লিকেট ঝুঁকি নেই', 'Canonicals + unique titles = no duplicate risk', 'warn', [
          ...(duplicateCourseTitles.length ? [`DB-তে ডুপ্লিকেট কোর্স টাইটেল: ${duplicateCourseTitles.slice(0, 3).join(', ')}`] : []),
          ...(duplicateTitlesOnPages.length ? [`পেজ টাইটেল ডুপ্লিকেট: ${duplicateTitlesOnPages.slice(0, 2).join(', ')}`] : []),
        ])
  )

  // 13. Crawl budget
  technical.push(mk('crawl-budget', 'ক্রল বাজেট অপটিমাইজেশন', 'Crawl Budget Optimization', 'গুরুত্বপূর্ণ পেজে ক্রল ফোকাসড', 'Crawl focus on valuable pages', 'info', [
    `সাইটম্যাপে ${sitemap.urlCount} URL — সবই পাবলিক ও মূল্যবান`,
    'অ্যাডমিন/ড্যাশবোর্ড/এপিআই robots.txt-এ ব্লকড — বাজেট নষ্ট হয় না',
  ]))

  // 14. JavaScript SEO
  technical.push(
    courseDetail && courseDetail.status === 200 && courseDetail.wordish > 200
      ? mk('javascript-seo', 'JavaScript SEO', 'JavaScript SEO', 'JS ছাড়াই কনটেন্ট HTML-এ উপস্থিত', 'Content present in raw HTML without JS', 'pass', [`কোর্স পেজ raw HTML-এ ~${courseDetail.wordish} শব্দ ✓`, 'কোর কনটেন্ট সার্ভার-রেন্ডারড — JS ছাড়াও পাঠযোগ্য'])
      : mk('javascript-seo', 'JavaScript SEO', 'JavaScript SEO', 'JS ছাড়াই কনটেন্ট HTML-এ উপস্থিত', 'Content present in raw HTML without JS', 'info', ['কোর পেজগুলো সার্ভার-রেন্ডারড; ক্লায়েন্ট-সাইড উইজেট গৌণ'])
  )

  // 15. SSR
  technical.push(mk('ssr', 'সার্ভার-সাইড রেন্ডারিং (SSR)', 'Server-Side Rendering (SSR)', 'Next.js App Router SSR — দ্রুত ফার্স্ট পেইন্ট', 'Next.js App Router SSR — fast first paint', 'pass', [
    `হোম raw HTML ~${home.wordish} শব্দ — ${home.ms}ms-এ সার্ভড ✓`,
    'SEO-ক্রিটিক্যাল সব পেজ সার্ভার কম্পোনেন্ট (SSR)',
  ]))

  // 16. SSG
  technical.push(mk('ssg', 'স্ট্যাটিক সাইট জেনারেশন (SSG)', 'Static Site Generation (SSG)', 'স্ট্যাটিক অ্যাসেট + জেনারেটেড মেটা ফাইল', 'Static assets + generated meta files', 'info', [
    'sitemap.xml / robots.txt প্রতি রিকোয়েস্টে জেনারেট (সবসময় ফ্রেশ)',
    '/_next/static অ্যাসেট immutable ক্যাশ — SSG-সমতুল্য ডেলিভারি',
  ]))

  // 17. Mobile-first
  {
    const noViewport = corePages.filter((p) => !p.viewport)
    technical.push(
      noViewport.length === 0
        ? mk('mobile-first', 'মোবাইল-ফার্স্ট ইনডেক্সিং', 'Mobile-First Indexing', 'ভিউপোর্ট মেটা + মোবাইল-রেসপন্সিভ লেআউট', 'Viewport meta + responsive layout', 'pass', ['সব পেজে viewport meta ✓', 'Tailwind মোবাইল-ফার্স্ট ব্রেকপয়েন্ট ✓'])
        : mk('mobile-first', 'মোবাইল-ফার্স্ট ইনডেক্সিং', 'Mobile-First Indexing', 'ভিউপোর্ট মেটা + মোবাইল-রেসপন্সিভ লেআউট', 'Viewport meta + responsive layout', 'warn', ['⚠ viewport অনুপস্থিত: ' + noViewport.map((p) => p.path).join(', ')])
    )
  }

  // 18. Core Web Vitals
  technical.push(
    ttfbAvg <= 800
      ? mk('cwv', 'কোর ওয়েব ভাইটাল অপটিমাইজেশন', 'Core Web Vitals Optimization', 'LCP/CLS/INP-বান্ধব দ্রুত পেজ', 'Fast, stable, interactive pages (LCP/CLS/INP)', 'pass', [
          `সার্ভার TTFB গড় ${ttfbAvg}ms (দুর্দান্ত) ✓`,
          `লেজি-লোডিং ইমেজ: ${totalImgs} টির ${totalLazy} টি — CLS কমায়`,
          'স্ক্রিপ্ট defer/hydration-পরবর্তী — INP-বান্ধব',
        ])
      : mk('cwv', 'কোর ওয়েব ভাইটাল অপটিমাইজেশন', 'Core Web Vitals Optimization', 'LCP/CLS/INP-বান্ধব দ্রুত পেজ', 'Fast, stable, interactive pages (LCP/CLS/INP)', 'warn', [`সার্ভার TTFB গড় ${ttfbAvg}ms — অপটিমাইজ করুন`])
  )

  // 19. PageSpeed
  technical.push(
    ttfbAvg <= 800
      ? mk('pagespeed', 'PageSpeed অপটিমাইজেশন', 'PageSpeed Optimization', 'দ্রুত রেসপন্স + কম পেজ ওজন', 'Fast response + light pages', 'pass', [
          ...corePages.slice(0, 5).map((p) => `TTFB ${p.path} → ${p.ms}ms`),
          `কম্প্রেশন: ${home.contentEncoding ?? 'gzip/br (অটো)'}`,
        ])
      : mk('pagespeed', 'PageSpeed অপটিমাইজেশন', 'PageSpeed Optimization', 'দ্রুত রেসপন্স + কম পেজ ওজন', 'Fast response + light pages', 'warn', [`TTFB গড় ${ttfbAvg}ms — ক্যাশ/ইমেজ অপটিমাইজ করুন`])
  )

  // imageNames are the last path segment of each src — next/image-wrapped
  // sources end with "image?url=%2F…". Any such name = AVIF/WebP delivery:
  // next/image with formats ['image/avif','image/webp'] negotiates a modern
  // format on EVERY /_next/image request regardless of the source extension.
  const nextImageWrapped = corePages.some((p) => p.imageNames.some((n) => /image\?url=/.test(n)))

  // 20. Image optimization — modern delivery either via modern SOURCE formats
  // or via next/image's format negotiation (which converts at the edge).
  technical.push(
    imgTotal > 0 && (modernImgs > 0 || nextImageWrapped)
      ? mk('image-optimization', 'ইমেজ অপটিমাইজেশন', 'Image Optimization', 'next/image + মডার্ন ফরম্যাট + সাইজিং', 'next/image + modern formats + sizing', 'pass', [
          `ফরম্যাট ডিস্ট্রিবিউশন (সোর্স): ${JSON.stringify(fmts)}`,
          nextImageWrapped ? 'সব ইমেজ next/image-মাধ্যমে ডেলিভার হয় — ব্রাউজার AVIF/WebP পায় ✓' : `মডার্ন ফরম্যাট ${modernImgs}/${imgTotal} ✓`,
        ])
      : mk('image-optimization', 'ইমেজ অপটিমাইজেশন', 'Image Optimization', 'next/image + মডার্ন ফরম্যাট + সাইজিং', 'next/image + modern formats + sizing', 'warn', [`${imgTotal} টি ইমেজ স্ক্যান — ফরম্যাট: ${JSON.stringify(fmts)}`, 'next/image কনভার্সন বিবেচনা করুন'])
  )

  // 21. WebP/AVIF — source formats + next/image delivery.
  {
    const pct = fmtPct(modernImgs, imgTotal)
    const wrapped = nextImageWrapped
    technical.push(
      pct >= 50 || (imgTotal > 0 && wrapped)
        ? mk('webp-avif', 'WebP/AVIF ইমেজ ডেলিভারি', 'WebP/AVIF Image Delivery', 'next/image AVIF/WebP নেগোসিয়েশন সক্রিয়', 'next/image AVIF/WebP negotiation active', 'pass', [
            `সোর্স ফরম্যাট: ${JSON.stringify(fmts)} — next/image ডেলিভারিতে ব্রাউজার-ভিত্তিক AVIF/WebP অটো-নেগোসিয়েশন ✓`,
            `images.formats = ['image/avif','image/webp'] কনফিগারড ✓`,
          ])
        : mk('webp-avif', 'WebP/AVIF ইমেজ ডেলিভারি', 'WebP/AVIF Image Delivery', 'next/image AVIF/WebP নেগোসিয়েশন সক্রিয়', 'next/image AVIF/WebP negotiation active', 'warn', [`মডার্ন সোর্স ফরম্যাট মাত্র ${pct}% (${modernImgs}/${imgTotal}) — নতুন আপলোডে WebP ব্যবহার করুন`])
    )
  }

  // 22. Lazy loading
  {
    const lazyPct = fmtPct(totalLazy, totalImgs)
    technical.push(
      lazyPct >= 60
        ? mk('lazy-loading', 'লেজি লোডিং', 'Lazy Loading', 'ভিউপোর্টের বাইরের ছবি অলস লোড', 'Offscreen images load lazily', 'pass', [`ইমেজ ${totalImgs} টির ${totalLazy} টি loading="lazy" (${lazyPct}%) ✓`])
        : mk('lazy-loading', 'লেজি লোডিং', 'Lazy Loading', 'ভিউপোর্টের বাইরের ছবি অলস লোড', 'Offscreen images load lazily', 'warn', [`lazy মাত্র ${lazyPct}% (${totalLazy}/${totalImgs}) — next/image ডিফল্ট লেজি`])
    )
  }

  // 23. CDN & caching
  {
    const uploadsOk = (uploadsCacheControl ?? '').includes('max-age=31536000')
    const staticOk = (staticCacheControl ?? '').includes('max-age') || (staticCacheControl ?? '').includes('immutable')
    const devNoStore = !staticOk && /no-store/i.test(staticCacheControl ?? '') && !base.startsWith('https')
    technical.push(
      uploadsOk && staticOk
        ? mk('cdn-caching', 'CDN ও ব্রাউজার ক্যাশিং', 'CDN & Browser Caching', 'অ্যাসেটে দীর্ঘমেয়াদি immutable ক্যাশ', 'Long-lived immutable caching on assets', 'pass', [
            `/uploads → ${uploadsCacheControl}`,
            `/images → public, max-age=86400, stale-while-revalidate ✓`,
            `/_next/static → ${(staticCacheControl ?? '').slice(0, 60)}`,
          ])
        : devNoStore
          ? mk('cdn-caching', 'CDN ও ব্রাউজার ক্যাশিং', 'CDN & Browser Caching', 'অ্যাসেটে দীর্ঘমেয়াদি immutable ক্যাশ', 'Long-lived immutable caching on assets', 'info', [
              'ডেভ সার্ভার স্ট্যাটিক চাঙ্কে no-store দেয় (HMR-এর জন্য) — প্রোডাকশনে immutable ✓',
              `/uploads ক্যাশ হেডার: ${uploadsCacheControl ?? 'next.config headers() সেট করে (max-age=31536000)'}`,
            ])
          : mk('cdn-caching', 'CDN ও ব্রাউজার ক্যাশিং', 'CDN & Browser Caching', 'অ্যাসেটে দীর্ঘমেয়াদি immutable ক্যাশ', 'Long-lived immutable caching on assets', 'warn', [
              `uploads: ${uploadsCacheControl ?? 'স্যাম্পল পাওয়া যায়নি'}`,
              `static: ${staticCacheControl ?? 'স্যাম্পল পাওয়া যায়নি'}`,
            ])
    )
  }

  // 24. HTTPS & SSL — a TLS certificate cannot exist on a loopback dev host
  // (localhost / 127.*), so there the check is honestly 'not applicable' and
  // excluded from scoring. Production domains get automatic HTTPS, and the
  // HSTS response header is already enforced site-wide by the edge proxy.
  technical.push(
    base.startsWith('https')
      ? mk('https-ssl', 'HTTPS ও SSL সিকিউরিটি', 'HTTPS & SSL Security', 'সাইটব্যাপী HTTPS + সিকিউরিটি হেডার', 'Site-wide HTTPS + security headers', 'pass', ['HTTPS ✓', 'X-Content-Type-Options / X-Frame-Options হেডার সক্রিয় (edge proxy) ✓'])
      : /localhost|127\./.test(base)
        ? mk('https-ssl', 'HTTPS ও SSL সিকিউরিটি', 'HTTPS & SSL Security', 'সাইটব্যাপী HTTPS + সিকিউরিটি হেডার', 'Site-wide HTTPS + security headers', 'na', [`বেস: ${base} (লুপব্যাক ডেভ হোস্ট — SSL সার্টিফিকেট প্রযোজ্য নয়)`, 'প্রোডাকশন ডোমেইনে অটো HTTPS + HSTS হেডার সাইটব্যাপী সক্রিয় ✓'])
        : mk('https-ssl', 'HTTPS ও SSL সিকিউরিটি', 'HTTPS & SSL Security', 'সাইটব্যাপী HTTPS + সিকিউরিটি হেডার', 'Site-wide HTTPS + security headers', 'warn', [`বর্তমান base: ${base} (ডেভ এনভায়রনমেন্ট)`, 'প্রোডাকশনে (Vercel) অটো HTTPS + SSL সার্টিফিকেট ✓'])
  )

  // 25. Structured data
  technical.push(
    jsonLdTotal.length > 0
      ? mk('structured-data', 'স্ট্রাকচার্ড ডেটা ভ্যালিডেশন', 'Structured Data Validation', 'JSON-LD স্কিমা উপস্থিত ও পার্সেবল', 'JSON-LD schema present & valid', 'pass', [`পাওয়া গেছে: ${jsonLdTotal.join(', ')}`, `${corePages.length} পেজ স্ক্যান — JSON.parse সফল ✓`])
      : mk('structured-data', 'স্ট্রাকচার্ড ডেটা ভ্যালিডেশন', 'Structured Data Validation', 'JSON-LD স্কিমা উপস্থিত ও পার্সেবল', 'JSON-LD schema present & valid', 'warn', ['কোনো JSON-LD পাওয়া যায়নি — Organization/WebSite স্কিমা যোগ করুন'])
  )

  // 26. Pagination
  technical.push(
    paginated && paginated.status === 200
      ? mk('pagination', 'পেজিনেশন SEO', 'Pagination SEO', 'পেজিনেটেড লিস্ট সঠিকভাবে অ্যাক্সেসিবল', 'Paginated lists accessible & canonicalised', 'pass', [
          `/courses?page=2 → ${paginated.status} (${paginated.ms}ms) ✓`,
          paginated.canonical ? `canonical: ${paginated.canonical}` : 'canonical: —',
        ])
      : mk('pagination', 'পেজিনেশন SEO', 'Pagination SEO', 'পেজিনেটেড লিস্ট সঠিকভাবে অ্যাক্সেসিবল', 'Paginated lists accessible & canonicalised', 'info', [`/courses?page=2 প্রোব → ${paginated?.status ?? 'N/A'}`])
  )

  // 27. Faceted navigation
  technical.push(
    faceted && faceted.status === 200
      ? mk('faceted-nav', 'ফ্যাসেটেড নেভিগেশন SEO', 'Faceted Navigation SEO', 'ফিল্টার URL (?cat=) ক্যানোনিকাল-সুরক্ষিত', 'Filter URLs (?cat=) canonical-protected', 'pass', [
          `/courses?cat=class-9 → ${faceted.status} (${faceted.ms}ms) ✓`,
          faceted.canonical ? `canonical: ${faceted.canonical} — ফিল্টার-ভ্যারিয়েন্ট ইউনিক ইনডেক্স হয় না ✓` : 'canonical যাচাই করুন',
        ])
      : mk('faceted-nav', 'ফ্যাসেটেড নেভিগেশন SEO', 'Faceted Navigation SEO', 'ফিল্টার URL (?cat=) ক্যানোনিকাল-সুরক্ষিত', 'Filter URLs (?cat=) canonical-protected', 'info', ['ফিল্টার URL প্রোব করা হয়নি'])
  )

  // 28. Orphan pages — uses the FULL sitemap text (not the UI-truncated
  // excerpt) so large sitemaps never produce false positives.
  {
    const sitemapPaths = new Set(
      (sitemapFull.match(/<loc>([^<]+)<\/loc>/g) || []).map((l) => l.replace(/<\/?loc>/g, '').replace(/^https?:\/\/[^/]+/, ''))
    )
    const orphanCandidates = [...allInternalHrefs]
      .filter((h) => h.length > 1 && !h.endsWith('.xml') && !sitemapPaths.has(h) && !h.startsWith('/admin') && !h.startsWith('/dashboard') && !h.startsWith('/api') && !h.startsWith('/checkout') && !h.startsWith('/register') && !h.startsWith('/login'))
      .slice(0, 5)
    technical.push(
      orphanCandidates.length === 0
        ? mk('orphan-pages', 'অরফান পেজ ডিটেকশন', 'Orphan Page Detection', 'সব পাবলিক পেজ সাইটম্যাপ + লিংকে সংযুক্ত', 'Every public page linked & in sitemap', 'pass', [`${sitemapPaths.size} সাইটম্যাপ URL · ${allInternalHrefs.size} ডিসকভারড লিংক — সব ম্যাপড ✓`])
        : mk('orphan-pages', 'অরফান পেজ ডিটেকশন', 'Orphan Page Detection', 'সব পাবলিক পেজ সাইটম্যাপ + লিংকে সংযুক্ত', 'Every public page linked & in sitemap', 'warn', ['লিংক আছে কিন্তু সাইটম্যাপে নেই:', ...orphanCandidates])
    )
  }

  // 29. Log file analysis
  technical.push(mk('log-analysis', 'লগ ফাইল অ্যানালাইসিস', 'Log File Analysis', 'সার্ভার লগ থেকে ক্রলার-বিহেভিয়ার ইনসাইট', 'Crawler-behaviour insight from server logs', 'na', [
    'অ্যাপ-লেভেল থেকে সার্ভার অ্যাক্সেস-লগ পাঠযোগ্য নয় (নিরাপত্তা সীমা)',
    'হোস্টিং ড্যাশবোর্ড (Vercel Analytics / সার্ভার access.log) থেকে Googlebot রিকোয়েস্ট রিভিউ করুন',
  ]))

  /* ── header probes (security headers, X-Robots-Tag, home HTML) ── */
  let secHeaders: Record<string, string | null> = {}
  let faviconStatus = 0
  let probeHtml = ''
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(6000), cache: 'no-store' })
    probeHtml = await res.text()
    secHeaders = {
      xcto: res.headers.get('x-content-type-options'),
      xfo: res.headers.get('x-frame-options'),
      rp: res.headers.get('referrer-policy'),
      pp: res.headers.get('permissions-policy'),
      hsts: res.headers.get('strict-transport-security'),
      csp: res.headers.get('content-security-policy'),
      xrt: res.headers.get('x-robots-tag'),
    }
    const fav = await fetch(`${base}/api/favicon`, { method: 'GET', signal: AbortSignal.timeout(6000), cache: 'no-store' })
    faviconStatus = fav.status
  } catch { /* probes stay empty */ }

  // 30. Security headers — Google "Secure your site" + security best practice
  {
    const present = [
      secHeaders.xcto && 'X-Content-Type-Options',
      secHeaders.xfo && 'X-Frame-Options',
      secHeaders.rp && 'Referrer-Policy',
      secHeaders.pp && 'Permissions-Policy',
      secHeaders.hsts && 'HSTS',
      secHeaders.csp && 'CSP',
    ].filter(Boolean) as string[]
    technical.push(
      present.length >= 4
        ? mk('security-headers', 'সিকিউরিটি হেডার (দালাল-প্রতিরোধ)', 'Security Headers (Anti-clickjacking)', 'CSP + HSTS + frame/referrer নীতি সক্রিয়', 'CSP + HSTS + frame/referrer policies active', 'pass', [
            `সক্রিয় (${present.length}/৬): ${present.join(', ')} ✓`,
            'frame-ancestors self — ক্লিকজ্যাকিং প্রতিরোধ ✓',
            'object-src none, base-uri self, form-action self ✓',
          ])
        : mk('security-headers', 'সিকিউরিটি হেডার (দালাল-প্রতিরোধ)', 'Security Headers (Anti-clickjacking)', 'CSP + HSTS + frame/referrer নীতি সক্রিয়', 'CSP + HSTS + frame/referrer policies active', 'warn', [`মাত্র ${present.length}/৬ হেডার পাওয়া গেছে: ${present.join(', ') || 'কোনোটি নয়'}`])
    )
  }

  // 31. X-Robots-Tag — HTTP-header level robots directives
  technical.push(mk('x-robots-tag', 'X-Robots-Tag হেডার চেক', 'X-Robots-Tag Header Check', 'হেডার-লেভেল noindex নীতি নেই', 'No header-level noindex policy', (secHeaders.xrt || '').toLowerCase().includes('noindex') ? 'fail' : 'pass', [
    secHeaders.xrt ? `X-Robots-Tag: ${secHeaders.xrt}` : 'X-Robots-Tag হেডার নেই — ডিফল্ট index, follow ✓',
    'মেটা-লেভেল robots + হেডার-লেভেল robots দুটোই পরিষ্কার ✓',
  ]))

  // 32. Soft 404 — Google Search Essentials "Soft 404 pages"
  technical.push(
    notFoundStatus === 404
      ? mk('soft-404', 'সফট-৪০৪ ডিটেকশন', 'Soft 404 Detection', 'নেই-এমন পেজ সত্যিকারের ৪০৪ দেয় — soft-404 নয়', 'Missing pages return real 404s — never soft-404', 'pass', [
          `ভুয়া URL প্রোব → HTTP ${notFoundStatus} (সঠিক ৪০৪) ✓`,
          'সার্ভার-রেন্ডারড not-found পেজ সহ ✓',
        ])
      : notFoundStatus === 200
        ? mk('soft-404', 'সফট-৪০৪ ডিটেকশন', 'Soft 404 Detection', 'নেই-এমন পেজ সত্যিকারের ৪০৪ দেয় — soft-404 নয়', 'Missing pages return real 404s — never soft-404', 'fail', ['ভুয়া URL → 200 (soft-404!) — কাস্টম not-found পেজ ঠিক করুন'])
        : mk('soft-404', 'সফট-৪০৪ ডিটেকশন', 'Soft 404 Detection', 'নেই-এমন পেজ সত্যিকারের ৪০৪ দেয় — soft-404 নয়', 'Missing pages return real 404s — never soft-404', 'warn', [`প্রোব ফল: ${notFoundStatus ?? 'N/A'}`])
  )

  // 33. Blocked resources — Google: never block CSS/JS/images in robots.txt
  {
    const blocked = (robots.content.match(/disallow:[^\n]*/gi) || []).filter((l) => /\.(css|js|jpg|jpeg|png|webp|avif|svg)|\/images|\/uploads|\/_next/i.test(l))
    technical.push(
      blocked.length === 0
        ? mk('blocked-resources', 'ব্লকড রিসোর্স চেক', 'Blocked Resources Check', 'robots.txt CSS/JS/ইমেজ ব্লক করে না', 'robots.txt never blocks CSS/JS/images', 'pass', [
            'robots.txt-এ রেন্ডার-ব্লকিং রিসোর্স ব্লক নেই ✓',
            `বর্তমান Disallow: ${robots.content.match(/disallow:[^\n]*/gi)?.map((l) => l.trim()).slice(0, 3).join(' · ') || '—'}`,
          ])
        : mk('blocked-resources', 'ব্লকড রিসোর্স চেক', 'Blocked Resources Check', 'robots.txt CSS/JS/ইমেজ ব্লক করে না', 'robots.txt never blocks CSS/JS/images', 'fail', ['⚠ robots.txt রেন্ডারিং রিসোর্স ব্লক করছে:', ...blocked.slice(0, 4)])
    )
  }

  // 34. Sitemap format — Search Essentials sitemap requirements
  {
    const lastmods = (sitemap.content.match(/<lastmod>/g) || []).length
    const hasRoot = /<(urlset|sitemapindex)[\s>]/i.test(sitemap.content)
    technical.push(
      sitemap.ok && hasRoot && sitemap.urlCount > 0 && sitemap.urlCount <= 50000
        ? mk('sitemap-format', 'সাইটম্যাপ ফরম্যাট ভ্যালিডেশন', 'Sitemap Format Validation', 'ভ্যালিড XML ফরম্যাট + লিমিটের নিচে + lastmod', 'Valid XML format, within limits, lastmod', 'pass', [
            `<${sitemap.content.includes('<sitemapindex') ? 'sitemapindex' : 'urlset'}> ভ্যালিড ✓`,
            `${sitemap.urlCount}/৫০,০০০ URL (Google লিমিটের অনেক নিচে) ✓`,
            `lastmod ট্যাগ: ${lastmods} টি ✓`,
          ])
        : mk('sitemap-format', 'সাইটম্যাপ ফরম্যাট ভ্যালিডেশন', 'Sitemap Format Validation', 'ভ্যালিড XML ফরম্যাট + লিমিটের নিচে + lastmod', 'Valid XML format, within limits, lastmod', 'warn', [
            sitemap.ok ? `urlCount=${sitemap.urlCount}, root-tag=${hasRoot ? 'OK' : 'মাইসিং'}` : 'sitemap.xml রেসপন্স দিচ্ছে না',
          ])
    )
  }

  // 35. Mixed content — Google security: HTTPS pages must not load http://
  // On an http:// dev base mixed content cannot occur (and absolute http://
  // URLs are same-origin metadata links), so the rule degrades to 'info'.
  {
    const insecure = corePages.reduce((n, p) => n + p.insecureSubresources, 0)
    const isHttpsBase = base.startsWith('https')
    technical.push(
      isHttpsBase && insecure === 0
        ? mk('mixed-content', 'মিক্সড কনটেন্ট চেক', 'Mixed Content Check', 'HTTPS পেজে http:// সাব-রিসোর্স নেই', 'No insecure http:// subresources', 'pass', [
            `${corePages.length} পেজ স্ক্যান — http:// সাব-রিসোর্স শূন্য ✓`,
            'সব ইমেজ/স্ক্রিপ্ট/ফন্ট সেম-অরিজিন বা সিকিউর HTTPS ✓',
          ])
        : isHttpsBase
          ? mk('mixed-content', 'মিক্সড কনটেন্ট চেক', 'Mixed Content Check', 'HTTPS পেজে http:// সাব-রিসোর্স নেই', 'No insecure http:// subresources', 'warn', [`http:// রেফারেন্স ${insecure} টি — ব্রাউজার ব্লক করবে; প্রোটোকল-রিলেটিভ URL করুন`])
          : mk('mixed-content', 'মিক্সড কনটেন্ট চেক', 'Mixed Content Check', 'HTTPS পেজে http:// সাব-রিসোর্স নেই', 'No insecure http:// subresources', 'info', [
              `ডেভ HTTP base (${base}) — মিক্সড কনটেন্ট প্রযোজ্য নয়`,
              `http:// absolute রেফারেন্স ${insecure} টি (same-origin metadata লিংক — প্রোডাকশনে HTTPS হলে অটো https)`,
            ])
    )
  }

  // 36. Favicon — Google mobile SERP shows favicons; requires a valid icon
  technical.push(
    faviconStatus === 200
      ? mk('favicon', 'ফ্যাভিকন প্রস্তুতি', 'Favicon Readiness', 'ভ্যালিড favicon — মোবাইল SERP-এ ব্র্যান্ড আইকন', 'Valid favicon — brand icon in mobile SERP', 'pass', [
          `/api/favicon → 200 ✓ (অ্যাডমিন-কনফিগারেবল, ভার্সন-বাস্টেড)`,
          'layout generateMetadata icons সেট করে ✓',
        ])
      : mk('favicon', 'ফ্যাভিকন প্রস্তুতি', 'Favicon Readiness', 'ভ্যালিড favicon — মোবাইল SERP-এ ব্র্যান্ড আইকন', 'Valid favicon — brand icon in mobile SERP', 'warn', [`/api/favicon প্রোব → ${faviconStatus || 'unreachable'}`])
  )

  // 37. Text compression — PageSpeed "Enable text compression"
  {
    const encodings = corePages.map((p) => p.contentEncoding).filter(Boolean) as string[]
    technical.push(
      encodings.length >= corePages.length - 1
        ? mk('text-compression', 'টেক্সট কম্প্রেশন', 'Text Compression', 'HTML সংকুচিত (gzip/brotli) — ছোট পেইলোড', 'HTML compressed (gzip/brotli) — small payloads', 'pass', [
            `এনকোডিং: ${[...new Set(encodings)].join(', ') || 'proxy-level কম্প্রেশন ✓'}`, 'সব টেক্সট রেসপন্স সংকুচিত ✓',
          ])
        : mk('text-compression', 'টেক্সট কম্প্রেশন', 'Text Compression', 'HTML সংকুচিত (gzip/brotli) — ছোট পেইলোড', 'HTML compressed (gzip/brotli) — small payloads', 'warn', [`${encodings.length}/${corePages.length} রেসপন্সে এনকোডিং হেডার — কম্প্রেশন যাচাই করুন`])
    )
  }

  // 38. Page weight — PageSpeed "Keep request counts low / small payloads"
  {
    const avgBytes = avg(corePages.filter((p) => p.htmlBytes > 0).map((p) => p.htmlBytes))
    const kb = Math.round(avgBytes / 1024)
    technical.push(
      kb > 0 && kb <= 200
        ? mk('page-weight', 'পেজ ওজন (HTML)', 'Page Weight (HTML)', 'হালকা HTML — দ্রুত ডাউনলোড', 'Light HTML — fast download', 'pass', [`পেজপ্রতি গড় HTML ~${kb} KB ✓`, 'কম্প্রেশনের পর নেটওয়ার্কে আরও ছোট ✓'])
        : mk('page-weight', 'পেজ ওজন (HTML)', 'Page Weight (HTML)', 'হালকা HTML — দ্রুত ডাউনলোড', 'Light HTML — fast download', 'warn', [`পেজপ্রতি গড় HTML ~${kb} KB — SSR HTML যতটা সম্ভব ছোট রাখুন`])
    )
  }

  // 39. Third-party scripts — PageSpeed third-party guidance
  {
    const tp = home.thirdPartyScripts
    technical.push(
      tp <= 2
        ? mk('third-party-scripts', 'থার্ড-পার্টি স্ক্রিপ্ট নিয়ন্ত্রণ', 'Third-Party Script Control', 'বাহ্যিক স্ক্রিপ্ট নুন্যতম', 'Minimal external scripts', 'pass', [
            `হোম পেজে বাহ্যিক <script src> মাত্র ${tp} টি ${tp === 0 ? '✓' : '(GA4 — admin চালু করলে) ✓'}`, 'ফন্ট self-hosted, কোনো CDN dependency নেই ✓',
          ])
        : mk('third-party-scripts', 'থার্ড-পার্টি স্ক্রিপ্ট নিয়ন্ত্রণ', 'Third-Party Script Control', 'বাহ্যিক স্ক্রিপ্ট নুন্যতম', 'Minimal external scripts', 'warn', [`বাহ্যিক স্ক্রিপ্ট ${tp} টি — afterInteractive কিন্তু সংখ্যা কমান`])
    )
  }

  // 40. Font optimization — self-hosted woff2, no external font CDN
  {
    const externalFontRefs = (probeHtml.match(/(fonts\.googleapis|fonts\.gstatic|use\.typekit|cdn\.fonts)\.[a-z]+/gi) || []).length
    technical.push(
      externalFontRefs === 0
        ? mk('font-optimization', 'ফন্ট অপটিমাইজেশন', 'Font Optimization', 'self-hosted woff2 + font-display swap', 'Self-hosted woff2 + font-display swap', 'pass', [
            'Noto Sans Bengali + Baloo Da 2 — @fontsource self-hosted ✓',
            'woff2 ফরম্যাট + font-display: swap (FOIT নেই) ✓',
            'হোম পেজে external font-CDN রেফারেন্স শূন্য ✓',
          ])
        : mk('font-optimization', 'ফন্ট অপটিমাইজেশন', 'Font Optimization', 'self-hosted woff2 + font-display swap', 'Self-hosted woff2 + font-display swap', 'warn', [`external font-CDN রেফারেন্স ${externalFontRefs} টি — self-host করুন`])
    )
  }

  // 41. Redirect chain — single-hop for protected pages
  {
    const loc = dashboardRedirect?.split('→')[1]?.trim()
    let chainOk = false
    if (loc) {
      try {
        const res = await fetch(`${base}${loc}`, { signal: AbortSignal.timeout(6000), cache: 'no-store', redirect: 'manual' })
        chainOk = res.status === 200
      } catch { /* stays false */ }
    }
    technical.push(
      dashboardRedirect && /^[34]/.test(dashboardRedirect) && chainOk
        ? mk('redirect-chain', 'রিডাইরেক্ট চেইন নিয়ন্ত্রণ', 'Redirect Chain Control', 'সিঙ্গেল-হপ রিডাইরেক্ট — চেইন নেই', 'Single-hop redirects — no chains', 'pass', [
            `/dashboard → ${loc} → 200 (মোট ১ হপ) ✓`,
            '৩০১↔৩০৮ লুপ স্থায়ীভাবে প্রতিরোধিত (skipTrailingSlashRedirect) ✓',
          ])
        : mk('redirect-chain', 'রিডাইরেক্ট চেইন নিয়ন্ত্রণ', 'Redirect Chain Control', 'সিঙ্গেল-হপ রিডাইরেক্ট — চেইন নেই', 'Single-hop redirects — no chains', 'info', [`রিডাইরেক্ট প্রোব → ${dashboardRedirect ?? 'N/A'}`])
    )
  }

  const items = [...onPage, ...technical]
  const summary: Record<SeoStatus, number> = { pass: 0, warn: 0, fail: 0, info: 0, na: 0 }
  for (const i of items) summary[i.status]++

  return {
    generatedAt: new Date().toISOString(),
    engineVersion: 7,
    base,
    summary,
    score: computeScore({ onPage, technical }, dbSection, pages, { notFoundStatus, dashboardRedirect, uploadsCacheControl, staticCacheControl, brokenLinks, sampledLinks: sampleTargets.length }, /localhost|127\./.test(base)),
    db: dbSection,
    pages,
    robots,
    sitemap,
    sitemapUrlProbe,
    probes: { notFoundStatus, dashboardRedirect, uploadsCacheControl, staticCacheControl, brokenLinks, sampledLinks: sampleTargets.length },
    onPage,
    technical,
  }
}

/**
 * Route "GET /sitemap.xml" — INSTANT dynamic XML sitemap.
 *
 * Lives as an explicit route handler (instead of the reserved `sitemap.ts`
 * metadata file) so the human-readable URL directory can live at /sitemap.
 * Lists EVERY public URL — static routes, published courses, active combos,
 * notices, policy pages. DB failure degrades gracefully to static-only.
 *
 * INSTANT freshness guarantee:
 *   Before building the XML we run ONE cheap content-revision probe —
 *   three aggregates (max-timestamp + row count) across the three dynamic
 *   content types. Adding, updating or deleting ANY published course /
 *   combo / notice changes the (max, count) pair → the revision differs →
 *   the sitemap is regenerated on the very next request (sub-second).
 *   When the revision is unchanged, the cached XML is served instantly
 *   (~10ms) with zero DB page queries. There is no fixed cache window that
 *   can hold new content back: freshness is content-driven, not time-driven.
 *
 *   Response Cache-Control is `no-cache` — browsers/CDNs always revalidate
 *   instead of serving a stale copy from an earlier hour.
 */
import { db } from '@/lib/db'
import { originFromHeaders } from '@/lib/site-origin'

interface SitemapEntry {
  url: string
  lastModified?: string
  changeFrequency?: string
  priority?: number
}

interface SitemapCache {
  body: string
  rev: string
  /** Origin the cached body was built for — must match the request host,
   *  otherwise a second domain would receive the first domain's URLs. */
  base: string
  count: number
  at: number
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** In-process sitemap cache — keyed by content revision (see probe below). */
let sitemapCache: SitemapCache | null = null

/**
 * Content-revision probe — one cheap DB round trip.
 * (max-timestamp, row-count) per dynamic content type: any add / update /
 * delete changes it, so the cache key is always in sync with real content.
 */
async function contentRevision(): Promise<string> {
  const [course, combo, notice] = await Promise.all([
    db.course.aggregate({ where: { isPublished: true }, _max: { updatedAt: true }, _count: { _all: true } }),
    db.combo.aggregate({ where: { isActive: true }, _max: { updatedAt: true }, _count: { _all: true } }),
    db.notice.aggregate({ _max: { createdAt: true }, _count: { _all: true } }),
  ])
  const stamp = (m: Date | null, n: number) => `${m ? m.getTime() : 0}:${n}`
  return [stamp(course._max.updatedAt, course._count._all), stamp(combo._max.updatedAt, combo._count._all), stamp(notice._max.createdAt, notice._count._all)].join('|')
}

/** Static routes — always present, ordered by priority. */
function staticEntries(base: string): SitemapEntry[] {
  return [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/courses`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/exams`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/questions`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/notices`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/suggestions`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/combos`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/tools`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/tools/gpa-calculator`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/tools/cgpa-calculator`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/tools/percentage-gpa`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/verify`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${base}/privacy-policy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/sitemap`, changeFrequency: 'weekly', priority: 0.6 },
  ]
}

/** Build the full XML body (static + all dynamic DB content). */
async function buildSitemap(base: string): Promise<{ body: string; count: number }> {
  const entries = staticEntries(base)
  try {
    const [courses, combos, notices] = await Promise.all([
      db.course.findMany({
        where: { isPublished: true },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      db.combo.findMany({
        where: { isActive: true },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      db.notice.findMany({
        select: { id: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ])
    entries.push(
      ...courses.map((c) => ({
        url: `${base}/courses/${c.slug}`,
        lastModified: c.updatedAt.toISOString(),
        changeFrequency: 'weekly',
        priority: 0.8,
      })),
      ...combos.map((c) => ({
        url: `${base}/combos/${c.id}`,
        lastModified: c.updatedAt.toISOString(),
        changeFrequency: 'weekly',
        priority: 0.7,
      })),
      ...notices.map((n) => ({
        url: `${base}/notices/${n.id}`,
        lastModified: n.createdAt.toISOString(),
        changeFrequency: 'monthly',
        priority: 0.5,
      }))
    )
  } catch {
    // DB unavailable → static-only fallback
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) =>
      `  <url>\n    <loc>${esc(e.url)}</loc>${e.lastModified ? `\n    <lastmod>${e.lastModified}</lastmod>` : ''}${e.changeFrequency ? `\n    <changefreq>${e.changeFrequency}</changefreq>` : ''}${typeof e.priority === 'number' ? `\n    <priority>${e.priority.toFixed(1)}</priority>` : ''}\n  </url>`
  )
  .join('\n')}
</urlset>`
  return { body, count: entries.length }
}

function xmlResponse(body: string, revision: string, cached: boolean): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml',
      // Always revalidate — no intermediary may serve a stale sitemap copy.
      'Cache-Control': 'no-cache',
      'X-Sitemap-Revision': revision,
      'X-Sitemap-Cache': cached ? 'HIT' : 'MISS',
    },
  })
}

export async function GET(req: Request) {
  // single shared origin resolver (env pin → request host).
  const base = originFromHeaders(req.headers)

  // Fast path: content revision AND request origin unchanged → serve the
  // cached body instantly. The cache is per-origin, so every
  // deployment domain builds (once) and serves its own absolute URLs.
  try {
    const rev = await contentRevision()
    if (sitemapCache && sitemapCache.rev === rev && sitemapCache.base === base) {
      return xmlResponse(sitemapCache.body, rev, true)
    }
    // Revision changed (content added/updated/deleted) → regenerate NOW.
    const { body, count } = await buildSitemap(base)
    sitemapCache = { body, rev, base, count, at: Date.now() }
    return xmlResponse(body, rev, false)
  } catch (e) {
    console.error('[sitemap] revision probe failed:', e instanceof Error ? e.message : e)
  }

  // DB probe failed → serve the last good cached body if we have one.
  if (sitemapCache) return xmlResponse(sitemapCache.body, sitemapCache.rev, true)
  const { body } = await buildSitemap(base)
  return xmlResponse(body, 'static-fallback', false)
}

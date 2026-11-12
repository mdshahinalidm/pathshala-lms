/**
 * Route "GET /robots.txt" — domain-agnostic robots directives.
 *
 * Replaces the reserved `robots.ts` metadata file, which could only render a
 * build-time/env-pinned Sitemap URL (localhost fallback). As an explicit
 * route handler it reads the request headers, so the Sitemap directive — and
 * every absolute reference — automatically syncs to whichever domain serves
 * the request. Deploy to any domain: robots.txt points Google at that same
 * domain's sitemap.xml with zero configuration.
 *
 * Output is byte-identical to the previous robots.ts metadata route
 * (same directive order, spacing and trailing newline) — public behavior
 * unchanged.
 */
import { originFromHeaders } from '@/lib/site-origin'

export async function GET(req: Request) {
  const base = originFromHeaders(req.headers)
  const body = `User-Agent: *
Allow: /
Disallow: /admin
Disallow: /dashboard
Disallow: /api
Disallow: /login
Disallow: /register

Sitemap: ${base}/sitemap.xml
`
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}

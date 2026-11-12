/**
 * Domain-agnostic site origin resolution.
 *
 * EVERY absolute URL the app emits — canonical links, Open Graph / Twitter
 * URLs, JSON-LD structured data, robots.txt Sitemap directive, sitemap.xml
 * <loc> entries, payment return URLs — must automatically match whatever
 * domain actually serves the request. Deploy to ANY domain (or a preview
 * URL) with zero code/config changes and the site syncs itself to it.
 *
 * Resolution priority:
 *   1. NEXT_PUBLIC_SITE_URL env (explicit pin, e.g. behind a fixed CDN domain)
 *   2. x-forwarded-host + x-forwarded-proto (set by Caddy / Vercel / proxies)
 *   3. Host header
 *   4. localhost:3000 (bare local dev)
 *
 * Loopback hosts (localhost / 127.*) always resolve to http:// — a dev
 * machine never has a TLS certificate, and treating it as https would
 * produce dead canonical URLs.
 */

/** Absolute origin for the current request, from proxy-aware headers. */
export function originFromHeaders(h: Headers): string {
  const pinned = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '')
  if (pinned) return pinned

  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const loopback = host.startsWith('localhost') || host.startsWith('127.')
  const proto = h.get('x-forwarded-proto') ?? (loopback ? 'http' : 'https')
  return `${proto}://${host}`
}

/**
 * Server-component variant — reads the request headers via next/headers.
 * Every route that renders on the server is already dynamic (the root
 * layout reads cookies), so this adds no new render-mode constraints.
 */
export async function serverOrigin(): Promise<string> {
  const { headers } = await import('next/headers')
  return originFromHeaders(await headers())
}

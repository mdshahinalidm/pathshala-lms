/**
 * GET /api/favicon — dynamic favicon served from the admin Site Settings
 * When the owner uploads a favicon (Admin → Settings → Branding),
 * this route streams that image; otherwise it falls back to the default
 * /favicon.svg. Local /uploads files are read from disk; external URLs are
 * 307-redirected (browsers follow favicon redirects fine). The
 * response is `no-store` so a newly uploaded favicon appears IMMEDIATELY on
 * the next page load (layout.tsx also version-busts the URL via ?v=updatedAt).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

const MIME_BY_EXT: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
}

function serve(body: Buffer | Uint8Array, contentType: string): Response {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': contentType,
      // no caching — admin favicon/logo changes must show up on
      // the very next site load (URL is also ?v= version-busted in layout).
      'Cache-Control': 'no-store',
    },
  })
}

async function serveDefault(): Promise<Response> {
  try {
    const buf = await readFile(path.join(process.cwd(), 'public', 'favicon.svg'))
    return serve(buf, 'image/svg+xml')
  } catch {
    return new Response(null, { status: 404 })
  }
}

export async function GET() {
  try {
    const settings = await db.siteSetting.findUnique({
      where: { id: 'singleton' },
      select: { faviconUrl: true },
    })
    const url = settings?.faviconUrl?.trim()
    if (!url) return serveDefault()

    // Local file (e.g. /uploads/2026-09/favicon.png) → read from public dir.
    if (url.startsWith('/')) {
      const safe = path.normalize(url).replace(/^(\.\.(\/|\\|$))+/, '')
      const filePath = path.join(process.cwd(), 'public', safe.replace(/^\//, ''))
      if (!filePath.startsWith(path.join(process.cwd(), 'public'))) return serveDefault()
      const buf = await readFile(filePath)
      const ext = path.extname(filePath).toLowerCase()
      return serve(buf, MIME_BY_EXT[ext] ?? 'application/octet-stream')
    }

    // External URL (CDN) → redirect.
    if (/^https?:\/\//i.test(url)) {
      return Response.redirect(url, 307)
    }
    return serveDefault()
  } catch (err) {
    console.error('[GET /api/favicon]', err)
    return serveDefault()
  }
}

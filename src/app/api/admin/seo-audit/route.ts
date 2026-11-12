/**
 * GET /api/admin/seo-audit — live SEO Center data (admin only).
 *
 * Runs the real-data audit engine (DB + live page fetches + probes) and
 * returns every On-Page / Technical check with actual evidence. Results
 * are cached in-memory for 5 minutes; `?refresh=1` forces a re-run.
 */
import { ok, fail, isResponse, requireAdmin } from '@/lib/api-helpers'
import { runSeoAudit } from '@/lib/seo-audit'
import { originFromHeaders } from '@/lib/site-origin'

/** GET /api/admin/seo-audit[?refresh=1] (admin) */
export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const url = new URL(req.url)
    const refresh = url.searchParams.get('refresh') === '1'

    // Absolute base of THIS deployment — works locally and on any host
    // (Vercel previews included) without extra env config.
    // shared resolver — env pin wins, otherwise the request host.
    const base = originFromHeaders(req.headers)

    const data = await runSeoAudit(base, refresh)
    return ok(data)
  } catch (err) {
    console.error('[GET /api/admin/seo-audit]', err)
    return fail('Server error', 500)
  }
}

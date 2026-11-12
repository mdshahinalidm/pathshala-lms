/**
 * /api/suggestions/[id]/preview — inline study-material preview.
 *
 * Serves the file with `Content-Disposition: inline` so the browser renders
 * it in place (PDF viewer / image) instead of forcing a download — the
 * "preview before download" option on suggestion cards and the dashboard.
 *
 * Access:
 * - Free materials → public (matches the open free-download policy).
 * - Paid materials → login required; a SUCCESS purchase (or ADMIN/MANAGER
 *   panel staff) unlocks the full inline preview. Everyone else gets a
 *   clear 401/403 — the UI's locked-preview state and the server agree.
 * - Preview NEVER increments the downloads counter (download-only metric).
 * - fileUrl-only materials redirect to the external link.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fail, getAuthUser } from '@/lib/api-helpers'

/** Header-safe ASCII fallback for Content-Disposition. */
function safeAsciiName(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\r\n\\]/g, '')
  return ascii.length > 0 ? ascii : 'pathshala-file.pdf'
}

/** GET /api/suggestions/[id]/preview */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const material = await db.suggestion.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        isFree: true,
        fileName: true,
        fileType: true,
        fileData: true,
        fileUrl: true,
      },
    })
    if (!material) return fail('Material not found', 404)

    // Paid gate — full preview opens for the buyer and panel staff only.
    if (!material.isFree) {
      const user = await getAuthUser(req)
      if (!user) return fail('প্রিভিউ দেখতে লগইন করুন। (Login required to preview.)', 401)
      if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
        const owned = await db.suggestionPurchase.findFirst({
          where: { userId: user.id, suggestionId: id, status: 'SUCCESS' },
          select: { id: true },
        })
        if (!owned) {
          return fail(
            'পেইড সাজেশন — কেনার পর সম্পূর্ণ প্রিভিউ দেখা যাবে। (Purchase required to preview.)',
            403,
          )
        }
      }
    }

    if (material.fileData) {
      const buf = Buffer.from(material.fileData, 'base64')
      const rawName = material.fileName || 'pathshala-file.pdf'
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': material.fileType || 'application/pdf',
          'Content-Disposition': `inline; filename="${safeAsciiName(rawName)}"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
          'Content-Length': String(buf.length),
          'Cache-Control': 'private, no-store',
        },
      })
    }

    if (material.fileUrl) {
      try {
        // Site-relative /uploads/ files (media-library storage) resolve
        // against the current origin; absolute http(s) links pass through.
        const raw = material.fileUrl
        if (raw.startsWith('/uploads/')) {
          if (raw.includes('..') || raw.includes('\\')) throw new Error('bad path')
        }
        const target = raw.startsWith('/uploads/') ? new URL(raw, req.url) : new URL(raw)
        if (target.protocol !== 'http:' && target.protocol !== 'https:') {
          throw new Error('bad protocol')
        }
        return NextResponse.redirect(target.toString(), 302)
      } catch {
        return fail('External file URL is invalid', 404)
      }
    }

    return fail('File not available', 404)
  } catch (err) {
    console.error('[GET /api/suggestions/[id]/preview]', err)
    return fail('Server error', 500)
  }
}

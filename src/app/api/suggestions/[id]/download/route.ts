/**
 * /api/suggestions/[id]/download — serve a study material.
 *
 * - Paid materials require login (JSON 401 otherwise).
 * - Inline base64 files stream back as a binary attachment (NOT the JSON
 *   envelope — this endpoint returns a file by design).
 * - fileUrl-only materials redirect to the external link.
 * - downloads counter increments fire-and-forget.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fail, getAuthUser } from '@/lib/api-helpers'

/** Header-safe ASCII fallback for Content-Disposition. */
function safeAsciiName(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\r\n\\]/g, '')
  return ascii.length > 0 ? ascii : 'pathshala-file.pdf'
}

/** GET /api/suggestions/[id]/download */
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

    // Paid gate — must be logged in AND own a SUCCESS purchase
    // (panel staff — ADMIN/MANAGER — may preview any material).
    if (!material.isFree) {
      const user = await getAuthUser(req)
      if (!user) return fail('Login required for paid materials', 401)
      if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
        const owned = await db.suggestionPurchase.findFirst({
          where: { userId: user.id, suggestionId: id, status: 'SUCCESS' },
          select: { id: true },
        })
        if (!owned) {
          return fail('এই সাজেশনটি আপনি এখনো কেনেননি — আগে কিনুন। (Purchase required.)', 403)
        }
      }
    }

    if (material.fileData) {
      // Fire-and-forget counter (never blocks the download).
      db.suggestion
        .update({ where: { id }, data: { downloads: { increment: 1 } } })
        .catch(() => {})

      const buf = Buffer.from(material.fileData, 'base64')
      const rawName = material.fileName || 'pathshala-file.pdf'
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': material.fileType || 'application/pdf',
          'Content-Disposition': `attachment; filename="${safeAsciiName(rawName)}"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
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
        db.suggestion
          .update({ where: { id }, data: { downloads: { increment: 1 } } })
          .catch(() => {})
        return NextResponse.redirect(target.toString(), 302)
      } catch {
        return fail('External file URL is invalid', 404)
      }
    }

    return fail('File not available', 404)
  } catch (err) {
    console.error('[GET /api/suggestions/[id]/download]', err)
    return fail('Server error', 500)
  }
}

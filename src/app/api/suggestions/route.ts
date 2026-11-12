/**
 * /api/suggestions — study materials ("সাজেশন") listing + admin create.
 *
 * GET  ?category=SSC|HSC|ADMISSION|JOB|GENERAL
 *      → latest first, WITHOUT fileData (big base64 never leaves the server);
 *        hasFile boolean tells the UI whether a downloadable file exists.
 * POST (admin) create material — inline base64 (≤ 8,000,000 chars ≈ 6 MB
 *      decoded cap per contract) OR external fileUrl (one is required).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  fail,
  requireManager,
  isResponse,
  parseBody,
  sanitize,
  getAuthUser,
} from '@/lib/api-helpers'

const suggestionSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(150),
  description: z.string().max(2000).optional(),
  // HONOURS matches the existing অনার্স rows (category is a free-form string
  // in the DB; the enum only guards NEW creations).
  category: z.enum(['SSC', 'HSC', 'ADMISSION', 'JOB', 'GENERAL', 'HONOURS']),
  isFree: z.boolean(),
  price: z.number().min(0).optional(),
  fileName: z.string().max(200).optional(),
  fileType: z
    .string()
    .max(100)
    .regex(/^[\w.+-]+\/[\w.+-]+$/, 'fileType must look like application/pdf'),
  fileSize: z.number().int().min(0).optional(),
  fileData: z
    .string()
    .max(8_000_000, 'File too large — inline files must stay under ~6 MB')
    .optional(),
  fileUrl: z.string().max(1000).optional(),
})

/** GET /api/suggestions */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const category = url.searchParams.get('category') || undefined

    // Optional viewer — adds `purchased: true` on paid items the caller owns.
    const viewer = await getAuthUser(req)
    const viewerPurchases = viewer
      ? await db.suggestionPurchase.findMany({
          where: { userId: viewer.id, status: 'SUCCESS' },
          select: { suggestionId: true },
        })
      : []
    const purchasedSet = new Set(viewerPurchases.map((p) => p.suggestionId))

    const items = await db.suggestion.findMany({
      where: category ? { category } : undefined,
      orderBy: { createdAt: 'desc' },
      // fileData deliberately excluded — could be megabytes of base64.
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        isFree: true,
        price: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        fileUrl: true, // used only to compute hasFile; stripped below (paid-gate safety)
        downloads: true,
        createdAt: true,
      },
    })

    return ok(
      items.map(({ fileUrl, ...rest }) => ({
        ...rest,
        hasFile: Boolean(rest.fileName || fileUrl),
        purchased: !rest.isFree && purchasedSet.has(rest.id),
      })),
    )
  } catch (err) {
    console.error('[GET /api/suggestions]', err)
    return fail('Server error', 500)
  }
}

/** POST /api/suggestions (admin) */
export async function POST(req: Request) {
  try {
    const admin = await requireManager(req)
    if (isResponse(admin)) return admin

    const body = await parseBody(req, suggestionSchema)
    if (isResponse(body)) return body

    const title = sanitize(body.title, 150)
    if (title.length < 3) return fail('Title is invalid after sanitization', 422)
    const description = body.description ? sanitize(body.description, 2000) : null

    // Normalize inline file: strip optional data-URL prefix ("data:...;base64,").
    let fileData: string | null = null
    if (body.fileData) {
      const raw = body.fileData
      const commaIdx = raw.startsWith('data:') ? raw.indexOf(',') : -1
      fileData = commaIdx >= 0 ? raw.slice(commaIdx + 1) : raw
      if (fileData.length >= 8_000_000) {
        return fail('File too large — inline files must stay under ~6 MB', 422)
      }
    }

    // External URL: an http(s) link, OR a site-relative /uploads/ file that
    // lives in the media library (uploaded via /api/admin/upload). Relative
    // paths keep working behind any domain — unlike hardcoded absolute URLs.
    let fileUrl: string | null = null
    if (body.fileUrl) {
      const raw = body.fileUrl.trim()
      if (raw.startsWith('/uploads/')) {
        if (raw.includes('..') || raw.includes('\\') || raw.includes('//')) {
          return fail('fileUrl is not a valid site file path', 422)
        }
        fileUrl = raw
      } else {
        try {
          const u = new URL(raw)
          if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad protocol')
          fileUrl = u.toString()
        } catch {
          return fail('fileUrl must be a valid http(s) URL', 422)
        }
      }
    }

    if (!fileData && !fileUrl) {
      return fail('Provide an uploaded file (fileData) or an external fileUrl', 422)
    }

    const fileName =
      (body.fileName ? sanitize(body.fileName, 200) : '') || (fileData ? 'pathshala-material.pdf' : null)
    // If size not supplied, derive the decoded byte length of the inline file.
    const fileSize =
      body.fileSize ??
      (fileData ? Buffer.from(fileData, 'base64').length : null)

    const created = await db.suggestion.create({
      data: {
        title,
        description,
        category: body.category,
        isFree: body.isFree,
        price: body.isFree ? null : (body.price ?? null),
        fileName,
        fileType: body.fileType,
        fileSize,
        fileData,
        fileUrl,
      },
    })

    // Never echo fileData back.
    const { fileData: _omit, ...safe } = created
    return ok({ ...safe, hasFile: true })
  } catch (err) {
    console.error('[POST /api/suggestions]', err)
    return fail('Server error', 500)
  }
}

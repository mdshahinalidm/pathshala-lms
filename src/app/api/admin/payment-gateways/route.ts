/**
 * /api/admin/payment-gateways — Payment Gateway Setup.
 *
 * GET    — list every gateway (seeded on first call) with FULL config
 *          (admin-only; secrets never leave the admin surface).
 * PUT    — upsert one gateway:
 *          • built-ins: { code, mode, enabled, config, instructions,
 *            instructionsEn, logoEmoji? } — config is merged into the
 *            stored one, LIVE requires the catalog's required fields.
 *          • custom: { code?, name, logoUrl?, mode, enabled, config,
 *            instructions, instructionsEn } — creates a CUSTOM_* gateway
 *            when no code is given, updates the existing custom row
 *            otherwise. Custom gateways go LIVE through the generic
 *            integration (payment_url template or api_url JSON API).
 * DELETE — { code } — removes a CUSTOM gateway only (built-ins are part
 *          of the platform and can be switched OFF instead).
 */
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAdmin, requireOwner } from '@/lib/api-helpers'
import { ensureGatewaysSeeded, findCatalog } from '@/lib/payment-gateways'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    await ensureGatewaysSeeded()
    const gateways = await db.paymentGateway.findMany({ orderBy: { order: 'asc' } })
    return ok({ gateways })
  } catch (err) {
    console.error('[GET /api/admin/payment-gateways]', err)
    return fail('Server error', 500)
  }
}

const putSchema = z.object({
  code: z.string().min(1).max(30).optional(),
  isCustom: z.boolean().optional(),
  name: z.string().min(1).max(60).optional(),
  logoUrl: z.string().max(500).nullable().optional(),
  mode: z.enum(['LIVE', 'SANDBOX', 'OFF']).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.string().max(4000)).optional(),
  instructions: z.string().max(2000).optional(),
  instructionsEn: z.string().max(2000).optional(),
  logoEmoji: z.string().max(8).optional(),
})

export async function PUT(req: Request) {
  try {
    const admin = await requireOwner(req)
    if (isResponse(admin)) return admin

    const parsed = await parseBody(req, putSchema)
    if (isResponse(parsed)) return parsed

    // ─────────── CUSTOM gateway (create / update) ───────────
    if (parsed.isCustom || (parsed.code && parsed.code.startsWith('CUSTOM'))) {
      const code = parsed.code ?? `CUSTOM_${randomBytes(3).toString('hex').toUpperCase()}`
      const existing = await db.paymentGateway.findUnique({ where: { code } })
      if (parsed.code && (!existing || !existing.isCustom)) {
        return fail('Custom gateway not found.', 404)
      }
      const name = (parsed.name ?? existing?.name ?? '').trim()
      if (!name) return fail('Custom gateway-এর নাম আবশ্যক।', 422)

      const mergedConfig = (() => {
        const base = existing ? (safeJson(existing.config) as Record<string, string>) : {}
        return JSON.stringify({ ...base, ...(parsed.config ?? {}) })
      })()

      // Sanity: LIVE requires a live integration (payment_url or api_url).
      if ((parsed.mode ?? existing?.mode) === 'LIVE') {
        const cfg = { ...(existing ? (safeJson(existing.config) as Record<string, string>) : {}), ...(parsed.config ?? {}) }
        if (!cfg.payment_url && !cfg.api_url) {
          return fail(
            'LIVE মোডে যেতে Payment URL অথবা API এন্ডপয়েন্ট দিতে হবে।',
            422
          )
        }
        if (cfg.api_url && !cfg.api_key) {
          return fail('API এন্ডপয়েন্ট দিলে API কী আবশ্যক।', 422)
        }
      }

      const gateway = await db.paymentGateway.upsert({
        where: { code },
        update: {
          ...(parsed.name ? { name } : {}),
          ...(parsed.logoUrl !== undefined ? { logoUrl: parsed.logoUrl || null } : {}),
          ...(parsed.mode ? { mode: parsed.mode } : {}),
          ...(parsed.enabled !== undefined ? { enabled: parsed.enabled } : {}),
          ...(parsed.config ? { config: mergedConfig } : {}),
          ...(parsed.instructions !== undefined ? { instructions: parsed.instructions } : {}),
          ...(parsed.instructionsEn !== undefined ? { instructionsEn: parsed.instructionsEn } : {}),
        },
        create: {
          code,
          name,
          isCustom: true,
          logoUrl: parsed.logoUrl || null,
          mode: parsed.mode ?? 'OFF',
          enabled: parsed.enabled ?? false,
          config: parsed.config ? JSON.stringify(parsed.config) : '{}',
          instructions: parsed.instructions ?? '',
          instructionsEn: parsed.instructionsEn ?? '',
          order: 100, // custom gateways sort after the built-ins
        },
      })
      return ok({ gateway })
    }

    // ─────────── Built-in gateway ───────────
    if (!parsed.code) return fail('Gateway code is required.', 422)
    const catalog = findCatalog(parsed.code)
    if (!catalog) return fail('Unknown gateway code.', 422)

    // Sanity: LIVE requires every required field of the gateway.
    if (parsed.mode === 'LIVE') {
      const existing = await db.paymentGateway.findUnique({ where: { code: parsed.code } })
      const cfg = {
        ...(existing ? (safeJson(existing.config) as Record<string, string>) : {}),
        ...(parsed.config ?? {}),
      }
      for (const f of catalog.fields.filter((x) => x.required)) {
        if (!cfg[f.key] || String(cfg[f.key]).trim() === '') {
          return fail(
            `${f.en} (${f.bn}) is required to switch ${catalog.name} to LIVE mode.`,
            422
          )
        }
      }
    }

    const existing = await db.paymentGateway.findUnique({ where: { code: parsed.code } })
    const mergedConfig = (() => {
      const base = existing ? (safeJson(existing.config) as Record<string, string>) : {}
      return JSON.stringify({ ...base, ...(parsed.config ?? {}) })
    })()

    const gateway = await db.paymentGateway.upsert({
      where: { code: parsed.code },
      update: {
        ...(parsed.mode ? { mode: parsed.mode } : {}),
        ...(parsed.enabled !== undefined ? { enabled: parsed.enabled } : {}),
        ...(parsed.config ? { config: mergedConfig } : {}),
        ...(parsed.instructions !== undefined ? { instructions: parsed.instructions } : {}),
        ...(parsed.instructionsEn !== undefined ? { instructionsEn: parsed.instructionsEn } : {}),
        ...(parsed.logoEmoji ? { logoEmoji: parsed.logoEmoji } : {}),
      },
      create: {
        code: parsed.code,
        name: catalog.name,
        isManual: catalog.isManual,
        logoEmoji: parsed.logoEmoji ?? catalog.logoEmoji,
        mode: parsed.mode ?? 'OFF',
        enabled: parsed.enabled ?? false,
        config: parsed.config ? JSON.stringify(parsed.config) : '{}',
        instructions: parsed.instructions ?? '',
        instructionsEn: parsed.instructionsEn ?? '',
      },
    })
    return ok({ gateway })
  } catch (err) {
    console.error('[PUT /api/admin/payment-gateways]', err)
    return fail('Server error', 500)
  }
}

const deleteSchema = z.object({ code: z.string().min(1).max(30) })

export async function DELETE(req: Request) {
  try {
    const admin = await requireOwner(req)
    if (isResponse(admin)) return admin

    const parsed = await parseBody(req, deleteSchema)
    if (isResponse(parsed)) return parsed

    const existing = await db.paymentGateway.findUnique({ where: { code: parsed.code } })
    if (!existing) return fail('Gateway not found.', 404)
    if (!existing.isCustom) {
      return fail('বিল্ট-ইন গেটওয়ে ডিলিট করা যাবে না — প্রয়োজনে OFF করে দিন।', 422)
    }
    await db.paymentGateway.delete({ where: { code: parsed.code } })
    return ok({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/payment-gateways]', err)
    return fail('Server error', 500)
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s || '{}')
  } catch {
    return {}
  }
}

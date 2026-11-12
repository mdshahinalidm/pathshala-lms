/**
 * GET /api/settings — site settings.
 *  • PUBLIC (no admin session) → safe fields only (brand, contacts, social,
 *    WhatsApp widget, popup, SEO). SECRET fields (smtpPass, smtpUser,
 *    smsApiKey, invoice counters) are ALWAYS stripped.
 *  • ADMIN session → the full row (Settings panel edits SMTP/SMS/invoice).
 * The singleton row is self-healing: missing → created with model defaults.
 *
 * PUT /api/settings — ADMIN partial update; sanitizes and upserts.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, requireAdmin, requireOwner, sanitize, sanitizeHtml } from '@/lib/api-helpers'
import { validateFooterConfigJson, validateHeaderMenuJson } from '@/lib/nav-config'

const SETTINGS_ID = 'singleton'

/** Fields the public must NEVER see (credentials / internal counters). */
const SECRET_FIELDS = [
  'smtpHost',
  'smtpPort',
  'smtpSecure',
  'smtpUser',
  'smtpPass',
  'smtpFrom',
  'smsApiUrl',
  'smsApiKey',
  'smsSenderId',
  'invoicePrefix',
  'invoiceSeq',
  'invoicePad',
] as const

const settingsUpdateSchema = z
  .object({
    brandName: z.string().max(300).optional(),
    brandNameEn: z.string().max(300).optional(),
    tagline: z.string().max(300).optional(),
    taglineEn: z.string().max(300).optional(),
    marqueeText: z.string().max(300).optional(),
    supportPhone: z.string().max(300).optional(),
    supportEmail: z.string().max(300).optional(),
    address: z.string().max(1000).optional(),
    // social
    facebookUrl: z.string().max(300).optional(),
    instagramUrl: z.string().max(300).optional(),
    youtubeUrl: z.string().max(300).optional(),
    linkedinUrl: z.string().max(300).optional(),
    twitterUrl: z.string().max(300).optional(),
    tiktokUrl: z.string().max(300).optional(),
    whatsappNumber: z.string().max(60).optional(),
    whatsappEnabled: z.boolean().optional(),
    whatsappMessage: z.string().max(500).optional(),
    bkashNumber: z.string().max(60).optional(),
    nagadNumber: z.string().max(60).optional(),
    // email (SMTP)
    smtpHost: z.string().max(200).optional(),
    smtpPort: z.number().int().min(1).max(65535).optional(),
    smtpSecure: z.boolean().optional(),
    smtpUser: z.string().max(200).optional(),
    smtpPass: z.string().max(300).optional(),
    smtpFrom: z.string().max(300).optional(),
    // SMS gateway
    smsApiUrl: z.string().max(600).optional(),
    smsApiKey: z.string().max(300).optional(),
    smsSenderId: z.string().max(60).optional(),
    // invoice format
    invoicePrefix: z.string().max(40).optional(),
    invoiceSeq: z.number().int().min(1).max(1_000_000_000).optional(),
    invoicePad: z.number().int().min(1).max(8).optional(),
    invoiceNote: z.string().max(1000).optional(),
    // popup
    popupActive: z.boolean().optional(),
    popupTitle: z.string().max(200).optional(),
    popupMessage: z.string().max(2000).optional(),
    popupImageUrl: z.string().max(600).optional(),
    popupImageLink: z.string().max(600).optional(),
    popupButtonText: z.string().max(100).optional(),
    popupButtonUrl: z.string().max(600).optional(),
    // footer copyright (admin-editable; empty = default text)
    footerCopyrightBn: z.string().max(500).optional(),
    footerCopyrightEn: z.string().max(500).optional(),
    // footer columns / header menu customization — JSON blobs
    footerConfig: z.string().max(20_000).optional(),
    headerMenuConfig: z.string().max(20_000).optional(),
    // login / registration option toggles
    otpLoginEnabled: z.boolean().optional(),
    otpRegisterEnabled: z.boolean().optional(),
    // home notice bar master switch
    noticeBarEnabled: z.boolean().optional(),
    // ── Branding: logos & favicon ──
    headerLogoUrl: z.string().max(600).optional(),
    headerLogoHeight: z.number().int().min(16).max(200).optional(),
    footerLogoUrl: z.string().max(600).optional(),
    footerLogoHeight: z.number().int().min(16).max(200).optional(),
    loginLogoUrl: z.string().max(600).optional(),
    loginLogoHeight: z.number().int().min(16).max(240).optional(),
    faviconUrl: z.string().max(600).optional(),
    faviconSize: z.number().int().min(16).max(512).optional(),
    // SEO
    seoTitle: z.string().max(120).optional(),
    seoDescription: z.string().max(300).optional(),
    seoKeywords: z.string().max(300).optional(),
    // Home hero variant picker: 'classic' = 1st hero, 'circular' = 2nd (coverflow)
    heroVariant: z.enum(['classic', 'circular']).optional(),
    // Stat-strip overrides (home + about). null = auto (real counts / defaults).
    statStudents: z.number().int().min(0).max(99_999_999).nullable().optional(),
    statCourses: z.number().int().min(0).max(99_999_999).nullable().optional(),
    statHours: z.number().int().min(0).max(99_999_999).nullable().optional(),
    statReviews: z.number().int().min(0).max(99_999_999).nullable().optional(),
    // Preloader (loading screen) customization
    preloaderEnabled: z.boolean().optional(),
    preloaderText: z.string().max(120).optional(),
    preloaderLogoUrl: z.string().max(600).optional(),
    // SEO verification & analytics
    googleSiteVerification: z.string().max(120).optional(),
    bingSiteVerification: z.string().max(120).optional(),
    gaMeasurementId: z.string().max(60).optional(),
    // Custom CSS / custom code — raw admin-authored snippets saved
    // verbatim (see the PUT special-case); only length-capped here.
    customCss: z.string().max(100_000).optional(),
    customCode: z.string().max(100_000).optional(),
  })
  .partial()

/** String-field sanitization caps; boolean/number fields skip sanitize(). */
const STRING_FIELD_MAX: Record<string, number> = {
  address: 1000,
  invoiceNote: 1000,
  seoTitle: 120,
  seoDescription: 300,
  seoKeywords: 300,
  whatsappMessage: 500,
  footerCopyrightBn: 500,
  footerCopyrightEn: 500,
  footerConfig: 20_000,
  headerMenuConfig: 20_000,
  popupTitle: 200,
  popupMessage: 2000,
  popupImageUrl: 600,
  popupImageLink: 600,
  popupButtonUrl: 600,
  smsApiUrl: 600,
  headerLogoUrl: 600,
  footerLogoUrl: 600,
  loginLogoUrl: 600,
  faviconUrl: 600,
  preloaderLogoUrl: 600,
  preloaderText: 120,
  googleSiteVerification: 120,
  bingSiteVerification: 120,
  gaMeasurementId: 60,
  customCss: 100_000,
  customCode: 100_000,
}

// ───────────────────────────────── GET ─────────────────────────────────

/** Strip credential/internal fields from a settings row. */
function stripSecrets<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row }
  for (const f of SECRET_FIELDS) delete out[f]
  return out
}

/** GET /api/settings — public-safe (full row for an admin session). */
export async function GET(req: Request) {
  try {
    const settings = await db.siteSetting.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    })
    const admin = await requireAdmin(req).catch(() => null)
    if (admin && !isResponse(admin)) return ok(settings)
    return ok(stripSecrets(settings as unknown as Record<string, unknown>))
  } catch (err) {
    console.error('[GET /api/settings]', err)
    return fail('Server error', 500)
  }
}

// ───────────────────────────────── PUT ─────────────────────────────────

/** PUT /api/settings (owner) */
export async function PUT(req: Request) {
  try {
    const admin = await requireOwner(req)
    if (isResponse(admin)) return admin

    const parsed = await parseBody(req, settingsUpdateSchema)
    if (isResponse(parsed)) return parsed

    const data: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (value === undefined) continue
      if (typeof value === 'string') {
        // Admin-authored CODE fields: preserve benign markup
        // (e.g. the copyright <a> links) while stripping dangerous HTML.
        if (key === 'footerCopyrightBn' || key === 'footerCopyrightEn') {
          data[key] = sanitizeHtml(value, STRING_FIELD_MAX[key] ?? 500)
          continue
        }
        // custom CSS / custom code: RAW by design. This feature
        // exists so the owner can inject <style>/<script> snippets (pixels,
        // widgets, theme overrides); sanitize()/sanitizeHtml() would strip
        // exactly the tags it exists to inject, so the value is preserved
        // verbatim and only length-capped (owner-only endpoint).
        if (key === 'customCss' || key === 'customCode') {
          data[key] = value.slice(0, STRING_FIELD_MAX[key] ?? 100_000)
          continue
        }
        // Footer / header customization JSON: validate + normalize. Empty
        // string clears the override (built-in defaults render again); a
        // malformed non-empty blob is rejected instead of breaking the site.
        if (key === 'footerConfig' || key === 'headerMenuConfig') {
          const raw = value.trim()
          if (raw === '') {
            data[key] = ''
            continue
          }
          const normalized = key === 'footerConfig' ? validateFooterConfigJson(raw) : validateHeaderMenuJson(raw)
          if (!normalized) {
            return fail(
              key === 'footerConfig'
                ? 'ফুটার কনফিগারেশন সঠিক নয় — আবার চেষ্টা করুন। (Invalid footer configuration)'
                : 'হেডার মেনু কনফিগারেশন সঠিক নয় — আবার চেষ্টা করুন। (Invalid header menu configuration)',
              422,
            )
          }
          data[key] = normalized
          continue
        }
        data[key] = sanitize(value, STRING_FIELD_MAX[key] ?? 300)
      } else {
        data[key] = value // booleans / numbers pass through (zod-validated)
      }
    }

    const settings = await db.siteSetting.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...data },
    })
    return ok(settings)
  } catch (err) {
    console.error('[PUT /api/settings]', err)
    return fail('Server error', 500)
  }
}

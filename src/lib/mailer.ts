/**
 * mailer.ts — REAL SMTP email delivery for OTP / notifications.
 *
 * Credentials come from the admin panel (SiteSetting.smtp*) and are stored
 * server-side only — they NEVER reach the browser (the public /api/settings
 * route strips secret fields). Environment variables act as a fallback so
 * the platform can also be configured without the admin panel:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * When nothing is configured, `sendEmail` returns { ok:false, reason:'not_configured' }
 * and callers fall back to demo mode (devOtp) — the OTP system still works
 * end-to-end without a provider, but real mail is sent the moment the admin
 * saves valid SMTP settings.
 */
import nodemailer from 'nodemailer'
import { db } from '@/lib/db'

export interface MailResult {
  ok: boolean
  reason?: 'not_configured' | 'send_failed'
  error?: string
}

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

/** Read SMTP config from DB (admin panel) with env-var fallback. */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  let host = process.env.SMTP_HOST ?? ''
  let port = Number(process.env.SMTP_PORT ?? 587)
  let secure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1'
  let user = process.env.SMTP_USER ?? ''
  let pass = process.env.SMTP_PASS ?? ''
  let from = process.env.SMTP_FROM ?? ''

  try {
    const s = await db.siteSetting.findUnique({ where: { id: 'singleton' } })
    if (s && s.smtpHost.trim()) {
      host = s.smtpHost.trim()
      port = s.smtpPort > 0 ? s.smtpPort : 587
      secure = s.smtpSecure
      user = s.smtpUser.trim() || user
      pass = s.smtpPass || pass
      from = s.smtpFrom.trim() || from
    }
  } catch {
    /* DB unavailable — env fallback already loaded */
  }

  if (!host || !user || !pass) return null
  return { host, port, secure, user, pass, from: from || `PathShala <${user}>` }
}

/** Send an email through the configured SMTP server. */
export async function sendEmail(opts: { to: string; subject: string; html: string; text?: string }): Promise<MailResult> {
  const cfg = await getSmtpConfig()
  if (!cfg) return { ok: false, reason: 'not_configured' }

  try {
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    })
    await transport.sendMail({
      from: cfg.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    })
    return { ok: true }
  } catch (err) {
    console.error('[mailer] send failed:', err instanceof Error ? err.message : err)
    return { ok: false, reason: 'send_failed', error: err instanceof Error ? err.message : String(err) }
  }
}

/** Branded bilingual OTP email. */
export function otpEmailHtml(code: string, name?: string): { subject: string; html: string; text: string } {
  const greeting = name ? `প্রিয় ${name},` : 'স্বাগতম!'
  return {
    subject: `PathShala ভেরিফিকেশন কোড: ${code}`,
    text: `Your PathShala verification code is ${code}. It expires in 10 minutes.`,
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#f4f7f6;font-family:'Noto Sans Bengali',Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="background:linear-gradient(135deg,#059669,#0d9488,#8b5cf6);border-radius:20px 20px 0 0;padding:28px;text-align:center;">
      <h1 style="color:#ffffff;font-size:22px;margin:0;">পাঠশালা | PathShala</h1>
      <p style="color:rgba(255,255,255,.85);font-size:13px;margin:6px 0 0;">Email Verification</p>
    </div>
    <div style="background:#ffffff;border-radius:0 0 20px 20px;padding:32px 28px;box-shadow:0 8px 24px rgba(0,0,0,.06);">
      <p style="font-size:15px;color:#111;${'margin:0 0 12px;'}">${greeting}</p>
      <p style="font-size:14px;color:#444;margin:0 0 18px;">আপনার ইমেইল ভেরিফিকেশন কোড নিচে দেওয়া হলো / Your verification code is below:</p>
      <div style="text-align:center;margin:0 0 18px;">
        <span style="display:inline-block;background:#ecfdf5;border:2px dashed #10b981;color:#065f46;font-size:34px;font-weight:800;letter-spacing:10px;padding:14px 28px;border-radius:14px;">${code}</span>
      </div>
      <p style="font-size:13px;color:#666;margin:0 0 6px;">⏳ কোডটি <b>১০ মিনিট</b> পর্যন্ত বৈধ থাকবে (expires in 10 minutes)।</p>
      <p style="font-size:13px;color:#666;margin:0;">🔒 কোডটি কারও সাথে শেয়ার করবেন না — PathShala কখনো আপনার কোড চায় না।</p>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:11px;margin:16px 0 0;">© ${new Date().getFullYear()} PathShala — অনলাইন লার্নিং প্ল্যাটফর্ম</p>
  </div>
</body></html>`,
  }
}

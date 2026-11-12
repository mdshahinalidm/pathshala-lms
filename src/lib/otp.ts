/**
 * otp.ts — ONE shared OTP issuance path for the whole platform.
 * Generates a crypto-random 6-digit code, persists it (OtpToken) and delivers
 * it through the REAL channel configured by the admin:
 *   • identifier looks like an email → SMTP email (mailer.ts)
 *   • identifier looks like a BD phone → HTTP SMS gateway (sms-gateway.ts)
 *
 * Demo fallback: when the matching provider is NOT configured the code is
 * returned as `devCode` so the sandbox UI can complete verification — the
 * moment the admin saves real SMTP/SMS settings, real mail/SMS goes out and
 * devCode is no longer returned.
 */
import { db } from '@/lib/db'
import { sendEmail, otpEmailHtml } from '@/lib/mailer'
import { sendSms } from '@/lib/sms-gateway'

export const OTP_TTL_MS = 10 * 60 * 1000
export const MAX_OTP_ATTEMPTS = 5

export function isEmail(identifier: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)
}

/** Cryptographically random 6-digit OTP (crypto.getRandomValues, not Math.random). */
export function generateOtpCode(): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return String(buf[0] % 1_000_000).padStart(6, '0')
}

export interface IssueOtpResult {
  identifier: string
  channel: 'EMAIL' | 'SMS'
  delivered: boolean // real provider send succeeded
  devCode?: string // only when the channel is not configured (demo mode)
}

/**
 * Invalidate previous unconsumed tokens for this identifier and issue a new
 * one (resend-safe). Delivers through the real provider when configured.
 * `meta` optionally carries the pending-flow payload (e.g. phone-OTP
 * registration data) persisted on the OtpToken row for the verify step.
 */
export async function issueOtp(identifier: string, name?: string, meta?: string): Promise<IssueOtpResult> {
  const code = generateOtpCode()
  await db.otpToken.updateMany({ where: { identifier, consumed: false }, data: { consumed: true } })
  await db.otpToken.create({
    data: { identifier, code, expiresAt: new Date(Date.now() + OTP_TTL_MS), ...(meta ? { meta } : {}) },
  })

  if (isEmail(identifier)) {
    const mail = otpEmailHtml(code, name)
    const res = await sendEmail({ to: identifier, subject: mail.subject, html: mail.html, text: mail.text })
    if (res.ok) return { identifier, channel: 'EMAIL', delivered: true }
    // not configured → demo mode; hard provider failure → still allow demo in dev
    return { identifier, channel: 'EMAIL', delivered: false, devCode: res.reason === 'not_configured' ? code : undefined }
  }

  const res = await sendSms({ to: identifier, text: `PathShala ভেরিফিকেশন কোড: ${code} (১০ মিনিট বৈধ) — pathshala.com` })
  if (res.ok) return { identifier, channel: 'SMS', delivered: true }
  return { identifier, channel: 'SMS', delivered: false, devCode: res.reason === 'not_configured' ? code : undefined }
}

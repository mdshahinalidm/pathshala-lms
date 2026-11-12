/**
 * sms-gateway.ts — REAL SMS delivery through a generic HTTP gateway.
 *
 * Bangladeshi providers (SSL Wireless, BulkSMSBD, MSMS, Telitalk…) all expose
 * a simple HTTP endpoint. The admin pastes THEIR provider's endpoint + key in
 * the admin panel (SiteSetting.sms*) and we merge it into a URL with standard
 * placeholders — no code change per provider:
 *
 *   {phone}   → recipient (01XXXXXXXXX)
 *   {message} → url-encoded text
 *   {token}   → smsApiKey
 *   {sender}  → smsSenderId
 *
 * Example (BulkSMSBD):  http://bulksmsbd.net/api/smsapi?api_key={token}&type=text&number={phone}&senderid={sender}&message={message}
 * Example (SSL Wireless): https://smsplus.sslwireless.com/api/v3/send-sms?api_token={token}&sid={sender}&msisdn={phone}&sms={message}&csmsid=1
 *
 * Env fallback: SMS_API_URL, SMS_API_KEY, SMS_SENDER_ID.
 * Not configured → { ok:false, reason:'not_configured' } (callers fall back
 * to demo mode). Credentials never leave the server.
 */
import { db } from '@/lib/db'

export interface SmsResult {
  ok: boolean
  reason?: 'not_configured' | 'send_failed'
  error?: string
}

interface SmsConfig {
  apiUrl: string
  apiKey: string
  senderId: string
}

export async function getSmsConfig(): Promise<SmsConfig | null> {
  let apiUrl = process.env.SMS_API_URL ?? ''
  let apiKey = process.env.SMS_API_KEY ?? ''
  let senderId = process.env.SMS_SENDER_ID ?? ''

  try {
    const s = await db.siteSetting.findUnique({ where: { id: 'singleton' } })
    if (s && s.smsApiUrl.trim()) {
      apiUrl = s.smsApiUrl.trim()
      apiKey = s.smsApiKey.trim() || apiKey
      senderId = s.smsSenderId.trim() || senderId
    }
  } catch {
    /* DB unavailable — env fallback already loaded */
  }

  if (!apiUrl || !apiKey) return null
  return { apiUrl, apiKey, senderId }
}

/** Send an SMS through the configured HTTP gateway. */
export async function sendSms(opts: { to: string; text: string }): Promise<SmsResult> {
  const cfg = await getSmsConfig()
  if (!cfg) return { ok: false, reason: 'not_configured' }

  try {
    const url = cfg.apiUrl
      .replace('{phone}', encodeURIComponent(opts.to))
      .replace('{message}', encodeURIComponent(opts.text))
      .replace('{token}', encodeURIComponent(cfg.apiKey))
      .replace('{sender}', encodeURIComponent(cfg.senderId))
      .replace('{apikey}', encodeURIComponent(cfg.apiKey))
      .replace('{msisdn}', encodeURIComponent(opts.to))
      .replace('{sms}', encodeURIComponent(opts.text))
      .replace('{sid}', encodeURIComponent(cfg.senderId))

    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(15_000) })
    if (!res.ok) {
      return { ok: false, reason: 'send_failed', error: `HTTP ${res.status}` }
    }
    const body = (await res.text()).slice(0, 300)
    // Most BD gateways answer 200 with "SMS SUBMITTED" / "202" / "OK" style bodies.
    // A 200 with an explicit failure body is treated as failed (best-effort).
    const failed = /error|failed|invalid|unauthorized|insufficient/i.test(body) && !/submit|success|ok|queued|202/i.test(body)
    if (failed) return { ok: false, reason: 'send_failed', error: body }
    return { ok: true }
  } catch (err) {
    console.error('[sms] send failed:', err instanceof Error ? err.message : err)
    return { ok: false, reason: 'send_failed', error: err instanceof Error ? err.message : String(err) }
  }
}

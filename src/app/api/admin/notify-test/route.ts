/**
 * POST /api/admin/notify-test (ADMIN)
 * Sends a test email / test SMS through the SAVED SMTP / SMS-gateway
 * settings. On failure the REAL provider error message is returned
 * (HTTP 502) so the admin sees exactly what to fix.
 */
import { z } from 'zod'
import { fail, isResponse, ok, parseBody, requireOwner, rateLimit } from '@/lib/api-helpers'
import { sendEmail } from '@/lib/mailer'
import { sendSms } from '@/lib/sms-gateway'

const schema = z.object({
  channel: z.enum(['email', 'sms']),
  to: z.string().trim().min(3, 'Recipient required').max(120),
  message: z.string().trim().max(300).optional(),
})

/** Simple branded card for the test email. */
function testEmailHtml(): string {
  return `<!doctype html>
<html lang="bn"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px 12px;background:#f6f7f9;font-family:'Segoe UI','Noto Sans Bengali',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.08);">
    <tr><td style="background:linear-gradient(135deg,#059669 0%,#10b981 55%,#f59e0b 130%);padding:26px 24px;text-align:center;">
      <div style="font-size:24px;font-weight:800;color:#fff;">পাঠশালা</div>
      <div style="font-size:12px;color:rgba(255,255,255,.85);margin-top:2px;">PathShala</div>
    </td></tr>
    <tr><td style="padding:30px 26px;text-align:center;">
      <div style="font-size:34px;">✅</div>
      <h1 style="margin:8px 0 6px;font-size:19px;color:#111827;">টেস্ট সফল হয়েছে!</h1>
      <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">
        আপনার SMTP সেটআপ সঠিকভাবে কাজ করছে —<br/>পাঠশালা এখন এই কানেকশন দিয়ে ইমেইল পাঠাতে পারবে।
      </p>
    </td></tr>
  </table>
</body></html>`
}

export async function POST(req: Request) {
  try {
    const admin = await requireOwner(req)
    if (isResponse(admin)) return admin

    const limited = rateLimit(req, 'admin-notify-test', 10, 60_000)
    if (limited) return limited

    const parsed = await parseBody(req, schema)
    if (isResponse(parsed)) return parsed

    if (parsed.channel === 'email') {
      const custom = parsed.message?.trim()
      // Basic HTML-escape for the custom note (owner input, still be safe).
      const safeCustom = custom
        ?.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      const result = await sendEmail({
        to: parsed.to,
        subject: 'PathShala — টেস্ট ইমেইল',
        text:
          custom ||
          'পাঠশালা টেস্ট ইমেইল — আপনার SMTP সেটআপ সফলভাবে কাজ করছে! ✅ (PathShala test email — your SMTP setup works!)',
        html: safeCustom
          ? `<p style="font-family:Arial,sans-serif;font-size:14px;color:#111827;">${safeCustom}</p>`
          : testEmailHtml(),
      })
      if (!result.ok) {
        return fail(result.error || 'ইমেইল পাঠানো যায়নি (Email delivery failed)', 502)
      }
      return ok({ sent: true, channel: 'email', to: parsed.to })
    }

    const result = await sendSms({
      to: parsed.to,
      text: parsed.message?.trim() || 'পাঠশালা টেস্ট SMS — সেটআপ সফল!',
    })
    if (!result.ok) {
      return fail(result.error || 'SMS পাঠানো যায়নি (SMS delivery failed)', 502)
    }
    return ok({ sent: true, channel: 'sms', to: parsed.to })
  } catch (err) {
    // Surface the real provider/config error to the admin.
    const message =
      err instanceof Error ? err.message : 'টেস্ট পাঠানো যায়নি (Test delivery failed)'
    console.error('[POST /api/admin/notify-test]', err)
    return fail(message, 502)
  }
}

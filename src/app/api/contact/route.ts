/**
 * POST /api/contact — public contact form (rate limited 4/min).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, isResponse, ok, parseBody, rateLimit, sanitize } from '@/lib/api-helpers'

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().email('Invalid email address').max(120),
  phone: z.string().max(20).optional(),
  subject: z.string().max(120).optional(),
  message: z.string().min(10, 'Message must be at least 10 characters').max(2000),
})

export async function POST(req: Request) {
  try {
    const limited = rateLimit(req, 'contact', 4, 60_000)
    if (limited) return limited

    const parsed = await parseBody(req, contactSchema)
    if (isResponse(parsed)) return parsed

    const name = sanitize(parsed.name, 80)
    const email = sanitize(parsed.email, 120).toLowerCase()
    const message = sanitize(parsed.message, 2000)
    if (name.length < 2) return fail('Name must be at least 2 characters', 422)
    if (message.length < 10) return fail('Message must be at least 10 characters', 422)

    await db.contactMessage.create({
      data: {
        name,
        email,
        phone: parsed.phone ? sanitize(parsed.phone, 20) : null,
        subject: parsed.subject ? sanitize(parsed.subject, 120) : null,
        message,
      },
    })
    return ok({ received: true })
  } catch (err) {
    console.error('[POST /api/contact]', err)
    return fail('Server error', 500)
  }
}

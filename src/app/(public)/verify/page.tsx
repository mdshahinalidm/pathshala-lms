import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BadgeCheck, GraduationCap } from 'lucide-react'
import { serverOrigin } from '@/lib/site-origin'

export const metadata: Metadata = {
  title: 'সার্টিফিকেট যাচাই | Verify Certificate',
  description:
    'পাঠশালা সার্টিফিকেটের সিরিয়াল নম্বর দিয়ে সনদের সত্যতা যাচাই করুন। Verify the authenticity of any PathShala certificate by its serial number.',
  alternates: { canonical: '/verify' },
}

/**
 * /verify — certificate verification landing page.
 * /verify/<serial> renders the verification RESULT; this page lets people
 * type/paste a serial (native GET form), so a bare /verify never dead-ends
 * in a 404. ?serial=… is redirected to the result page server-side.
 */
export default async function VerifyLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ serial?: string }>
}) {
  const { serial } = await searchParams
  const trimmed = serial?.trim().toUpperCase()

  if (trimmed) redirect(`/verify/${encodeURIComponent(trimmed)}`)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'সার্টিফিকেট যাচাই | Verify Certificate',
    // origin follows the actual request host (any domain auto-sync).
    url: `${await serverOrigin()}/verify`,
    description: 'PathShala certificate verification portal.',
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-3.5 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex flex-col items-center rounded-3xl border bg-card px-6 py-14 text-center shadow-sm">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <GraduationCap className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
          সার্টিফিকেট যাচাই করুন
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          সনদের নিচে থাকা সিরিয়াল নম্বরটি এখানে লিখুন — সত্যতা যাচাই করে ফলাফল দেখানো হবে।
          <span className="mt-1 block">
            Enter the serial printed on the certificate to verify its authenticity.
          </span>
        </p>

        <form action="/verify" method="GET" className="mt-8 w-full max-w-md" role="search">
          <label htmlFor="serial" className="mb-2 block text-start text-sm font-medium">
            সার্টিফিকেট সিরিয়াল নম্বর{' '}
            <span className="text-muted-foreground">(Certificate serial)</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="serial"
              name="serial"
              required
              placeholder="PS-CERT-XXXXXX"
              aria-label="Certificate serial number"
              className="h-11 flex-1 rounded-xl border bg-card px-4 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <BadgeCheck className="h-4 w-4" aria-hidden />
              যাচাই করুন
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

/**
 * PUBLIC certificate verification page — /verify/<serial>
 * Self-contained SERVER component: looks the serial up straight from the DB
 * (no client JS needed) and renders a verified / not-found state.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, GraduationCap, XCircle } from 'lucide-react'
import { db } from '@/lib/db'

interface Props {
  params: Promise<{ serial: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { serial } = await params
  return { title: `সার্টিফিকেট যাচাই ${serial} | Verify Certificate` }
}

function bnDate(d: Date): string {
  return d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function VerifyCertificatePage({ params }: Props) {
  const { serial } = await params

  const certificate = await db.certificate.findUnique({
    where: { serial: decodeURIComponent(serial).toUpperCase() },
    include: { course: { select: { title: true, slug: true } } },
  })

  if (!certificate) {
    return (
      <div className="mx-auto w-full max-w-lg px-3.5 py-16">
        <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-destructive/40 bg-card px-6 py-14 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-9 w-9 text-destructive" aria-hidden />
          </span>
          <h1 className="text-xl font-bold sm:text-2xl">
            সার্টিফিকেট পাওয়া যায়নি
          </h1>
          <p className="text-sm text-muted-foreground">
            Invalid certificate — this serial does not exist.
          </p>
          <code className="rounded bg-muted px-2 py-1 text-xs font-bold">{decodeURIComponent(serial).toUpperCase()}</code>
          <div className="mt-2 flex flex-col items-center gap-1 sm:flex-row sm:gap-3">
            <Link
              href="/"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              ← পাঠশালা হোমপেজ | Back to PathShala
            </Link>
            <Link
              href="/verify"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              অন্য সিরিয়াল যাচাই করুন | Verify another serial
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const issued = bnDate(new Date(certificate.issuedAt))

  return (
    <div className="mx-auto w-full max-w-2xl px-3.5 py-10 sm:py-16">
      {/* Verification banner */}
      <div className="mb-5 flex items-center justify-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
        <CheckCircle2 className="h-5 w-5" aria-hidden />
        সত্যায়িত ✓ Verified
      </div>

      {/* Certificate */}
      <div className="rounded-2xl border-[3px] border-primary bg-white p-2 shadow-sm dark:bg-card">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-primary/40 px-6 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow">
            <GraduationCap className="h-7 w-7" aria-hidden />
          </span>
          <p className="text-lg font-bold text-primary">পাঠশালা PathShala</p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            সার্টিফিকেট অব কমপ্লিশন · CERTIFICATE OF COMPLETION
          </p>
          <p className="font-serif text-3xl font-bold text-foreground">{certificate.studentName}</p>
          <div className="h-px w-36 bg-primary/30" aria-hidden />
          <p className="text-xs text-muted-foreground">সফলভাবে সম্পন্ন করেছেন · has successfully completed</p>
          <p className="max-w-md text-lg font-semibold leading-snug">{certificate.courseTitle}</p>

          <div className="mt-4 grid w-full max-w-md gap-1 rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">ইস্যুর তারিখ · Issued:</span> {issued}
            </p>
            <p>
              <span className="font-medium text-foreground">সিরিয়াল · Serial:</span>{' '}
              <code className="font-bold">{certificate.serial}</code>
            </p>
            <p>
              <span className="font-medium text-foreground">কোর্স · Course:</span> {certificate.courseTitle}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        এই সার্টিফিকেটটি পাঠশালা কর্তৃক ইস্যুকৃত ও সত্যায়িত। ·
        This certificate is issued and verified by PathShala.
      </p>
      <div className="mt-6 text-center">
        <Link
          href="/courses"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          কোর্স দেখুন | Browse courses →
        </Link>
      </div>
    </div>
  )
}

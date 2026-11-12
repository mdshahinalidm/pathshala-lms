'use client'

/**
 * CertificatesView (student) — completion certificates with an elegant
 * double-bordered design and a Download/Print action that opens a
 * self-contained printable HTML in a new window (auto window.print()).
 * API: GET /api/certificates (own certificates).
 */

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Award, Download, GraduationCap, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { apiGet } from '@/lib/api-client'
import { digitsBn, fmtDate } from '@/lib/format'
import { go, useUI } from '@/store/ui-store'

interface CertificateRow {
  id: string
  serial: string
  studentName: string
  courseTitle: string
  issuedAt: string
  course: { id: string; title: string; slug: string } | null
}

/** Escape a string for safe interpolation into the printable HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildCertificateHtml(cert: CertificateRow, lang: 'bn' | 'en'): string {
  const issued = new Date(cert.issuedAt).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const verifyUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/verify/${cert.serial}` : `/verify/${cert.serial}`
  const bn = lang === 'bn'
  return `<!DOCTYPE html>
<html lang="${bn ? 'bn' : 'en'}">
<head>
<meta charset="utf-8" />
<title>${esc(bn ? `সার্টিফিকেট — ${cert.studentName}` : `Certificate — ${cert.studentName}`)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Noto Sans Bengali', 'Hind Siliguri', 'Segoe UI', serif; background: #f3f4f6; display: flex; justify-content: center; padding: 24px; }
  .sheet { width: 100%; max-width: 900px; background: #ffffff; border: 3px solid #0e7a5f; padding: 10px; }
  .inner { border: 1px solid #0e7a5f; padding: 48px 40px; text-align: center; position: relative; }
  .brand { display: flex; align-items: center; justify-content: center; gap: 10px; }
  .logo { width: 44px; height: 44px; border-radius: 12px; background: #0e7a5f; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 24px; }
  .brand-name { font-size: 22px; font-weight: 700; color: #0e7a5f; }
  .title { margin-top: 34px; font-size: 15px; letter-spacing: 4px; text-transform: uppercase; color: #6b7280; }
  .title-bn { margin-top: 8px; font-size: 34px; font-weight: 700; color: #111827; }
  .title-en { margin-top: 4px; font-size: 16px; color: #6b7280; letter-spacing: 2px; }
  .name { margin-top: 36px; font-family: Georgia, 'Times New Roman', serif; font-size: 40px; font-weight: 700; color: #0e7a5f; }
  .line { width: 220px; height: 2px; background: #0e7a5f33; margin: 14px auto 0; }
  .course-label { margin-top: 30px; font-size: 13px; color: #6b7280; }
  .course { margin-top: 8px; font-size: 24px; font-weight: 700; color: #111827; }
  .footer { margin-top: 48px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; color: #6b7280; }
  .serial { font-family: monospace; font-weight: 700; color: #111827; }
  .seal { border: 2px solid #0e7a5f; border-radius: 9999px; padding: 8px 16px; color: #0e7a5f; font-weight: 700; font-size: 12px; }
  @media print { body { padding: 0; background: #fff; } .sheet { border-color: #0e7a5f; } }
</style>
</head>
<body>
  <div class="sheet">
    <div class="inner">
      <div class="brand">
        <div class="logo">🎓</div>
        <div class="brand-name">পাঠশালা PathShala</div>
      </div>
      <div class="title">${bn ? 'সার্টিফিকেট অব কমপ্লিশন' : 'CERTIFICATE OF COMPLETION'}</div>
      <div class="title-en">${bn ? 'Certificate of Completion' : 'সার্টিফিকেট অব কমপ্লিশন'}</div>
      <p class="name">${esc(cert.studentName)}</p>
      <div class="line"></div>
      <p class="course-label">${bn ? 'সফলভাবে সম্পন্ন করেছেন' : 'has successfully completed'}</p>
      <p class="course">${esc(cert.courseTitle)}</p>
      <div class="footer">
        <div>
          <div>${bn ? 'ইস্যুর তারিখ' : 'Issued on'}: ${esc(issued)}</div>
          <div style="margin-top:4px">${bn ? 'সিরিয়াল' : 'Serial'}: <span class="serial">${esc(cert.serial)}</span></div>
          <div style="margin-top:4px">${bn ? 'যাচাই করুন' : 'Verify at'}: ${esc(verifyUrl)}</div>
        </div>
        <div class="seal">✓ ${bn ? 'পাঠশালা সিল' : 'PathShala Seal'}</div>
      </div>
    </div>
  </div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };</script>
</body>
</html>`
}

export default function CertificatesView() {
  const { tx, lang, t } = useUI()

  const [certs, setCerts] = useState<CertificateRow[] | null>(null)
  const [error, setError] = useState(false)

  const num = (n: number | string) => (lang === 'bn' ? digitsBn(n) : String(n))

  const load = useCallback(async () => {
    setError(false)
    try {
      const data = await apiGet<CertificateRow[]>('/api/certificates')
      setCerts(data)
    } catch (e) {
      setError(true)
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    }
  }, [tx])

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [load])

  // Non-null list for the loaded state (TS can't narrow through the compound ternary below).
  const list = certs ?? []

  function printCertificate(cert: CertificateRow) {
    const win = window.open('', '_blank', 'width=940,height=720')
    if (!win) {
      toast.error(tx('প্রিন্ট উইন্ডো খোলা যায়নি — পপআপ ব্লকার চেক করুন', 'Could not open the print window — check your popup blocker'))
      return
    }
    win.document.open()
    win.document.write(buildCertificateHtml(cert, lang))
    win.document.close()
    win.focus()
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">{tx('আমার সার্টিফিকেট', 'My Certificates')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tx(
            'কোর্স ১০০% সম্পন্ন করলেই সার্টিফিকেট স্বয়ংক্রিয়ভাবে এখানে যোগ হয়।',
            'Finish a course at 100% and your certificate appears here automatically.'
          )}
        </p>
      </div>

      {certs === null && !error ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<Award className="h-7 w-7" />}
          title={t('error')}
          description={tx('সার্টিফিকেট লোড করা যায়নি।', 'Could not load certificates.')}
          actionLabel={t('retry')}
          onAction={() => void load()}
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Award className="h-7 w-7" />}
          title={tx('এখনো কোনো সার্টিফিকেট নেই', 'No certificates yet')}
          description={tx(
            'কোর্সের সব লেসন শেষ করুন — প্রথম সার্টিফিকেট আপনার অপেক্ষায়!',
            'Complete all lessons of a course — your first certificate awaits!'
          )}
          actionLabel={tx('কোর্স দেখুন', 'Browse courses')}
          onAction={() => go('#/courses')}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((cert, i) => (
            <motion.div
              key={cert.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.3 }}
            >
              <div className="relative overflow-hidden rounded-2xl border-2 border-primary/70 bg-white p-2 shadow-sm dark:bg-card">
                <span aria-hidden className="grad-amber absolute inset-x-0 top-0 z-10 h-1" />
                <div className="relative flex h-full flex-col items-center gap-3 overflow-hidden rounded-xl border border-primary/40 px-5 py-8 text-center">
                  {/* Colorful 2.0 — amber achievement seal */}
                  <span
                    aria-hidden
                    className="grad-amber absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md"
                  >
                    <Award className="h-5 w-5" />
                  </span>
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow">
                    <GraduationCap className="h-7 w-7" />
                  </span>
                  <p className="text-lg font-bold text-primary">পাঠশালা PathShala</p>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    {tx('সার্টিফিকেট অব কমপ্লিশন', 'Certificate of Completion')}
                  </p>
                  <p className="font-serif text-2xl font-bold text-foreground sm:text-3xl">
                    {cert.studentName}
                  </p>
                  <div className="h-px w-32 bg-primary/30" />
                  <p className="text-xs text-muted-foreground">{tx('সফলভাবে সম্পন্ন করেছেন', 'has successfully completed')}</p>
                  <p className="max-w-md font-semibold leading-snug">{cert.courseTitle}</p>
                  <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{fmtDate(cert.issuedAt, lang)}</span>
                    <span aria-hidden>·</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-bold">{cert.serial}</code>
                  </div>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <ShieldCheck className="h-3 w-3 text-emerald-600" />
                    {tx(`যাচাই: /verify/${cert.serial}`, `Verify at /verify/${cert.serial}`)}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 gap-1.5"
                    onClick={() => printCertificate(cert)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {tx('ডাউনলোড / প্রিন্ট', 'Download / Print')}
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
          <p className="col-span-full text-center text-xs text-muted-foreground">
            {tx(
              `মোট ${num(list.length)}টি সার্টিফিকেট অর্জিত হয়েছে`,
              `${num(list.length)} certificate(s) earned`
            )}
          </p>
        </div>
      )}
    </div>
  )
}

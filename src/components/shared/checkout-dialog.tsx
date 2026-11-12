'use client'

/**
 * CheckoutDialog — paid course purchase flow.
 * Steps: summary (method picker) → simulated gateway → success / failed.
 * Uses demo gateway screen (production would redirect to SSLCommerz/bKash callback).
 */

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Smartphone,
  Wallet,
  ShieldCheck,
  CreditCard,
  CheckCircle2,
  Loader2,
  GraduationCap,
  AlertTriangle,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiPost } from '@/lib/api-client'
import { fmtBDT } from '@/lib/format'

export interface CheckoutCourse {
  id: string
  title: string
  slug?: string
  price: number
  discountPrice?: number | null
  thumbnail?: string | null
}

type PayMethod = 'BKASH' | 'NAGAD' | 'SSLCOMMERZ' | 'STRIPE'
type Step = 'summary' | 'gateway' | 'success' | 'failed' | 'enrolled'

interface OrderResult {
  order: { id: string; trxId: string; method?: string }
  amount: number
  courseTitle?: string
}

const METHODS: { value: PayMethod; label: string; sub: string; icon: typeof Smartphone; color: string; ring: string }[] = [
  {
    value: 'BKASH',
    label: 'bKash',
    sub: 'মোবাইল ব্যাংকিং',
    icon: Smartphone,
    color: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
    ring: 'border-rose-500 ring-2 ring-rose-500/30',
  },
  {
    value: 'NAGAD',
    label: 'Nagad',
    sub: 'মোবাইল ব্যাংকিং',
    icon: Wallet,
    color: 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300',
    ring: 'border-orange-500 ring-2 ring-orange-500/30',
  },
  {
    value: 'SSLCOMMERZ',
    label: 'SSLCommerz',
    sub: 'কার্ড / ব্যাংক',
    icon: ShieldCheck,
    color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    ring: 'border-emerald-500 ring-2 ring-emerald-500/30',
  },
  {
    value: 'STRIPE',
    label: 'Stripe',
    sub: 'আন্তর্জাতিক কার্ড',
    icon: CreditCard,
    color: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
    ring: 'border-violet-500 ring-2 ring-violet-500/30',
  },
]

export function CheckoutDialog({
  open,
  onOpenChange,
  course,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  course: CheckoutCourse
}) {
  const { t, tx, lang } = useUI()
  const user = useAuth((s) => s.user)
  const [step, setStep] = useState<Step>('summary')
  const [method, setMethod] = useState<PayMethod>('BKASH')
  const [order, setOrder] = useState<OrderResult | null>(null)
  const [processing, setProcessing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const effective = course.discountPrice ?? course.price

  // Auth guard when dialog opens
  useEffect(() => {
    if (!open) return
    setStep('summary')
    setOrder(null)
    setErrMsg('')
    setProcessing(false)
    if (!user) {
      toast.warning(t('required_login'))
      onOpenChange(false)
      // Keep ?enroll=1 so the checkout auto-reopens right after login
      go(`#/login?next=${encodeURIComponent(`/courses/${course.slug ?? course.id}?enroll=1`)}`)
    }
  }, [open, user, course.id, t, onOpenChange])

  // Cleanup simulated gateway timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handlePay = async () => {
    setBusy(true)
    setErrMsg('')
    try {
      const res = await apiPost<OrderResult>('/api/orders', { courseId: course.id, method })
      setOrder(res)
      setStep('gateway')
      setProcessing(true)
      timerRef.current = setTimeout(() => setProcessing(false), 1200)
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('error')
      if (/already|ভর্তি|enrolled/i.test(msg)) {
        setStep('enrolled')
      } else {
        setErrMsg(msg)
        setStep('failed')
        toast.error(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleConfirm = async (status: 'SUCCESS' | 'FAILED') => {
    if (!order) return
    setBusy(true)
    try {
      await apiPost(`/api/orders/${order.order.id}/confirm`, { status })
      if (status === 'SUCCESS') {
        toast.success(t('payment_success'))
        setStep('success')
      } else {
        toast.error(t('payment_failed'))
        setStep('failed')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('error')
      if (/already|ভর্তি|enrolled/i.test(msg)) {
        toast.info(tx('আপনি ইতিমধ্যে এই কোর্সে ভর্তি আছেন', 'You are already enrolled in this course'))
        setStep('enrolled')
      } else {
        toast.error(msg)
        setStep('failed')
        setErrMsg(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  const close = (v: boolean) => {
    if (processing) return
    onOpenChange(v)
  }

  const selected = METHODS.find((m) => m.value === method)

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md rounded-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <GraduationCap className="h-5 w-5 text-primary" aria-hidden />
            {step === 'success' ? t('payment_success') : t('checkout_title')}
          </DialogTitle>
          <DialogDescription asChild>
            <span className="sr-only">{t('select_method')}</span>
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* ── Step 1: summary + method select ── */}
          {step === 'summary' && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              {/* Course summary */}
              <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
                {course.thumbnail && (
                  <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg">
                    <Image src={course.thumbnail} alt={course.title} fill sizes="80px" className="object-cover" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug">{course.title}</p>
                  <p className="mt-1 flex items-baseline gap-2 text-sm">
                    <span className="font-bold text-primary">{fmtBDT(effective, lang)}</span>
                    {course.discountPrice != null && course.discountPrice < course.price && (
                      <span className="text-xs text-muted-foreground line-through">{fmtBDT(course.price, lang)}</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Method radio cards */}
              <div
                role="radiogroup"
                aria-label={t('select_method')}
                className="grid grid-cols-2 gap-2"
              >
                {METHODS.map((m) => {
                  const Icon = m.icon
                  const active = method === m.value
                  return (
                    <button
                      key={m.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setMethod(m.value)}
                      className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        active ? m.ring : 'hover:border-primary/40'
                      }`}
                    >
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${m.color}`}>
                        <Icon className="h-4.5 w-4.5" aria-hidden />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">{m.label}</span>
                        <span className="block text-xs text-muted-foreground">{m.sub}</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              <Separator />

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('amount')}</span>
                <span className="text-lg font-bold text-primary">{fmtBDT(effective, lang)}</span>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handlePay}
                disabled={busy || effective === 0}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {t('loading')}
                  </>
                ) : (
                  `${t('pay_now')} · ${fmtBDT(effective, lang)}`
                )}
              </Button>
            </motion.div>
          )}

          {/* ── Step 2: simulated gateway ── */}
          {step === 'gateway' && order && (
            <motion.div
              key="gateway"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="space-y-4"
            >
              <div className="rounded-xl border bg-muted/40 p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {selected?.label} · {tx('লেনদেন আইডি', 'Transaction ID')}
                </p>
                <p className="mt-1 font-mono text-sm font-semibold">{order.order.trxId}</p>
                <p className="mt-3 text-3xl font-extrabold text-primary">{fmtBDT(order.amount, lang)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{order.courseTitle ?? course.title}</p>
              </div>

              {processing ? (
                <div className="flex flex-col items-center gap-3 py-6" aria-live="polite">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    {tx('পেমেন্ট প্রসেস হচ্ছে...', 'Processing payment...')}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-center text-xs font-medium text-muted-foreground">
                    {tx('ডেমো গেটওয়ে — প্রোডাকশনে SSLCommerz/bKash callback হবে', 'Demo gateway — production uses SSLCommerz/bKash callbacks')}
                  </p>
                  <Button
                    className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                    size="lg"
                    onClick={() => handleConfirm('SUCCESS')}
                    disabled={busy}
                  >
                    ✅ {tx('সফল দেখান', 'Simulate Success')}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => handleConfirm('FAILED')}
                    disabled={busy}
                  >
                    ❌ {tx('ব্যর্থ দেখান', 'Simulate Failure')}
                  </Button>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Success ── */}
          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="flex flex-col items-center gap-3 py-6 text-center"
            >
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 12 }}
              >
                <CheckCircle2 className="h-16 w-16 text-emerald-500" aria-hidden />
              </motion.span>
              <h3 className="text-lg font-bold">{t('payment_success')}</h3>
              <p className="text-sm text-muted-foreground">
                {tx('এখন আপনি ক্লাসরুম থেকে কোর্সটি শুরু করতে পারবেন।', 'You can now start the course from your classroom.')}
              </p>
              <div className="mt-2 flex w-full flex-col gap-2">
                <Button size="lg" onClick={() => { onOpenChange(false); go('#/dashboard') }}>
                  {t('my_courses')} →
                </Button>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  {t('cancel')}
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Failed ── */}
          {step === 'failed' && (
            <motion.div
              key="failed"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-3 py-4 text-center"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
                <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" aria-hidden />
              </span>
              <h3 className="text-base font-bold">{t('payment_failed')}</h3>
              {errMsg && <p className="text-sm text-muted-foreground">{errMsg}</p>}
              <div className="mt-1 flex w-full flex-col gap-2">
                <Button size="lg" onClick={() => setStep('summary')}>
                  {t('retry')}
                </Button>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  {t('cancel')}
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Already enrolled (409) ── */}
          {step === 'enrolled' && (
            <motion.div
              key="enrolled"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-3 py-4 text-center"
            >
              <CheckCircle2 className="h-14 w-14 text-emerald-500" aria-hidden />
              <h3 className="text-base font-bold">
                {tx('আপনি ইতিমধ্যে ভর্তি আছেন', 'Already enrolled')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {tx('এই কোর্সটি আপনার ড্যাশবোর্ডে যোগ করা আছে।', 'This course is already in your dashboard.')}
              </p>
              <div className="mt-1 flex w-full flex-col gap-2">
                <Button size="lg" onClick={() => { onOpenChange(false); go(`#/dashboard/classroom/${course.id}`) }}>
                  {t('continue_learning')} →
                </Button>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  {t('cancel')}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}

export default CheckoutDialog

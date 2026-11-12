'use client'

/**
 * ComboCheckoutView — /checkout/combo/[id] — COMBO (BUNDLE) CHECKOUT.
 * mirrors the COURSE/EXAM checkout page exactly (same professional
 * two-column layout, same stages) so every purchase on the platform feels
 * identical:
 *  1. Pick an enabled method (LIVE / SANDBOX badges) — /api/payment-methods.
 *  2. LIVE  → official gateway redirect → callback marks SUCCESS instantly
 *             and EVERY combo item lands in the student's dashboard.
 *  3. SANDBOX → demo gateway screen → instant unlock of the whole bundle.
 *  4. MANUAL → invoice upfront (invoice number as reference) → student
 *     submits sender number + TrxID → admin approves → bundle unlocks.
 *  + Coupon code apply option (combos accept any active coupon — no scope
 *    restriction; the validate endpoint is called without a scope param).
 *  + 100% profile completion REQUIRED (server-enforced too).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Copy,
  CreditCard,
  FileText,
  Gift,
  Info,
  Loader2,
  Lock,
  PenLine,
  Receipt,
  ShieldCheck,
  Tag,
  TicketPercent,
  UserRound,
  Wallet,
  X,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet, apiPost } from '@/lib/api-client'
import { gatewayLogo } from '@/lib/payment-gateways'
import { fmtBDT, fmtNum } from '@/lib/format'
import { usePublicSettings } from '@/hooks/use-public-settings'
import {
  isProfileComplete,
  missingProfileFields,
  PROFILE_FIELD_LABELS,
} from '@/lib/student-classes'

interface PublicGateway {
  code: string
  name: string
  isManual: boolean
  mode: string
  logoEmoji: string
  logoUrl?: string | null
  instructions: string
  instructionsEn: string
  manualNumbers?: { bkash?: string; nagad?: string; rocket?: string; bank?: string }
}

interface ComboItemLite {
  id: string
  itemType: 'COURSE' | 'EXAM' | 'SUGGESTION'
  refId: string
  title: string
  price: number | null
  isFree: boolean
  available: boolean
}

interface ComboLite {
  id: string
  title: string
  description: string
  price: number
  imageUrl: string | null
  items: ComboItemLite[]
  originalTotal: number
  savings: number
}

interface PurchaseRes {
  purchase: {
    id: string
    amount: number
    listAmount?: number | null
    discount?: number | null
    couponCode?: string | null
    method: string
    status: string
    trxId: string
    invoiceNo: string | null
  }
  listAmount?: number
  discount?: number
  finalAmount?: number
  couponCode?: string | null
}

interface AppliedCoupon {
  code: string
  discount: number
  finalAmount: number
}

type Stage = 'form' | 'sandbox' | 'success' | 'manual' | 'failed'

const ITEM_META = {
  COURSE: { Icon: BookOpen, bn: 'কোর্স', en: 'Course' },
  EXAM: { Icon: PenLine, bn: 'পরীক্ষা', en: 'Exam' },
  SUGGESTION: { Icon: FileText, bn: 'সাজেশন', en: 'Suggestion' },
} as const

export default function ComboCheckoutView({ comboId }: { comboId: string }) {
  const { t, tx, lang } = useUI()
  const { user, initialized } = useAuth()
  const settings = usePublicSettings()

  const [combo, setCombo] = useState<ComboLite | null>(null)
  const [loadingCombo, setLoadingCombo] = useState(true)
  const [methods, setMethods] = useState<PublicGateway[]>([])
  const [selected, setSelected] = useState('')
  const [coupon, setCoupon] = useState('')
  const [couponApplied, setCouponApplied] = useState<AppliedCoupon | null>(null)
  const [couponBusy, setCouponBusy] = useState(false)
  const [paying, setPaying] = useState(false)
  const [purchase, setPurchase] = useState<PurchaseRes['purchase'] | null>(null)
  const [stage, setStage] = useState<Stage>('form')

  // manual payment fields
  const [senderNumber, setSenderNumber] = useState('')
  const [trxId, setTrxId] = useState('')
  const [note, setNote] = useState('')
  const [submittedTrx, setSubmittedTrx] = useState('')

  const bn = lang === 'bn'
  const listAmount = combo ? Number(combo.price ?? 0) : 0
  // Live coupon preview — total after the applied coupon discount.
  const couponDiscount = couponApplied ? Math.min(couponApplied.discount, listAmount) : 0
  const payable = Math.max(0, listAmount - couponDiscount)
  const invoiceNo = purchase?.invoiceNo ?? null

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ combo: ComboLite }>(`/api/combos/${comboId}`)
      setCombo(d.combo)
    } catch {
      setCombo(null)
    } finally {
      setLoadingCombo(false)
    }
  }, [comboId])

  useEffect(() => {
    void load()
    apiGet<PublicGateway[]>('/api/payment-methods')
      .then((ms) => {
        setMethods(Array.isArray(ms) ? ms : [])
        const first = ms?.[0]?.code ?? ''
        setSelected((prev) => prev || first)
      })
      .catch(() => setMethods([]))
  }, [load])

  // Return from a LIVE gateway callback: /checkout/combo/<id>?paid=<trxId>
  useEffect(() => {
    const readParam = (q: URLSearchParams): string | null => q.get('paid') ?? q.get('failed')
    let param = readParam(new URLSearchParams(window.location.search))
    if (!param) {
      const hash = window.location.hash
      const qi = hash.indexOf('?')
      if (qi !== -1) param = readParam(new URLSearchParams(hash.slice(qi + 1)))
    }
    if (!param) return
    void (async () => {
      try {
        const data = await apiGet<{
          purchases: Array<{ id: string; trxId: string; status: string; amount: number; method: string; invoiceNo: string | null }>
        }>('/api/combo-purchases')
        const mine = (data?.purchases ?? []).find((p) => p.trxId === param)
        if (mine && mine.status === 'SUCCESS') {
          setPurchase({
            id: mine.id,
            amount: mine.amount,
            method: mine.method,
            status: 'SUCCESS',
            trxId: mine.trxId,
            invoiceNo: mine.invoiceNo,
          })
          setStage('success')
        } else {
          setStage('failed')
        }
      } catch {
        setStage('failed')
      }
      window.history.replaceState(null, '', window.location.pathname)
    })()
  }, [comboId])

  /** missing profile fields (100% completion rule) */
  const missing = useMemo(() => (user ? missingProfileFields(user) : []), [user])

  const selectedGw = methods.find((m) => m.code === selected) ?? null

  /** Apply a coupon code — live validation (NO scope: combos accept any active coupon). */
  async function applyCoupon() {
    if (!combo) return
    const code = coupon.trim().toUpperCase()
    if (!code) {
      toast.error(tx('কুপন কোড লিখুন', 'Enter a coupon code'))
      return
    }
    setCouponBusy(true)
    try {
      const res = await apiPost<AppliedCoupon & { valid: boolean }>('/api/coupons/validate', {
        code,
        amount: listAmount,
      })
      setCouponApplied({ code: res.code, discount: res.discount, finalAmount: res.finalAmount })
      toast.success(
        tx(
          `কুপন প্রয়োগ হয়েছে — ${fmtBDT(res.discount, lang)} ছাড়`,
          `Coupon applied — ${fmtBDT(res.discount, lang)} off`
        )
      )
    } catch (e) {
      setCouponApplied(null)
      toast.error(e instanceof Error ? e.message : tx('কুপন প্রয়োগ করা যায়নি', 'Could not apply the coupon'))
    } finally {
      setCouponBusy(false)
    }
  }

  function removeCoupon() {
    setCouponApplied(null)
    setCoupon('')
  }

  async function pay() {
    if (!selected || !combo) return
    const gw = methods.find((m) => m.code === selected)
    if (!gw) return
    setPaying(true)
    try {
      const res = await apiPost<PurchaseRes>(`/api/combos/${comboId}/purchase`, {
        method: selected,
        couponCode: couponApplied?.code ?? null,
      })
      setPurchase(res.purchase)

      if (gw.isManual || gw.mode === 'MANUAL') {
        setStage('manual')
        toast.success(tx('ইনভয়েস তৈরি হয়েছে — নিচের নির্দেশনা অনুসরণ করুন।', 'Invoice created — follow the instructions below.'))
        return
      }

      if (gw.mode === 'LIVE') {
        try {
          const ini = await apiPost<{ redirectUrl: string }>('/api/payments/initiate', {
            comboPurchaseId: res.purchase.id,
          })
          window.location.href = ini.redirectUrl
          return
        } catch (e) {
          toast.error(e instanceof Error ? e.message : tx('লাইভ পেমেন্ট শুরু করা যায়নি', 'Could not start the live payment'))
          setPaying(false)
          return
        }
      }

      // SANDBOX → demo screen → auto-confirm
      setStage('sandbox')
      setTimeout(() => {
        void (async () => {
          try {
            await apiPost(`/api/combo-purchases/${res.purchase.id}/confirm`, { status: 'SUCCESS' })
            toast.success(t('payment_success'))
            setStage('success')
          } catch {
            setStage('failed')
          }
        })()
      }, 1800)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('পেমেন্ট শুরু করা যায়নি', 'Could not start payment'))
    } finally {
      setPaying(false)
    }
  }

  async function submitManual() {
    if (!purchase) return
    if (senderNumber.trim().length < 6 || trxId.trim().length < 4) {
      toast.error(tx('সেন্ডার নম্বর ও ট্রানজেকশন আইডি দিন', 'Enter the sender number and transaction id'))
      return
    }
    setPaying(true)
    try {
      await apiPost(`/api/combo-purchases/${purchase.id}/submit`, {
        senderNumber: senderNumber.trim(),
        submittedTrxId: trxId.trim(),
        note: note.trim() || undefined,
      })
      setSubmittedTrx(trxId.trim().toUpperCase())
      setStage('success')
      toast.success(tx('পেমেন্ট তথ্য জমা হয়েছে — অ্যাডমিন যাচাই করছেন।', 'Payment info submitted — the admin is verifying it.'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('জমা দেওয়া যায়নি', 'Submit failed'))
    } finally {
      setPaying(false)
    }
  }

  const num = (n: number) => fmtNum(n, lang)

  /** Copy the invoice ID to the clipboard with a "Copied!" confirmation. */
  const copyInvoiceId = async () => {
    if (!invoiceNo) return
    try {
      await navigator.clipboard.writeText(invoiceNo)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = invoiceNo
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    toast.success(tx('কপি হয়েছে!', 'Copied!'))
  }

  /* ── Guard: not logged in ── */
  if (initialized && !user) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <UserRound className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-bold">{tx('চেকআউটের জন্য লগইন করুন', 'Log in to continue checkout')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tx('কম্বোটি কিনতে প্রথমে একাউন্টে প্রবেশ করুন।', 'Sign in to purchase this combo.')}
        </p>
        <Button className="mt-4" onClick={() => go(`/login?next=/checkout/combo/${comboId}`)}>
          {t('login')}
        </Button>
      </div>
    )
  }

  /* ── Guard: profile incomplete (server enforces this too) ── */
  if (user && !isProfileComplete(user)) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <UserRound className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-3 text-xl font-bold">{tx('প্রোফাইল ১০০% সম্পূর্ণ করুন', 'Complete your profile to 100%')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tx('কেনার আগে এই ঘরগুলো পূরণ করুন:', 'Fill these fields before purchasing:')}{' '}
          <span className="font-medium text-foreground/80">
            {missing.map((f) => {
              const lbl = PROFILE_FIELD_LABELS[f]
              return lbl ? tx(lbl.bn, lbl.en) : f
            }).join(', ')}
          </span>
        </p>
        <Button className="mt-4" onClick={() => go('/dashboard/profile')}>
          {tx('প্রোফাইলে যান', 'Go to profile')}
        </Button>
      </div>
    )
  }

  /* ── Loading ── */
  if (loadingCombo) {
    return (
      <div className="mx-auto grid max-w-5xl gap-5 py-8 lg:grid-cols-[1fr_380px]">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  /* ── Not found ── */
  if (!combo) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <Gift className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-bold">{tx('কম্বো অফারটি পাওয়া যায়নি', 'Combo offer not found')}</h1>
        <Button className="mt-4" variant="outline" onClick={() => go('/combos')}>
          {tx('কম্বো অফারগুলো দেখুন', 'Browse combo offers')}
        </Button>
      </div>
    )
  }

  /* ── SUCCESS stage ── */
  if (stage === 'success') {
    return (
      <div className="mx-auto max-w-lg py-10">
        <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Card className="overflow-hidden text-center">
            <div className="grad-brand py-8 text-white">
              <CheckCircle2 className="mx-auto h-16 w-16" />
              <h1 className="mt-3 text-2xl font-bold">
                {submittedTrx
                  ? tx('পেমেন্ট তথ্য জমা হয়েছে!', 'Payment info submitted!')
                  : tx('পেমেন্ট সফল!', 'Payment successful!')}
              </h1>
              <p className="mt-1 text-sm text-white/85">
                {submittedTrx
                  ? tx('অ্যাডমিন যাচাই করে দ্রুত কম্বোর সব আইটেম আনলক করে দেবেন।', 'The admin will verify and unlock your whole combo shortly.')
                  : tx('কম্বোর সব আইটেম ড্যাশবোর্ডে যোগ হয়েছে 🎉', 'Every combo item has been added to your dashboard 🎉')}
              </p>
            </div>
            <CardContent className="space-y-3 pt-5">
              {invoiceNo ? (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-4 py-3">
                  <span className="text-sm text-muted-foreground">{tx('ইনভয়েস নম্বর', 'Invoice number')}</span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-mono text-sm font-bold">{invoiceNo}</span>
                    <button
                      type="button"
                      onClick={() => void copyInvoiceId()}
                      aria-label={tx('ইনভয়েস আইডি কপি করুন', 'Copy invoice ID')}
                      title={tx('কপি করুন', 'Copy')}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              ) : null}
              {purchase?.trxId ? (
                <div className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3">
                  <span className="text-sm text-muted-foreground">{tx('ট্রানজেকশন আইডি', 'Transaction ID')}</span>
                  <span className="font-mono text-sm font-bold">{purchase.trxId}</span>
                </div>
              ) : null}
              <Button size="lg" className="w-full gap-2" onClick={() => go('/dashboard')}>
                <BadgeCheck className="h-5 w-5" />
                {tx('ড্যাশবোর্ডে যান', 'Go to dashboard')}
              </Button>
              <Button variant="outline" className="w-full gap-2" onClick={() => go('/combos')}>
                <ArrowLeft className="h-4 w-4" /> {tx('আরও কম্বো দেখুন', 'Browse more combos')}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
  }

  /* ── FAILED stage ── */
  if (stage === 'failed') {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <Card>
          <CardContent className="space-y-3 py-10">
            <XCircle className="mx-auto h-12 w-12 text-rose-500" />
            <h1 className="text-xl font-bold">{tx('পেমেন্ট সফল হয়নি', 'Payment was not completed')}</h1>
            <p className="text-sm text-muted-foreground">
              {tx('চিন্তা নেই — আবার চেষ্টা করুন অথবা ম্যানুয়াল পদ্ধতি বেছে নিন।', 'No worries — try again or pick the manual method.')}
            </p>
            <div className="flex justify-center gap-2">
              <Button onClick={() => setStage('form')}>{tx('আবার চেষ্টা করুন', 'Try again')}</Button>
              <Button variant="outline" onClick={() => go('/combos')}>{tx('কম্বো অফারগুলো', 'Browse combos')}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  /* ── SANDBOX gateway screen ── */
  if (stage === 'sandbox') {
    return (
      <div className="mx-auto max-w-md py-10">
        <Card>
          <CardContent className="space-y-6 py-10 text-center">
            <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
              {selectedGw?.name} · SANDBOX
            </p>
            <motion.div
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
              className="grad-brand mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-white"
            >
              <Wallet className="h-8 w-8" />
            </motion.div>
            <div>
              <p className="text-sm text-muted-foreground">{tx('প্রক্রিয়াধীন', 'Processing')}</p>
              <p className="text-2xl font-bold">{fmtBDT(purchase?.amount ?? payable, lang)}</p>
              {invoiceNo ? <p className="mt-1 font-mono text-xs text-muted-foreground">{invoiceNo}</p> : null}
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">
              {tx('ডেমো গেটওয়ে — লাইভ করতে অ্যাডমিন প্যানেলে গেটওয়ের অফিসিয়াল API ক্রেডেনশিয়াল দিন।', 'Demo gateway — go LIVE from the admin panel by adding the gateway\'s official API credentials.')}
            </p>
            <div className="flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          </CardContent>
        </Card>
      </div>
    )
  }

  /* ── MANUAL invoice stage ── */
  if (stage === 'manual' && selectedGw && purchase) {
    const nums = selectedGw.manualNumbers ?? {}
    return (
      <div className="mx-auto max-w-2xl py-8">
        <Button variant="ghost" size="sm" className="mb-3 gap-1.5" onClick={() => setStage('form')}>
          <ArrowLeft className="h-4 w-4" /> {tx('পেমেন্ট মেথড পাল্টান', 'Change method')}
        </Button>
        <Card className="overflow-hidden">
          <div className="grad-brand flex items-center gap-3 px-5 py-4 text-white">
            <Receipt className="h-6 w-6" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{tx('পেমেন্ট ইনভয়েস', 'Payment Invoice')}</p>
              <button
                type="button"
                onClick={() => void copyInvoiceId()}
                className="group inline-flex max-w-full items-center gap-1.5"
                aria-label={tx('ইনভয়েস আইডি কপি করুন', 'Copy invoice ID')}
                title={tx('ইনভয়েস আইডি কপি করুন', 'Copy invoice ID')}
              >
                <span className="truncate font-mono text-xs text-white/80 group-hover:text-white">{invoiceNo}</span>
                <Copy className="h-3 w-3 shrink-0 text-white/60 group-hover:text-white" />
              </button>
            </div>
            <span className="ml-auto text-xl font-bold">{fmtBDT(purchase.amount, lang)}</span>
          </div>
          <CardContent className="space-y-5 pt-5">
            {/* Issuer / bill-to — all issuer fields come from admin Settings */}
            <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">{tx('ইস্যুকারী', 'Issuer')}</p>
                <p className="mt-1 truncate font-semibold">{settings.brandName || tx('পাঠশালা', 'PathShala')}</p>
                {settings.address.trim() !== '' && (
                  <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{settings.address}</p>
                )}
                {settings.supportPhone.trim() !== '' && (
                  <p className="text-xs text-muted-foreground">📞 {settings.supportPhone}</p>
                )}
                {settings.supportEmail.trim() !== '' && (
                  <p className="truncate text-xs text-muted-foreground">✉️ {settings.supportEmail}</p>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">{tx('বিল-টু', 'Bill to')}</p>
                <p className="mt-1 truncate font-semibold">{user?.name || tx('শিক্ষার্থী', 'Student')}</p>
                {user?.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {tx('কম্বো', 'Combo')}: <span className="font-medium text-foreground">{combo.title}</span>
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
              <p className="font-semibold">{tx('অনুগ্রহ করে নিয়ম মেনে টাকা পাঠান:', 'Please send the money following these rules:')}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>{tx('নিচের নম্বরে Send Money / Cash Out করুন।', 'Send Money / Cash Out to the number(s) below.')}</li>
                <li>
                  <b>{tx('রেফারেন্স-এ ইনভয়েস নম্বরটি অবশ্যই দিন', 'MUST use the invoice number as the reference')}</b> — <span className="font-mono font-bold text-primary">{invoiceNo}</span>
                  <button
                    type="button"
                    onClick={() => void copyInvoiceId()}
                    aria-label={tx('ইনভয়েস আইডি কপি করুন', 'Copy invoice ID')}
                    className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </li>
                <li>{tx('পাঠানোর পর ট্রানজেকশন আইডি (TrxID) নিচের ফর্মে জমা দিন।', 'After sending, submit the transaction ID (TrxID) in the form below.')}</li>
              </ol>
            </div>

            {/* Pay-to numbers */}
            <div className="grid gap-2 sm:grid-cols-3">
              {(['bkash', 'nagad', 'rocket'] as const).map((k) =>
                nums[k] ? (
                  <div key={k} className="flex items-center justify-between rounded-xl border px-3 py-2.5">
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase">{k}</p>
                      <p className="font-mono text-sm font-bold">{nums[k]}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label={tx('কপি', 'Copy')}
                      onClick={() => {
                        void navigator.clipboard.writeText(nums[k] ?? '')
                        toast.success(tx('কপি হয়েছে', 'Copied'))
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null
              )}
            </div>
            {nums.bank ? (
              <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground whitespace-pre-line">{nums.bank}</p>
            ) : null}
            {selectedGw.instructions ? (
              <p className="whitespace-pre-line rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
                {bn ? selectedGw.instructions : selectedGw.instructionsEn || selectedGw.instructions}
              </p>
            ) : null}
            {settings.invoiceNote.trim() !== '' && (
              <p className="whitespace-pre-line rounded-xl border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
                {settings.invoiceNote}
              </p>
            )}

            <Separator />

            {/* Submit payment proof */}
            <div className="space-y-3">
              <p className="text-sm font-bold">{tx('পেমেন্ট তথ্য জমা দিন', 'Submit your payment proof')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">{tx('যে নম্বর থেকে পাঠিয়েছেন', 'Sender number')} *</Label>
                  <Input value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} placeholder="01XXXXXXXXX" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">{tx('ট্রানজেকশন আইডি (TrxID)', 'Transaction ID (TrxID)')} *</Label>
                  <Input value={trxId} onChange={(e) => setTrxId(e.target.value)} placeholder="যেমন: 9GX7A2B1C3" className="mt-1 font-mono" />
                </div>
              </div>
              <div>
                <Label className="text-xs">{tx('অতিরিক্ত নোট (ঐচ্ছিক)', 'Extra note (optional)')}</Label>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" />
              </div>
              <Button className="w-full gap-2" size="lg" disabled={paying} onClick={() => void submitManual()}>
                {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                {tx('জমা দিন — অ্যাডমিন যাচাই করবেন', 'Submit for admin verification')}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                {tx('জমা দেওয়ার পর অ্যাডমিন অ্যাপ্রুভ করলেই কম্বোর সব আইটেম ড্যাশবোর্ডে চলে আসবে।', 'Once the admin approves, every combo item appears in your dashboard instantly.')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  /* ── MAIN CHECKOUT FORM ── */
  return (
    <div className="mx-auto max-w-6xl py-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{tx('চেকআউট — কম্বো অফার', 'Checkout — Combo Offer')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {tx('নিরাপদ পেমেন্ট — বাংলাদেশের সব পেমেন্ট মেথড সাপোর্টেড', 'Secure payment — every Bangladeshi payment method supported')}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => go('/combos')}>
          <ArrowLeft className="h-4 w-4" /> {tx('কম্বো অফারে ফিরুন', 'Back to combos')}
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* ── Left: combo + methods ── */}
        <div className="space-y-5">
          {/* Combo summary */}
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="overflow-hidden">
              <div className="flex flex-col sm:flex-row">
                <div className="relative aspect-video w-full shrink-0 sm:aspect-auto sm:w-56">
                  {combo.imageUrl ? (
                    <Image src={combo.imageUrl} alt={combo.title} fill sizes="300px" unoptimized={combo.imageUrl.startsWith('http')} className="object-cover" />
                  ) : (
                    <div className="grad-amber flex h-full w-full items-center justify-center text-white">
                      <Gift className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <div className="flex-1 p-4">
                  <h2 className="line-clamp-2 text-base font-bold leading-snug">{combo.title}</h2>
                  {combo.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{combo.description}</p>}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="gap-1 text-[11px]">
                      <Gift className="h-3 w-3" /> {num(combo.items.length)} {tx('টি আইটেম', 'items')}
                    </Badge>
                    {combo.savings > 0 ? (
                      <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">
                        {fmtBDT(combo.savings, lang)} {tx('সাশ্রয়', 'save')}
                      </Badge>
                    ) : null}
                  </div>

                  {/* Items list with icons + prices */}
                  <ul className="mt-3 space-y-1.5">
                    {combo.items.map((it) => {
                      const meta = ITEM_META[it.itemType]
                      return (
                        <li key={it.id} className="flex items-center gap-2 text-xs">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <meta.Icon className="h-3 w-3" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">{it.title}</span>
                          <span className={`shrink-0 font-semibold ${it.available && !it.isFree && (it.price ?? 0) > 0 ? 'text-foreground/80' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {!it.available
                              ? tx('অনুপলব্ধ', 'N/A')
                              : it.isFree || (it.price ?? 0) <= 0
                                ? tx('ফ্রি', 'Free')
                                : fmtBDT(it.price ?? 0, lang)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>

                  <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {combo.originalTotal > combo.price ? (
                      <span className="text-sm text-muted-foreground line-through">{fmtBDT(combo.originalTotal, lang)}</span>
                    ) : null}
                    <span className="grad-text-brand text-xl font-bold">{fmtBDT(combo.price, lang)}</span>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Payment methods */}
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold">{tx('পেমেন্ট মেথড বাছুন', 'Choose a payment method')}</h3>
                </div>
                {methods.length === 0 ? (
                  <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                    {tx('এখন কোনো পেমেন্ট মেথড চালু নেই। অনুগ্রহ করে একটু পরে চেষ্টা করুন।', 'No payment method is enabled right now. Please try again later.')}
                  </p>
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {methods.map((m) => {
                      const logo = m.logoUrl || gatewayLogo(m.code)
                      return (
                        <button
                          key={m.code}
                          type="button"
                          onClick={() => setSelected(m.code)}
                          aria-pressed={selected === m.code}
                          className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition-all sm:p-3.5 ${
                            selected === m.code
                              ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                              : 'hover:border-primary/40 hover:bg-muted/40'
                          }`}
                        >
                          {/* Original gateway logo — clean, NO circle/border/frame */}
                          {logo ? (
                            <img
                              src={logo}
                              alt=""
                              aria-hidden
                              className="h-6 w-20 shrink-0 object-contain sm:h-7 sm:w-24"
                            />
                          ) : (
                            <span className="shrink-0 text-lg">{m.logoEmoji}</span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{m.name}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {m.isManual
                                ? tx('ইনভয়েস দিয়ে ম্যানুয়াল পেমেন্ট', 'Manual payment with invoice')
                                : m.mode === 'LIVE'
                                  ? tx('লাইভ গেটওয়ে — অটো আনলক', 'Live gateway — auto unlock')
                                  : tx('ডেমো গেটওয়ে', 'Demo gateway')}
                            </span>
                          </span>
                          {m.mode === 'LIVE' && !m.isManual ? (
                            <Badge className="hidden bg-emerald-500 hover:bg-emerald-500 sm:inline-flex">{tx('লাইভ', 'LIVE')}</Badge>
                          ) : null}
                          <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${selected === m.code ? 'border-primary bg-primary' : 'border-muted-foreground/40'}`} />
                        </button>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── Right: sticky price box ── */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            <Card>
              <CardContent className="space-y-4 p-5">
                <h3 className="text-sm font-bold">{tx('অর্ডার সামারি', 'Order summary')}</h3>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{tx('কম্বো মূল্য', 'Combo price')}</span>
                  <span className="font-semibold">{fmtBDT(listAmount, lang)}</span>
                </div>
                {combo.originalTotal > combo.price ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{tx('আসল মূল্য', 'Original total')}</span>
                    <span className="text-muted-foreground line-through">{fmtBDT(combo.originalTotal, lang)}</span>
                  </div>
                ) : null}
                {combo.savings > 0 ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{tx('আপনার সাশ্রয়', 'You save')}</span>
                    <span className="font-semibold text-emerald-600">− {fmtBDT(combo.savings, lang)}</span>
                  </div>
                ) : null}

                <Separator />

                {/* Coupon */}
                <div>
                  <Label className="text-xs">{tx('কুপন কোড', 'Coupon code')}</Label>
                  {couponApplied ? (
                    <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                        <TicketPercent className="h-4 w-4 shrink-0" />
                        <span className="truncate font-mono">{couponApplied.code}</span>
                        <span className="shrink-0 text-xs font-normal">· −{fmtBDT(couponDiscount, lang)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={removeCoupon}
                        aria-label={tx('কুপন বাদ দিন', 'Remove coupon')}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-emerald-700/70 transition-colors hover:bg-emerald-500/20 hover:text-emerald-700 dark:text-emerald-300/70"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="mt-1 flex gap-2">
                        <div className="relative flex-1">
                          <Tag className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={coupon}
                            onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                void applyCoupon()
                              }
                            }}
                            placeholder="PATHSHALA10"
                            className="pl-8 font-mono text-sm"
                          />
                        </div>
                        <Button type="button" variant="outline" disabled={couponBusy || !coupon.trim()} onClick={() => void applyCoupon()} className="shrink-0">
                          {couponBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : tx('প্রয়োগ', 'Apply')}
                        </Button>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{tx('কোড দিয়ে প্রয়োগ করুন — ছাড় সাথে সাথেই দেখা যাবে।', 'Apply a code — the discount shows instantly.')}</p>
                    </>
                  )}
                </div>

                <Separator />
                <div className="flex items-baseline justify-between">
                  <span className="font-bold">{tx('সর্বমোট', 'Total')}</span>
                  <span className="grad-text-brand text-2xl font-extrabold">{fmtBDT(payable, lang)}</span>
                </div>

                <Button size="lg" className="w-full gap-2" disabled={paying || !selected} onClick={() => void pay()}>
                  {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-4 w-4" />}
                  {tx('নিরাপদে পেমেন্ট করুন', 'Pay securely')}
                </Button>

                {/* Trust row */}
                <div className="grid grid-cols-3 gap-2 pt-1 text-center text-[10px] text-muted-foreground">
                  <span className="flex flex-col items-center gap-1"><ShieldCheck className="h-4 w-4 text-emerald-600" /> {tx('SSL সুরক্ষিত', 'SSL secured')}</span>
                  <span className="flex flex-col items-center gap-1"><Receipt className="h-4 w-4 text-primary" /> {tx('ইনভয়েস/রসিদ', 'Invoice/receipt')}</span>
                  <span className="flex flex-col items-center gap-1"><BadgeCheck className="h-4 w-4 text-amber-600" /> {tx('তাৎক্ষণিক আনলক', 'Instant unlock')}</span>
                </div>
                {selectedGw?.isManual ? (
                  <p className="flex items-start gap-1.5 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {tx('ম্যানুয়াল পেমেন্টে ইনভয়েস তৈরি হবে — রেফারেন্স-এ ইনভয়েস নম্বর দিতে হবে।', 'A manual invoice will be generated — you must use the invoice number as reference.')}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

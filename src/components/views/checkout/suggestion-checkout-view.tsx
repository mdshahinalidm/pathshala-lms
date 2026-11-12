'use client'

/**
 * SuggestionCheckoutView — PAID SUGGESTION CHECKOUT (page, not dialog).
 * now mirrors the COURSE checkout page exactly (same professional
 * two-column layout, same stages) so every purchase on the platform feels
 * identical:
 *  1. Pick an enabled method from /api/payment-methods.
 *  2. SANDBOX → demo screen → instant unlock (POST /api/purchases/[id]/confirm).
 *  3. MANUAL  → INVOICE upfront → student submits sender+TrxID → admin
 *               approves from সাজেশন ক্রয় → download unlocks.
 *  4. LIVE    → official gateway redirect → callback marks SUCCESS instantly.
 *  + Coupon code apply option (same rules as course orders — ).
 *  + 100% profile completion REQUIRED (server-enforced too).
 * On success the purchase appears in ড্যাশবোর্ড → আমার সাজেশন instantly.
 */
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Copy,
  CreditCard,
  Gift,
  Info,
  Loader2,
  Lock,
  Receipt,
  ShieldCheck,
  Tag,
  TicketPercent,
  UserRound,
  Wallet,
  X,
  XCircle,
} from 'lucide-react'
import { PdfFileIcon } from '@/components/shared/pdf-file-icon'
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

interface MaterialLite {
  id: string
  title: string
  description: string
  category: string
  price: number
  fileName: string | null
  fileSize: number | null
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

export default function SuggestionCheckoutView({ suggestionId }: { suggestionId: string }) {
  const { t, tx, lang } = useUI()
  const { user, initialized } = useAuth()
  const settings = usePublicSettings()

  const [material, setMaterial] = useState<MaterialLite | null>(null)
  const [loading, setLoading] = useState(true)
  const [methods, setMethods] = useState<PublicGateway[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [coupon, setCoupon] = useState('')
  const [couponApplied, setCouponApplied] = useState<AppliedCoupon | null>(null)
  const [couponBusy, setCouponBusy] = useState(false)
  const [paying, setPaying] = useState(false)
  const [stage, setStage] = useState<Stage>('form')
  const [purchase, setPurchase] = useState<PurchaseRes['purchase'] | null>(null)
  const [senderNumber, setSenderNumber] = useState('')
  const [trxId, setTrxId] = useState('')
  const [note, setNote] = useState('')
  const [submittedTrx, setSubmittedTrx] = useState('')

  const listAmount = material ? Number(material.price ?? 0) : 0
  // live coupon preview — total after the applied coupon discount.
  const couponDiscount = couponApplied ? Math.min(couponApplied.discount, listAmount) : 0
  const payable = Math.max(0, listAmount - couponDiscount)
  const invoiceNo = purchase?.invoiceNo ?? null

  const load = useCallback(async () => {
    try {
      const all = await apiGet<Array<MaterialLite & { isFree: boolean; hasFile: boolean }>>('/api/suggestions')
      const found = Array.isArray(all) ? all.find((m) => m.id === suggestionId) : undefined
      if (found && !found.isFree) setMaterial(found)
    } catch {
      setMaterial(null)
    } finally {
      setLoading(false)
    }
  }, [suggestionId])

  useEffect(() => {
    void load()
    apiGet<PublicGateway[]>('/api/payment-methods')
      .then((ms) => {
        setMethods(ms ?? [])
        const first = ms?.[0]?.code ?? null
        setSelected((prev) => prev ?? first)
      })
      .catch(() => setMethods([]))
  }, [load])

  // Return from a LIVE gateway callback: /checkout/suggestion/<id>?paid=<trxId>
  // (the callback marks the purchase SUCCESS → instantly in My Suggestions)
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
        const data = await apiGet<{ purchases: Array<{ trxId: string; status: string; amount: number; method: string; invoiceNo: string | null }> }>('/api/purchases')
        const mine = (data?.purchases ?? []).find((p) => p.trxId === (new URLSearchParams(window.location.search).get('paid') ?? param))
        if (mine && mine.status === 'SUCCESS') {
          setPurchase({ id: '', amount: mine.amount, method: mine.method, status: 'SUCCESS', trxId: mine.trxId, invoiceNo: mine.invoiceNo })
          setStage('success')
        } else {
          setStage('failed')
        }
      } catch {
        setStage('failed')
      }
      window.history.replaceState(null, '', window.location.pathname)
    })()
  }, [])

  const bn = lang === 'bn'

  /** apply a coupon code — live validation against the item amount. */
  async function applyCoupon() {
    if (!material) return
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
        scope: 'SUGGESTION',
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

  async function startPayment() {
    if (!selected || !material) return
    const gw = methods.find((m) => m.code === selected)
    if (!gw) return
    setPaying(true)
    try {
      const res = await apiPost<PurchaseRes>(`/api/suggestions/${material.id}/purchase`, {
        method: selected,
        couponCode: couponApplied?.code ?? null,
      })
      setPurchase(res.purchase)

      if (gw.isManual || gw.mode === 'MANUAL') {
        setStage('manual')
        toast.success(tx('ইনভয়েস তৈরি হয়েছে — নিচের নির্দেশনা অনুসরণ করুন।', 'Invoice created — follow the instructions below.'))
        return
      }

      // LIVE → official gateway redirect (callback marks SUCCESS instantly)
      if (gw.mode === 'LIVE') {
        try {
          const ini = await apiPost<{ redirectUrl: string }>('/api/payments/initiate', { purchaseId: res.purchase.id })
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
            await apiPost(`/api/purchases/${res.purchase.id}/confirm`, { status: 'SUCCESS' })
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
      await apiPost(`/api/purchases/${purchase.id}/submit`, {
        senderNumber: senderNumber.trim(),
        trxId: trxId.trim(),
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
          {tx('সাজেশনটি কিনতে প্রথমে একাউন্টে প্রবেশ করুন।', 'Sign in to purchase this suggestion.')}
        </p>
        <Button className="mt-4" onClick={() => go(`/login?next=/checkout/suggestion/${suggestionId}`)}>
          {t('login')}
        </Button>
      </div>
    )
  }

  /* ── Loading ── */
  if (!initialized || loading || !user) {
    return (
      <div className="mx-auto grid max-w-5xl gap-5 py-8 lg:grid-cols-[1fr_380px]">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  /* ── Not found ── */
  if (!material) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <PdfFileIcon className="mx-auto h-10 w-10" />
        <h1 className="mt-3 text-xl font-bold">{tx('সাজেশন পাওয়া যায়নি', 'Suggestion not found')}</h1>
        <Button variant="outline" className="mt-4" onClick={() => go('/suggestions')}>
          {tx('সাজেশনসে ফিরুন', 'Back to suggestions')}
        </Button>
      </div>
    )
  }

  /* ── 100% profile completion gate (server enforces this too) ── */
  if (!isProfileComplete(user)) {
    const missing = missingProfileFields(user)
    return (
      <div className="mx-auto max-w-lg px-3.5 py-12">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
              <UserRound className="h-7 w-7" />
            </span>
            <h1 className="text-xl font-bold">
              {tx('প্রোফাইল ১০০% সম্পূর্ণ করুন', 'Complete your profile to 100%')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {tx(
                'কেনাকাটার আগে প্রোফাইলের সব তথ্য (ছবি, শ্রেণি, প্রতিষ্ঠান, ফোন, ইমেইল) পূরণ করা আবশ্যক।',
                'Before buying, fill in every profile field (photo, class, institution, phone, email).'
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {tx('বাকি আছে:', 'Missing:')}{' '}
              <span className="font-medium text-foreground/80">
                {missing.map((m) => PROFILE_FIELD_LABELS[m]?.[lang] ?? m).join(' · ')}
              </span>
            </p>
            <Button className="mt-2 gap-2" onClick={() => go('/dashboard/profile')}>
              <UserRound className="h-4 w-4" />
              {tx('প্রোফাইল সম্পূর্ণ করুন', 'Complete profile')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const selectedGw = methods.find((m) => m.code === selected) ?? null

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
                  ? tx('অ্যাডমিন যাচাই করে দ্রুত ডাউনলোড খুলে দেবেন।', 'The admin will verify and unlock the download shortly.')
                  : tx('সাজেশনটি ড্যাশবোর্ডের "আমার সাজেশন"-এ যোগ হয়েছে — সঙ্গে সঙ্গে ডাউনলোড করুন।', 'The suggestion is now in your dashboard "My Suggestions" — download it right away.')}
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
              <Button size="lg" className="w-full gap-2" onClick={() => go('/dashboard/suggestions')}>
                <PdfFileIcon className="h-5 w-5" />
                {tx('আমার সাজেশনে যান', 'Go to My Suggestions')}
              </Button>
              <Button variant="outline" className="w-full gap-2" onClick={() => go('/suggestions')}>
                <ArrowLeft className="h-4 w-4" /> {tx('আরও সাজেশন দেখুন', 'Browse more suggestions')}
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
              <Button variant="outline" onClick={() => go('/suggestions')}>{tx('সাজেশনস', 'Suggestions')}</Button>
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
    const ins = bn ? selectedGw.instructions : selectedGw.instructionsEn || selectedGw.instructions
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
                  {tx('সাজেশন', 'Suggestion')}: <span className="font-medium text-foreground">{material.title}</span>
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
            {ins ? (
              <p className="whitespace-pre-line rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">{ins}</p>
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
                  <Input value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} placeholder="01XXXXXXXXX" className="mt-1" inputMode="tel" />
                </div>
                <div>
                  <Label className="text-xs">{tx('ট্রানজেকশন আইডি (TrxID)', 'Transaction ID (TrxID)')} *</Label>
                  <Input value={trxId} onChange={(e) => setTrxId(e.target.value)} placeholder="যেমন: 8N7D2K9Q" className="mt-1 font-mono" />
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
                {tx('জমা দেওয়ার পর অ্যাডমিন অ্যাপ্রুভ করলেই "আমার সাজেশন"-এ ডাউনলোড খুলে যাবে।', 'Once the admin approves, the download unlocks in "My Suggestions" instantly.')}
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
          <h1 className="text-xl font-bold sm:text-2xl">{tx('চেকআউট — সাজেশন', 'Checkout — Suggestion')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {tx('নিরাপদ পেমেন্ট — বাংলাদেশের সব পেমেন্ট মেথড সাপোর্টেড', 'Secure payment — every Bangladeshi payment method supported')}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => go('/suggestions')}>
          <ArrowLeft className="h-4 w-4" /> {tx('সাজেশনসে ফিরুন', 'Back to suggestions')}
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* ── Left: suggestion + methods ── */}
        <div className="space-y-5">
          {/* Suggestion summary */}
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="overflow-hidden">
              <div className="flex flex-col sm:flex-row">
                <div className="grad-amber flex aspect-video w-full shrink-0 items-center justify-center sm:aspect-auto sm:w-56">
                  <PdfFileIcon className="h-16 w-16" />
                </div>
                <div className="flex-1 p-4">
                  <h2 className="line-clamp-2 text-base font-bold leading-snug">{material.title}</h2>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{material.description}</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-[11px]">{material.category}</Badge>
                    {material.fileName ? (
                      <Badge variant="outline" className="font-mono text-[11px]">{material.fileName}</Badge>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="grad-text-brand text-xl font-bold">{fmtBDT(listAmount, lang)}</span>
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

          {/* combo offer cross-sell — renders NOTHING when no active combo includes this suggestion */}
          <SuggestionComboOffers suggestionId={suggestionId} />
        </div>

        {/* ── Right: sticky price box ── */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            <Card>
              <CardContent className="space-y-4 p-5">
                <h3 className="text-sm font-bold">{tx('অর্ডার সামারি', 'Order summary')}</h3>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{tx('সাজেশনের মূল্য', 'Suggestion price')}</span>
                  <span className="font-semibold">{fmtBDT(listAmount, lang)}</span>
                </div>

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

                <Button size="lg" className="w-full gap-2" disabled={paying || !selected} onClick={() => void startPayment()}>
                  {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-4 w-4" />}
                  {tx('নিরাপদে পেমেন্ট করুন', 'Pay securely')}
                </Button>

                {/* Trust row */}
                <div className="grid grid-cols-3 gap-2 pt-1 text-center text-[10px] text-muted-foreground">
                  <span className="flex flex-col items-center gap-1"><ShieldCheck className="h-4 w-4 text-emerald-600" /> {tx('SSL সুরক্ষিত', 'SSL secured')}</span>
                  <span className="flex flex-col items-center gap-1"><Receipt className="h-4 w-4 text-primary" /> {tx('ইনভয়েস/রসিদ', 'Invoice/receipt')}</span>
                  <span className="flex flex-col items-center gap-1"><BadgeCheck className="h-4 w-4 text-amber-600" /> {tx('তাৎক্ষণিক ডাউনলোড', 'Instant download')}</span>
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

/* ── combo cross-sell — a compact amber/emerald offer card, shown
   ONLY when at least one active combo includes THIS suggestion. Zero
   combos → renders nothing at all (site stays visually untouched). ── */
interface ComboOfferLite {
  id: string
  title: string
  savings: number
  itemCount: number
}

function SuggestionComboOffers({ suggestionId }: { suggestionId: string }) {
  const { tx, lang } = useUI()
  const [offers, setOffers] = useState<ComboOfferLite[] | null>(null)

  useEffect(() => {
    let alive = true
    apiGet<{
      combos: Array<{ id: string; title: string; savings: number; items: Array<{ itemType: string; refId: string }> }>
    }>('/api/combos')
      .then((d) => {
        if (!alive) return
        const combos = Array.isArray(d?.combos) ? d.combos : []
        setOffers(
          combos
            .filter((c) => (c.items ?? []).some((it) => it.itemType === 'SUGGESTION' && it.refId === suggestionId))
            .map((c) => ({ id: c.id, title: c.title, savings: c.savings, itemCount: (c.items ?? []).length }))
        )
      })
      .catch(() => {
        if (alive) setOffers([])
      })
    return () => {
      alive = false
    }
  }, [suggestionId])

  if (!offers || offers.length === 0) return null

  return (
    <div className="space-y-3">
      {offers.map((c) => (
        <div
          key={c.id}
          className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-emerald-500/5 to-transparent p-4 sm:flex-row sm:items-center"
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="grad-amber flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm">
              <Gift className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold tracking-wide text-amber-700 uppercase dark:text-amber-300">
                🎁 {tx('কম্বো অফার', 'Combo offer')}
              </p>
              <p className="mt-0.5 truncate text-sm font-bold">{c.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {fmtNum(c.itemCount, lang)} {tx('টি আইটেম একসাথে', 'items in one pack')}
                {c.savings > 0 ? (
                  <>
                    {' · '}
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {fmtBDT(c.savings, lang)} {tx('সাশ্রয়', 'save')}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <Button size="sm" className="shrink-0 gap-1.5" onClick={() => go(`/checkout/combo/${c.id}`)}>
            {tx('কম্বো নিন', 'Take the combo')}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ))}
    </div>
  )
}

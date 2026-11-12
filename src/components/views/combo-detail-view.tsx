'use client'

/**
 * ComboDetailView /combos/[id] — combo (bundle) detail page.
 *
 * Opens EXACTLY like a normal course detail page: feature image on top,
 * then the admin-written description (answers the questions students ask —
 * what's inside, who it's for, how to start), then the full list of the
 * courses / exams / suggestions included in the combo. The sticky purchase
 * card shows the struck-through original total, the big combo price and the
 * savings; buying grants the WHOLE bundle instantly to the student's
 * dashboard (My Courses / My Exams / My Suggestions).
 */
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Gift,
  Home,
  Info,
  PenLine,
  FileText,
  ShoppingBag,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import {
  ComboItemChips,
  type ComboLite,
  comboCheckoutHref,
} from '@/components/shared/combo-bits'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet } from '@/lib/api-client'
import { fmtBDT, fmtNum } from '@/lib/format'

const TYPE_META = {
  COURSE: { Icon: BookOpen, bn: 'কোর্স', en: 'Course', tone: 'grad-emerald' },
  EXAM: { Icon: PenLine, bn: 'পরীক্ষা', en: 'Exam', tone: 'grad-violet' },
  SUGGESTION: { Icon: FileText, bn: 'সাজেশন', en: 'Suggestion', tone: 'grad-amber' },
} as const

export default function ComboDetailView({ comboId }: { comboId: string }) {
  const { tx, t, lang } = useUI()
  const { user } = useAuth()
  const [combo, setCombo] = useState<ComboLite | null>(null)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let alive = true
    apiGet<{ combo: ComboLite }>(`/api/combos/${comboId}`)
      .then((d) => {
        if (!alive) return
        setCombo(d?.combo ?? null)
        if (!d?.combo) setNotFound(true)
      })
      .catch((e: Error) => {
        if (!alive) return
        if (/not found|নেই|404/i.test(e.message)) setNotFound(true)
        else setError(e.message || tx('লোড করা যায়নি', 'Could not load'))
      })
    return () => {
      alive = false
    }
  }, [comboId, tx])

  // ── Loading skeleton ──
  if (!combo && !error && !notFound) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3.5 py-8">
        <Skeleton className="h-4 w-56" />
        <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <Skeleton className="aspect-video w-full rounded-2xl" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  // ── Error / 404 ──
  if (notFound || error || !combo) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-3.5">
        <EmptyState
          icon={<Gift className="h-7 w-7" aria-hidden />}
          title={notFound ? tx('কম্বোটি খুঁজে পাওয়া যায়নি', 'Combo not found') : t('error')}
          description={notFound ? tx('অফারটি আর সক্রিয় নেই — চলমান কম্বো অফারগুলো দেখে নিন।', 'This offer is no longer active — browse the current combo offers.') : error}
          actionLabel={tx('কম্বো অফার দেখুন', 'Browse combo offers')}
          onAction={() => go('/combos')}
        />
      </div>
    )
  }

  const checkoutHref = comboCheckoutHref(combo.id, Boolean(user))
  const availableItems = combo.items.filter((it) => it.available)
  const courseCount = combo.items.filter((it) => it.itemType === 'COURSE').length

  return (
    <div className="mx-auto w-full max-w-7xl px-3.5 py-6 sm:py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-5">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link href="/" className="inline-flex items-center gap-1 hover:text-primary">
              <Home className="h-3.5 w-3.5" aria-hidden />
              {t('nav_home')}
            </Link>
          </li>
          <li aria-hidden><ChevronRight className="h-3.5 w-3.5" /></li>
          <li><Link href="/combos" className="hover:text-primary">{tx('কম্বো অফার', 'Combo Offers')}</Link></li>
          <li aria-hidden><ChevronRight className="h-3.5 w-3.5" /></li>
          <li className="max-w-[200px] truncate font-medium text-foreground sm:max-w-xs" aria-current="page">
            {combo.title}
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* ══ LEFT — feature image → description → included items ══ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="min-w-0"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1 border-transparent bg-amber-500 text-white hover:bg-amber-500">
              <Gift className="h-3 w-3" aria-hidden />
              {tx('কম্বো অফার', 'Combo offer')}
            </Badge>
            <ComboItemChips items={combo.items} />
          </div>

          <h1 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
            {combo.title}
          </h1>
          {combo.description ? (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground sm:text-base">{combo.description}</p>
          ) : null}

          {/* Feature image (like a normal course detail page) */}
          <div className="relative mt-5 aspect-video overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-accent to-amber-500/15">
            {combo.imageUrl ? (
              <Image
                src={combo.imageUrl}
                alt={combo.title}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 66vw"
                unoptimized={combo.imageUrl.startsWith('http')}
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="grad-amber flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg">
                  <Gift className="h-8 w-8" aria-hidden />
                </span>
              </div>
            )}
          </div>

          {/* Description — admin pre-writes the answers to student questions */}
          <section aria-label={tx('কম্বো সম্পর্কে বিস্তারিত', 'About this combo')} className="mt-6 rounded-2xl border bg-card p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
              <Info className="h-5 w-5 text-primary" aria-hidden />
              {tx('এই কম্বো সম্পর্কে যা যা জানবেন', 'What you should know about this combo')}
            </h2>
            {combo.description.trim() ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/85 sm:text-base">
                {combo.description}
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                {tx(
                  'কম্বোতে নিচের আইটেমগুলো একসাথে অন্তর্ভুক্ত — আলাদা আলাদা কিনলে যত খরচ, কম্বোতে তার চেয়ে অনেক কমে সব পাওয়া যাচ্ছে।',
                  'The combo includes everything listed below — buying them together costs far less than buying each item separately.'
                )}
              </p>
            )}
          </section>

          {/* Included items — the courses / exams / suggestions in this combo */}
          <section aria-label={tx('কম্বোতে যা আছে', 'What is included')} className="mt-6">
            <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
              <Gift className="h-5 w-5 text-amber-600" aria-hidden />
              {tx('কম্বোতে যা যা থাকছে', 'What is included in this combo')}
              <Badge variant="secondary" className="text-[11px]">
                {fmtNum(combo.items.length, lang)} {tx('টি আইটেম', 'items')}
              </Badge>
            </h2>

            <ul className="mt-3 space-y-2.5">
              {combo.items.map((it, idx) => {
                const meta = TYPE_META[it.itemType] ?? TYPE_META.COURSE
                const Icon = meta.Icon
                return (
                  <li
                    key={it.id}
                    className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 transition-shadow hover:shadow-sm sm:p-4"
                  >
                    <span className={`${meta.tone} flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm`}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          {tx(meta.bn, meta.en)}
                        </span>
                        <span aria-hidden className="text-[11px] text-muted-foreground/60">#{fmtNum(idx + 1, lang)}</span>
                      </div>
                      <p className="truncate text-sm font-semibold sm:text-base">{it.title}</p>
                      {!it.available && (
                        <p className="text-xs text-destructive">{tx('এই আইটেমটি আর নেই', 'This item is no longer available')}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {it.isFree ? (
                        <Badge className="border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300">
                          {tx('ফ্রি', 'Free')}
                        </Badge>
                      ) : it.price != null && it.price > 0 ? (
                        <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                          {fmtBDT(it.price, lang)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        </motion.div>

        {/* ══ RIGHT — sticky purchase card ══ */}
        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="min-w-0"
          aria-label={tx('কম্বো কেনার কার্ড', 'Combo purchase card')}
        >
          <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm lg:sticky lg:top-24">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-center">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                {tx('একসাথে কিনলে সাশ্রয়', 'Save when you buy together')}
              </p>
            </div>

            <div className="space-y-1">
              {combo.originalTotal > combo.price ? (
                <p className="text-sm text-muted-foreground">
                  {tx('আলাদা করে কিনলে', 'Buying separately')}:{' '}
                  <span className="line-through">{fmtBDT(combo.originalTotal, lang)}</span>
                </p>
              ) : null}
              <p className="flex items-baseline gap-2">
                <span className="grad-text-brand text-3xl font-extrabold">{fmtBDT(combo.price, lang)}</span>
                {combo.savings > 0 ? (
                  <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">
                    {fmtBDT(combo.savings, lang)} {tx('সাশ্রয়', 'save')}
                  </Badge>
                ) : null}
              </p>
            </div>

            <ul className="space-y-1.5 border-t pt-3 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                {fmtNum(combo.items.length, lang)} {tx('টি আইটেম একসাথে', 'items in one package')}
              </li>
              {courseCount > 0 ? (
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  {tx('কেনার সাথে সাথেই My Courses-এ', 'Instantly in My Courses after purchase')}
                </li>
              ) : (
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  {tx('কেনার সাথে সাথেই ড্যাশবোর্ডে', 'Instantly in your dashboard after purchase')}
                </li>
              )}
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                {tx('পুরো বান্ডেলে এক পেমেন্ট', 'One payment for the whole bundle')}
              </li>
            </ul>

            <Button size="lg" className="w-full gap-2 shadow-md" onClick={() => go(checkoutHref)}>
              <ShoppingBag className="h-4 w-4" aria-hidden />
              {user ? tx('কিনুন', 'Buy now') : tx('লগইন করে কিনুন', 'Login to buy')}
            </Button>

            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
              {tx(
                'পেমেন্ট হওয়ার সাথে সাথেই কম্বোর সব আইটেম আপনার ড্যাশবোর্ডে যোগ হয়ে যাবে।',
                'The moment payment completes, every combo item is added to your dashboard.'
              )}
            </p>

            {availableItems.length !== combo.items.length && (
              <p className="text-xs text-destructive">
                {tx(
                  'কিছু আইটেম আর নেই — বাকিগুলো কিনলে সেগুলোই আনলক হবে।',
                  'Some items are no longer available — buying unlocks the remaining ones.'
                )}
              </p>
            )}
          </div>
        </motion.aside>
      </div>
    </div>
  )
}

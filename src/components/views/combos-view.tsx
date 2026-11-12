'use client'

/**
 * CombosView — /combos — PUBLIC COMBO (BUNDLE) OFFERS PAGE.
 *
 * A combo bundles COURSE(S) + EXAM(S) + SUGGESTION(S) at one discounted
 * price — buying together saves more. Cards show the live item mix (chips
 * with icons + counts), the struck-through original total, the big combo
 * price and an emerald savings badge. CTA → /checkout/combo/{id} (guests
 * are sent to /login?next=… first).
 *
 * When NO active combo exists the page renders a friendly empty state —
 * nothing about the rest of the site changes.
 */
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { BookOpen, FileText, Gift, PenLine, ShoppingBag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet } from '@/lib/api-client'
import { fmtBDT, fmtNum } from '@/lib/format'

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

/** Count one combo's items by type for the chips row. */
function itemChips(combo: ComboLite, fmtCount: (n: number) => string) {
  const order = [
    { type: 'COURSE' as const, Icon: BookOpen, bn: 'কোর্স', en: 'course(s)' },
    { type: 'EXAM' as const, Icon: PenLine, bn: 'পরীক্ষা', en: 'exam(s)' },
    { type: 'SUGGESTION' as const, Icon: FileText, bn: 'সাজেশন', en: 'suggestion(s)' },
  ]
  const chips: { key: string; Icon: typeof BookOpen; label: string; labelEn: string }[] = []
  for (const { type, Icon, bn, en } of order) {
    const count = combo.items.filter((it) => it.itemType === type).length
    if (count > 0) {
      chips.push({ key: type, Icon, label: `${fmtCount(count)}টি ${bn}`, labelEn: `${fmtCount(count)} ${en}` })
    }
  }
  return chips
}

function ComboCard({ combo, i }: { combo: ComboLite; i: number }) {
  const { tx, lang } = useUI()
  const { user } = useAuth()

  const checkoutPath = `/checkout/combo/${combo.id}`
  const href = user ? checkoutPath : `/login?next=${encodeURIComponent(checkoutPath)}`
  // title/image open the combo DETAIL page (/combos/[id])
  const detailHref = `/combos/${combo.id}`
  const chips = itemChips(combo, (n) => fmtNum(n, lang))

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i * 0.05, 0.3) }}
      className="pop-hover group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
    >
      {/* Gradient / image header — clickable → detail page */}
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-primary/15 via-accent to-amber-500/15">
        <Link
          href={detailHref}
          aria-label={combo.title}
          /* the fill Image's parent must be positioned — the
             Link itself is the direct parent, so it carries the relative
             context (h-full w-full keeps the box identical to before). */
          className="relative block h-full w-full after:absolute after:inset-0 after:content-['']"
        >
          {combo.imageUrl ? (
            <Image
              src={combo.imageUrl}
              alt={combo.title}
              fill
              priority={i < 3}
              loading={i < 3 ? 'eager' : 'lazy'}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              unoptimized={combo.imageUrl.startsWith('http')}
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <span className="grad-amber flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg">
                <Gift className="h-7 w-7" aria-hidden />
              </span>
            </span>
          )}
        </Link>
        {/* Savings badge (top-right) */}
        {combo.savings > 0 ? (
          <Badge className="absolute right-3 top-3 border-transparent bg-emerald-600 text-white hover:bg-emerald-600">
            {fmtBDT(combo.savings, lang)} {tx('সাশ্রয়', 'save')}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug transition-colors group-hover:text-primary">
          <Link href={detailHref}>{combo.title}</Link>
        </h3>
        {combo.description && <p className="line-clamp-2 text-sm text-muted-foreground">{combo.description}</p>}

        {/* Item mix chips */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map(({ key, Icon, label, labelEn }) => (
              <Badge
                key={key}
                variant="outline"
                className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
              >
                <Icon className="h-3 w-3" aria-hidden />
                {tx(label, labelEn)}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-auto space-y-3 pt-1">
          {/* Pricing row: original struck through + big combo price */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {combo.originalTotal > combo.price ? (
              <span className="text-sm text-muted-foreground line-through">{fmtBDT(combo.originalTotal, lang)}</span>
            ) : null}
            <span className="grad-text-brand text-2xl font-extrabold">{fmtBDT(combo.price, lang)}</span>
            {combo.savings > 0 ? (
              <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">
                {fmtBDT(combo.savings, lang)} {tx('সাশ্রয়', 'save')}
              </Badge>
            ) : null}
          </div>

          <Button size="lg" className="relative z-10 w-full gap-2" onClick={() => go(href)}>
            <ShoppingBag className="h-4 w-4" aria-hidden />
            {tx('কিনুন', 'Buy now')}
          </Button>
        </div>
      </div>
    </motion.article>
  )
}

export default function CombosView() {
  const { tx, lang } = useUI()
  const [combos, setCombos] = useState<ComboLite[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    apiGet<{ combos: ComboLite[] }>('/api/combos')
      .then((d) => {
        if (!alive) return
        setCombos(Array.isArray(d?.combos) ? d.combos : [])
      })
      .catch(() => {
        if (!alive) return
        setCombos([])
        setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const loading = combos === null

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-3.5 py-8 sm:py-10">
      {/* Page h1 (single per view) — same visual style as the courses page */}
      <div className="text-left">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tx('কম্বো অফার', 'Combo Offers')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          {tx(
            'একসাথে কিনলেই বেশি সাশ্রয় — কোর্স, পরীক্ষা ও সাজেশন এক প্যাকেজে',
            'Save more when you buy together — courses, exams and suggestions in one package'
          )}
        </p>
      </div>

      <div className="mt-6 lg:mt-8">
        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-2xl border p-3">
                <Skeleton className="aspect-[16/9] w-full rounded-xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ))}
          </div>
        ) : combos.length === 0 ? (
          failed ? (
            <EmptyState
              icon={<Gift className="h-7 w-7" aria-hidden />}
              title={tx('কম্বো অফার লোড করা যায়নি', 'Could not load combo offers')}
              description={tx('অনুগ্রহ করে আবার চেষ্টা করুন।', 'Please try again.')}
              actionLabel={tx('আবার চেষ্টা করুন', 'Retry')}
              onAction={() => window.location.reload()}
            />
          ) : (
            <EmptyState
              icon={<Gift className="h-7 w-7" aria-hidden />}
              title={tx('এখন কোনো কম্বো অফার নেই', 'No combo offers right now')}
              description={tx(
                'নতুন কম্বো প্যাকেজ এলেই এখানে দেখা যাবে — ততক্ষণ কোর্সগুলো ঘুরে দেখুন।',
                'New combo packages will appear here — meanwhile, browse the courses.'
              )}
              actionLabel={tx('কোর্সগুলো দেখুন', 'Browse courses')}
              onAction={() => go('/courses')}
            />
          )
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {combos.map((c, i) => (
              <ComboCard key={c.id} combo={c} i={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

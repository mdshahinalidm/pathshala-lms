'use client'

/**
 * combo-bits shared building blocks for combo (bundle) cards
 * across /courses, /exams, /suggestions, /combos and the combo detail page.
 * Each page composes its own card in its OWN visual style (course-style
 * image card, exam-style card, suggestion-style card) while the combo-
 * specific pieces (image/fallback, item-mix chips, price row) stay identical.
 */
import Image from 'next/image'
import { BookOpen, FileText, Gift, PenLine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useUI } from '@/store/ui-store'
import { fmtBDT, fmtNum } from '@/lib/format'

export interface ComboItemLite {
  id: string
  itemType: 'COURSE' | 'EXAM' | 'SUGGESTION'
  refId: string
  title: string
  price: number | null
  isFree: boolean
  available: boolean
}

export interface ComboLite {
  id: string
  title: string
  description: string
  price: number
  imageUrl: string | null
  items: ComboItemLite[]
  originalTotal: number
  savings: number
}

/**
 * Surface-matching rule: a combo shows on a catalog surface when
 * AT LEAST ONE of its items belongs to that surface — all-course bundles
 * appear on /courses, all-exam bundles on /exams, all-suggestion bundles on
 * /suggestions, and mixed bundles appear on every surface they are relevant
 * to. The dedicated /combos page still lists every active offer.
 */
export function comboMatchesSurface(
  combo: Pick<ComboLite, 'items'>,
  surface: ComboItemLite['itemType'],
): boolean {
  return Array.isArray(combo.items) && combo.items.some((it) => it.itemType === surface)
}

/** Item-mix chips — ২টি কোর্স · ১টি পরীক্ষা · ৩টি সাজেশন (live counts). */
export function ComboItemChips({ items }: { items: ComboItemLite[] }) {
  const { tx, lang } = useUI()
  const order = [
    { type: 'COURSE' as const, Icon: BookOpen, bn: 'কোর্স', en: 'course(s)' },
    { type: 'EXAM' as const, Icon: PenLine, bn: 'পরীক্ষা', en: 'exam(s)' },
    { type: 'SUGGESTION' as const, Icon: FileText, bn: 'সাজেশন', en: 'suggestion(s)' },
  ]
  const chips: { key: string; Icon: typeof BookOpen; label: string; labelEn: string }[] = []
  for (const { type, Icon, bn, en } of order) {
    const count = items.filter((it) => it.itemType === type).length
    if (count > 0) {
      chips.push({ key: type, Icon, label: `${fmtNum(count, lang)}টি ${bn}`, labelEn: `${fmtNum(count, lang)} ${en}` })
    }
  }
  if (chips.length === 0) return null
  return (
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
  )
}

/** 16:9 feature image with the amber Gift fallback (course/exam surfaces). */
export function ComboThumb({
  combo,
  priority = false,
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  title,
}: {
  combo: Pick<ComboLite, 'imageUrl' | 'title'>
  priority?: boolean
  sizes?: string
  title?: string
}) {
  return (
    <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-primary/15 via-accent to-amber-500/15">
      {combo.imageUrl ? (
        <Image
          src={combo.imageUrl}
          alt={title || combo.title}
          fill
          priority={priority}
          loading={priority ? 'eager' : 'lazy'}
          sizes={sizes}
          unoptimized={combo.imageUrl.startsWith('http')}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <span className="grad-amber flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg">
            <Gift className="h-7 w-7" aria-hidden />
          </span>
        </div>
      )}
    </div>
  )
}

/** Pricing row — struck-through original total + big combo price + savings. */
export function ComboPriceRow({
  combo,
  size = 'lg',
}: {
  combo: Pick<ComboLite, 'price' | 'originalTotal' | 'savings'>
  size?: 'sm' | 'lg'
}) {
  const { tx, lang } = useUI()
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      {combo.originalTotal > combo.price ? (
        <span className={`text-muted-foreground line-through ${size === 'lg' ? 'text-sm' : 'text-xs'}`}>
          {fmtBDT(combo.originalTotal, lang)}
        </span>
      ) : null}
      <span className={`grad-text-brand font-extrabold ${size === 'lg' ? 'text-2xl' : 'text-lg'}`}>
        {fmtBDT(combo.price, lang)}
      </span>
      {combo.savings > 0 ? (
        <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">
          {fmtBDT(combo.savings, lang)} {tx('সাশ্রয়', 'save')}
        </Badge>
      ) : null}
    </div>
  )
}

/** Checkout href with the login gate (guests are sent to /login?next=…). */
export function comboCheckoutHref(comboId: string, loggedIn: boolean): string {
  const target = `/checkout/combo/${comboId}`
  return loggedIn ? target : `/login?next=${encodeURIComponent(target)}`
}

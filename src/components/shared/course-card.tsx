'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Users, PlayCircle, GraduationCap, BookOpen, Star, ShoppingBag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ValidityChip } from '@/components/shared/validity-chip'
import { useUI } from '@/store/ui-store'
import { fmtBDT, fmtNum } from '@/lib/format'

/** Instructor avatar fallback tones (rotating gradient). */
const AVATAR_TONES = ['grad-emerald', 'grad-violet', 'grad-amber', 'grad-rose', 'grad-cyan', 'grad-orange']

export interface CourseCardData {
  id: string
  title: string
  slug: string
  subtitle?: string | null
  thumbnail?: string | null
  price: number
  discountPrice?: number | null
  level: string
  instructorName: string
  instructorTitle?: string | null
  instructorImage?: string | null
  subject?: string | null
  _count?: { enrollments: number; lessons?: number; chapters?: number; reviews?: number }
  lessonsTotal?: number
  categoryName?: string | null
  category?: { slug: string; name: string; nameEn: string | null } | null
  ratingAvg?: number | null
  isLifetime?: boolean
  validityMonths?: number | null
}

function InstructorAvatar({ src, name, tone }: { src?: string | null; name: string; tone: string }) {
  if (src) {
    return (
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 ring-primary/25">
        <Image src={src} alt={name} fill sizes="36px" className="object-cover" />
      </span>
    )
  }
  return (
    <span className={`${tone} flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white`} aria-hidden>
      {name.charAt(0)}
    </span>
  )
}

export function CourseCard({ course, priority = false }: { course: CourseCardData; priority?: boolean }) {
  const { t, tx, lang } = useUI()
  const effective = course.discountPrice ?? course.price
  const detailHref = `/courses/${course.slug || course.id}`
  const buyHref = `${detailHref}?enroll=1`
  const reviewCount = course._count?.reviews ?? 0
  const avatarTone = AVATAR_TONES[(course.title.length + course.instructorName.length) % AVATAR_TONES.length]

  return (
    <article className="pop-hover group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      {/* Thumbnail (stretched link covers the card; Buy button stays above via z-10) */}
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-primary/15 to-accent">
        {course.thumbnail ? (
          <Image
            src={course.thumbnail}
            alt={course.title}
            fill
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <PlayCircle className="h-12 w-12 text-primary/40" />
          </div>
        )}
        {course.discountPrice != null && course.discountPrice < course.price && (
          <Badge className="absolute right-3 top-3 bg-amber-500 text-white hover:bg-amber-500">
            {tx('ছাড়', 'Sale')}
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        {/* Class + subject (left) · access-duration (right, single row) */}
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {course.categoryName && (
              <span
                className="inline-flex min-w-0 items-center gap-1 rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300"
                title={t('class_label')}
              >
                <GraduationCap className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{course.categoryName}</span>
              </span>
            )}
            {course.subject && (
              <span
                className="inline-flex min-w-0 items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
                title={t('subject_label')}
              >
                <BookOpen className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{course.subject}</span>
              </span>
            )}
          </div>
          {/* Colorful access-duration pill (১ মাস / ২ মাস / … / লাইফটাইম) — pinned right */}
          <ValidityChip isLifetime={course.isLifetime} validityMonths={course.validityMonths} />
        </div>

        {/* Title + subtitle: both clamp to 2 lines with reserved height so every
            card in a grid row is exactly the same height (equal columns). */}
        <h3 className="line-clamp-2 min-h-[44px] text-base font-semibold leading-snug transition-colors group-hover:text-primary">
          <Link href={detailHref} className="after:absolute after:inset-0 after:content-['']">
            {course.title}
          </Link>
        </h3>
        <p className="line-clamp-2 min-h-[40px] text-sm leading-snug text-muted-foreground">
          {course.subtitle || '\u00A0'}
        </p>

        {/* Meta: students · lessons · rating/reviews (single line reserved) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-[20px] text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {fmtNum(course._count?.enrollments ?? 0, lang)} {t('students_count')}
          </span>
          <span className="inline-flex items-center gap-1">
            <PlayCircle className="h-3.5 w-3.5" />
            {fmtNum(course._count?.lessons ?? course.lessonsTotal ?? 0, lang)} {t('lessons_count')}
          </span>
          {course.ratingAvg != null && reviewCount > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
              {fmtNum(course.ratingAvg.toFixed(1), lang)}
              <span className="font-normal text-muted-foreground">({fmtNum(reviewCount, lang)} {t('reviews')})</span>
            </span>
          )}
        </div>

        {/* Instructor: photo + bold name (+ title) */}
        <div className="flex items-center gap-2.5 rounded-xl border bg-muted/40 p-2">
          <InstructorAvatar src={course.instructorImage} name={course.instructorName} tone={avatarTone} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight">{course.instructorName}</span>
            {course.instructorTitle && (
              <span className="block truncate text-[11px] text-muted-foreground">{course.instructorTitle}</span>
            )}
          </span>
        </div>

        {/* Price + Buy button (above stretched link) */}
        <div className="relative z-10 mt-auto flex items-center justify-between gap-2 border-t pt-3">
          <div className="flex items-baseline gap-2">
            <span className="grad-text-brand text-lg font-bold">{fmtBDT(effective, lang)}</span>
            {course.discountPrice != null && course.discountPrice < course.price && (
              <span className="text-sm text-muted-foreground line-through">{fmtBDT(course.price, lang)}</span>
            )}
          </div>
          <Button size="sm" asChild className="rounded-xl shadow-md">
            <Link href={buyHref} aria-label={`${t('buy_course')} — ${course.title}`}>
              <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
              {t('buy_course')}
            </Link>
          </Button>
        </div>
      </div>
    </article>
  )
}

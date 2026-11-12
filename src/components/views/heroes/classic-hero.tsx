'use client'

/**
 * ClassicHero — the original PathShala landing hero (search + CTAs + trust
 * row on the left, hero image with floating stat cards on the right).
 *
 * Rendered when the admin-selected home hero variant is 'classic' (default).
 * Markup is byte-for-byte the hero that always lived in home-view.tsx, so the
 * classic look is completely unchanged — it only moved into its own component
 * so a second hero variant can be swapped in without touching this file.
 */

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUI, go } from '@/store/ui-store'

const AVATAR_INITIALS = ['র', 'সা', 'আ', 'তা', 'ম', 'নু']
const AVATAR_TONES = ['grad-emerald', 'grad-violet', 'grad-amber', 'grad-rose', 'grad-cyan', 'grad-orange']

export default function ClassicHero() {
  const { t, tx } = useUI()
  const [query, setQuery] = useState('')

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault()
    go(query.trim() ? `#/courses?q=${encodeURIComponent(query.trim())}` : '#/courses')
  }

  const title = t('hero_title')
  const words = title.split(' ')
  const last = words.pop() ?? ''

  return (
    <section className="hero-mesh relative overflow-hidden">
      <div className="hero-dots absolute inset-0 opacity-60" aria-hidden />
      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-3.5 py-12 sm:py-16 lg:grid-cols-2 lg:gap-14 lg:py-20">
        {/* Left column */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="flex flex-col items-start gap-5"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-white/70 px-4 py-1.5 text-xs font-semibold text-primary shadow-sm backdrop-blur dark:bg-white/10">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden />
            {t('hero_badge')}
          </span>

          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            {words.join(' ')}{' '}
            <span className="grad-text-brand">{last}</span>
          </h1>

          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t('hero_sub')}
          </p>

          {/* Search */}
          <form role="search" onSubmit={onSearch} className="flex w-full max-w-lg items-center gap-2">
            <label htmlFor="hero-search" className="sr-only">{t('search')}</label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id="hero-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search_placeholder')}
                className="h-11 w-full rounded-xl border bg-card pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button type="submit" size="lg" className="rounded-xl" aria-label={t('search')}>
              <Search className="h-4 w-4 sm:hidden" aria-hidden />
              <span className="hidden sm:inline">{t('search')}</span>
            </Button>
          </form>

          {/* CTAs */}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" asChild>
              <Link href="/courses">
                {t('hero_cta')}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/suggestions">{t('hero_cta2')}</Link>
            </Button>
          </div>

          {/* Trust row */}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex -space-x-2.5">
              {AVATAR_INITIALS.map((ch, i) => (
                <span
                  key={i}
                  className={`${AVATAR_TONES[i % AVATAR_TONES.length]} flex h-9 w-9 items-center justify-center rounded-full border-2 border-background text-xs font-bold text-white shadow-sm`}
                  aria-hidden
                >
                  {ch}
                </span>
              ))}
            </div>
            <div className="text-sm">
              <span className="grad-text-brand font-bold">{tx('১০,০০০+', '10,000+')}</span>{' '}
              <span className="text-muted-foreground">{t('stats_students')}</span>
            </div>
          </div>
        </motion.div>

        {/* Right column — hero image + floating cards */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative mx-auto w-full max-w-xl"
        >
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border bg-gradient-to-br from-emerald-500/20 via-amber-400/15 to-violet-500/15 p-1.5 shadow-xl">
            <div className="relative h-full w-full overflow-hidden rounded-[1.35rem]">
              <Image
                src="/images/hero.jpg"
                alt={tx('পাঠশালা শিক্ষার্থীরা অনলাইনে শিখছে', 'PathShala students learning online')}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          </div>

          {/* Floating mini-card: success rate */}
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -left-3 top-8 rounded-2xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur sm:-left-6"
            aria-hidden
          >
            <p className="text-lg font-extrabold text-primary">🎯 95%</p>
            <p className="text-xs text-muted-foreground">{tx('সাফল্যের হার', 'Success rate')}</p>
          </motion.div>

          {/* Floating mini-card: rating */}
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
            className="absolute -right-2 bottom-10 rounded-2xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur sm:-right-5"
            aria-hidden
          >
            <p className="flex items-center gap-1 text-lg font-extrabold text-amber-500">
              ⭐ 4.9<span className="text-xs font-semibold text-muted-foreground">/5</span>
            </p>
            <p className="text-xs text-muted-foreground">{tx('রেটিং', 'Rating')}</p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

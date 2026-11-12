'use client'

/**
 * CoverflowHero — the 2nd home hero variant (admin-selected via
 * SiteSetting.heroVariant = 'circular'), replicated SAME-TO-SAME from the
 * pimathclub.com reference (a Swiper carousel, inspected live + measured
 * from the user's 1908px screenshot):
 *
 *   • full-width dark band whose backdrop is the CURRENT slide image,
 *     enlarged + blurred + darkened, crossfading between slides;
 *   • one large sharp 16:9 card in the middle (38.4% of the viewport —
 *     732px @ 1908 in the reference, 733px here), the previous/next
 *     slides flanking it at scale .53 with a clear ~30px GAP (the
 *     reference does NOT overlap them), the 2nd-next/2nd-prev peeking in
 *     from the screen edges (scale .47) — the reference's flat ring;
 *   • neighbours are BRIGHT (brightness .8/.65, full opacity) so the
 *     band reads as a living carousel, not a dark void;
 *   • SWIPER-STYLE MOTION: every slide is a persistent element positioned
 *     by its signed circular offset from the active index, so when the
 *     index moves each card physically GLIDES to its new slot (transform
 *     transition) and its brightness/caption fade accordingly — no
 *     content "popping" between fixed slots like a naive carousel;
 *   • title caption as a bottom strip INSIDE the card, fading in when
 *     the card arrives at the center (the reference bakes its titles
 *     into the banner images — same look, our dynamic titles);
 *   • 8px pagination bullets with a 28×8 elongated active bullet (Swiper
 *     pagination sizes);
 *   • auto-advance (paused on hover/focus, respects reduced-motion),
 *     side cards + dots are clickable, arrow keys work too.
 *
 * Slides = active combos (feature image) + latest published courses
 * (thumbnail), pulled from the existing public APIs. Renders only this
 * hero — it never falls back to the classic hero, so the admin's chosen
 * variant is the ONLY thing a visitor ever sees on first paint.
 */

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { GraduationCap, Sparkles } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useUI } from '@/store/ui-store'
import { apiGet } from '@/lib/api-client'

export interface HeroSlide {
  key: string
  title: string
  image: string
  href: string
  kind: 'COURSE' | 'COMBO'
}

type Slide = HeroSlide

interface CourseLite {
  id: string
  title: string
  slug: string
  thumbnail?: string | null
}

interface ComboLite {
  id: string
  title: string
  imageUrl: string | null
}

const MAX_SLIDES = 14
const AUTO_MS = 4500

/** Ring geometry — replicated from the pimathclub reference (1908px
 *  screenshot cross-checked against the live 1536px inspection): center
 *  card = 38.4vw; ±1 neighbors at scale .53 with a clear 30px gap, ±2 at
 *  .47 (edge slivers). `shift` is the center-to-center distance BEYOND
 *  the card's own half-width, expressed in % of the card width W
 *  (±1 = .5W + .265W + gap, ±2 = ±1 + .265W + gap) so the entire ring
 *  scales linearly with the viewport; the px term added at render time
 *  is the 30px-per-depth inter-slide gap. (A ±3 pair would always sit
 *  past the viewport edge — the reference shows two depths, so we render
 *  exactly two.) */
const RING: Array<{ shift: number; scale: number; brightness: number; z: number; sizes: string }> = [
  { shift: 76.5, scale: 0.53, brightness: 0.8, z: 10, sizes: '24vw' },
  { shift: 129.5, scale: 0.47, brightness: 0.65, z: 5, sizes: '18vw' },
]

export default function CoverflowHero({ initialSlides }: { initialSlides?: HeroSlide[] }) {
  const { tx } = useUI()
  // Server-provided slides (page.tsx bootstrap) render the ring on the very
  // first paint — the center card becomes the LCP WITH a preload link instead
  // of waiting for the client fetch. null still means skeleton (no data).
  const [slides, setSlides] = useState<Slide[] | null>(
    initialSlides && initialSlides.length > 0 ? initialSlides : null,
  )
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = useRef(false)

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      // GET /api/combos → { combos: ComboView[] } (ok-envelope unwrapped by apiGet)
      apiGet<{ combos: ComboLite[] }>('/api/combos')
        .then((d) => d?.combos ?? [])
        .catch(() => [] as ComboLite[]),
      apiGet<CourseLite[]>('/api/courses?limit=14').catch(() => [] as CourseLite[]),
    ]).then(([combos, courses]) => {
      if (cancelled) return
      const comboSlides: Slide[] = (Array.isArray(combos) ? combos : [])
        .filter((c) => c && c.imageUrl)
        .map((c) => ({
          key: `combo-${c.id}`,
          title: c.title,
          image: c.imageUrl as string,
          href: `/combos/${c.id}`,
          kind: 'COMBO',
        }))
      const courseSlides: Slide[] = (Array.isArray(courses) ? courses : [])
        .filter((c) => c && c.thumbnail)
        .map((c) => ({
          key: `course-${c.id}`,
          title: c.title,
          image: c.thumbnail as string,
          href: `/courses/${c.slug}`,
          kind: 'COURSE',
        }))
      const all = [...comboSlides, ...courseSlides].slice(0, MAX_SLIDES)
      setSlides(all)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const count = slides?.length ?? 0

  // Auto-advance (pause on hover/focus, disabled for reduced-motion users).
  useEffect(() => {
    if (paused || reduced.current || count < 2) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), AUTO_MS)
    return () => clearInterval(timer)
  }, [paused, count])

  // Keyboard arrows on the carousel region.
  const onKey = (e: React.KeyboardEvent) => {
    if (count < 2) return
    if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + count) % count)
    if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % count)
  }

  const active = slides && slides.length > 0 ? slides[index % slides.length] : null

  /** Signed circular offset of slide i from the active index, mapped into
   *  [−n/2 … +n/2] so each rendered card is UNIQUE and can persist as one
   *  DOM element while it glides between ring slots. */
  const relOf = (i: number): number => {
    const n = slides?.length ?? 0
    if (n === 0) return 99
    let r = (((i - index) % n) + n) % n
    if (r > n / 2) r -= n
    return r
  }

  /** Backdrop crossfade state: keep the outgoing slide's blurred image
   *  mounted (fading out) while the new one fades in — no dark dip.
   *  Adjusted DURING RENDER (the official React pattern for tracking a
   *  previous value — no effect, no cascading re-render). */
  const [bg, setBg] = useState<{ cur: Slide | null; prev: Slide | null }>({ cur: null, prev: null })
  const [bgKey, setBgKey] = useState<string | null>(null)
  if (active && active.key !== bgKey) {
    setBgKey(active.key)
    setBg((b) => ({ cur: active, prev: b.cur }))
  }

  return (
    <section
      className="relative overflow-hidden bg-[#0b1220]"
      role="region"
      aria-roledescription="carousel"
      aria-label={tx('ফিচার্ড কোর্স ও কম্বো অফার', 'Featured courses and combo offers')}
      onKeyDown={onKey}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* Backdrop — current slide image, enlarged + blurred + darkened,
          crossfading between slides (bright enough to feel colorful, like
          the reference's blur) */}
      <div className="absolute inset-0" aria-hidden>
        {[bg.prev, bg.cur].map((s, layer) =>
          s ? (
            <Image
              key={`${layer}-${s.key}`}
              src={s.image}
              alt=""
              fill
              priority={layer === 1 && bg.prev === null}
              sizes="100vw"
              unoptimized={s.image.startsWith('http')}
              className="scale-110 object-cover blur-2xl transition-opacity duration-700"
              style={{ opacity: layer === 1 ? 0.75 : 0 }}
            />
          ) : null
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/25 to-black/60" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-3.5 py-8 sm:py-14">
        {slides === null ? (
          /* Loading skeleton — same footprint, nothing else flashes */
          <div aria-hidden>
            <Skeleton className="mx-auto aspect-video w-[88vw] rounded-lg bg-white/10 lg:w-[38.4vw]" />
            <div className="mt-3 flex items-center justify-center gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-2 w-2 rounded-full bg-white/20" />
              ))}
            </div>
          </div>
        ) : count === 0 ? (
          /* No image-bearing slides — calm branded band, layout intact */
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="grad-brand flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg">
              <GraduationCap className="h-7 w-7" aria-hidden />
            </span>
            <p className="max-w-md text-sm text-white/80 sm:text-base">
              {tx(
                'পাঠশালার সেরা কোর্স ও কম্বো অফার এক জায়গায় — শেখা শুরু করুন আজই।',
                'The best PathShala courses and combo offers in one place — start learning today.'
              )}
            </p>
            <Link
              href="/courses"
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#0b1220] shadow-lg transition-transform hover:scale-[1.03]"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              {tx('কোর্স দেখুন', 'Browse courses')}
            </Link>
          </div>
        ) : (
          <>
            {/* Ring container = the center card's exact box — 38.4vw on
                desktop exactly like the reference (732px @ 1908, 590px @
                1536), 88vw on mobile (center card only there) */}
            <div className="relative mx-auto aspect-video w-[88vw] lg:w-[38.4vw]">
              {/* Every slide is ONE persistent element keyed by its id —
                  positioned by its signed circular offset from the active
                  index. When `index` changes each card GLIDES to its new
                  slot (transform transition) and dims/brightens on the
                  way — Swiper-style physical motion. */}
              {slides!.map((slide, i) => {
                const rel = relOf(i)
                const depth = Math.abs(rel)
                if (depth > 2) return null // off-screen slot — not rendered
                const cfg = depth === 0 ? null : RING[depth - 1]
                const scale = depth === 0 ? 1 : cfg!.scale
                const sign = rel < 0 ? '-' : '+'
                const shift = depth === 0 ? 0 : cfg!.shift
                const gap = depth * 30
                return (
                  <Link
                    key={slide.key}
                    href={slide.href}
                    aria-label={`${slide.title} — ${tx('দেখুন', 'view')}`}
                    aria-hidden={depth > 0}
                    tabIndex={depth > 0 ? -1 : undefined}
                    className={`absolute left-1/2 top-1/2 w-full ${depth === 0 ? 'block' : 'hidden lg:block'}`}
                    style={{
                      transform: `translate(calc(-50% ${sign} ${shift}% ${sign} ${gap}px), -50%) scale(${scale})`,
                      zIndex: depth === 0 ? 20 : cfg!.z,
                      filter: `brightness(${depth === 0 ? 1 : cfg!.brightness})`,
                      transition:
                        'transform 550ms cubic-bezier(.4,0,.2,1), filter 500ms ease',
                    }}
                  >
                    <span className="relative block aspect-video overflow-hidden rounded-lg shadow-2xl shadow-black/50">
                      <Image
                        src={slide.image}
                        alt={depth === 0 ? slide.title : ''}
                        fill
                        priority={depth === 0}
                        sizes={depth === 0 ? '(max-width: 1024px) 88vw, 38vw' : cfg!.sizes}
                        unoptimized={slide.image.startsWith('http')}
                        className="object-cover"
                      />
                      {/* Title strip INSIDE the card bottom — fades in when
                          the card reaches the center (the reference bakes
                          its banner titles there; same look) */}
                      <span
                        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-2 pt-9 text-center"
                        style={{ opacity: depth === 0 ? 1 : 0, transition: 'opacity 450ms ease' }}
                      >
                        <span
                          className="line-clamp-1 text-sm font-bold text-white sm:text-base lg:text-lg"
                          aria-live={depth === 0 ? 'polite' : undefined}
                        >
                          {slide.title}
                        </span>
                      </span>
                    </span>
                  </Link>
                )
              })}
            </div>

            {/* Pagination bullets — 8px, elongated 28×8 active (Swiper sizes) */}
            <div
              className="mt-3 flex items-center justify-center gap-2 pb-1"
              role="tablist"
              aria-label={tx('স্লাইড নির্বাচন', 'Choose slide')}
            >
              {slides!.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={tx(`স্লাইড ${i + 1}`, `Slide ${i + 1}`)}
                  onClick={() => setIndex(i)}
                  className={`h-2 rounded-full bg-white transition-all duration-300 ${
                    i === index ? 'w-7' : 'w-2 opacity-80 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

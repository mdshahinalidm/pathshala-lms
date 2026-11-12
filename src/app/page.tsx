/**
 * Page "/" — thin SERVER wrapper around the hash-routed SpaRoot.
 *
 * It reads a few tiny pieces of home data straight from the DB on every
 * request (SQLite, ~1ms each, one parallel batch — the page stays super fast)
 * and hands them to the client SPA:
 *
 *  • heroVariant — the admin-selected home hero ('classic' = 1st hero,
 *    'circular' = 2nd coverflow hero). Because the variant is resolved on the
 *    SERVER, the very first paint already renders the chosen hero: the other
 *    hero can never flash, not for a single frame.
 *  • active admin-curated testimonials for the home "শিক্ষার্থীদের
 *    মতামত" section — empty list = the section keeps showing real reviews.
 *  • real public counters (published courses, approved reviews) so the home
 *    and about stat strips show TRUE numbers on the very first paint — no
 *    placeholder counts, no extra network round-trip.
 *
 * Everything else (hash routing, auth gates, all views) is unchanged inside
 * SpaRoot — it moved verbatim from this file to src/components/app-spa-root.tsx.
 */
import { db } from '@/lib/db'
import SpaRoot from '@/components/app-spa-root'
import type { HeroSlide } from '@/components/views/heroes/coverflow-hero'

export const dynamic = 'force-dynamic'

interface CuratedTestimonial {
  id: string
  name: string
  role: string
  roleEn: string
  comment: string
  photoUrl: string | null
  rating: number
}

export interface RealStats {
  /** Admin override for the students counter — null = marketing default. */
  students: number | null
  /** Admin override for the video-hours counter — null = marketing default. */
  hours: number | null
  /** Published courses — admin override when set, else the real count. */
  courses: number
  /** Approved reviews — admin override when set, else the real count. */
  reviews: number
}

async function loadHomeBootstrap(): Promise<{
  heroVariant: string
  testimonials: CuratedTestimonial[]
  stats: RealStats
  heroSlides: HeroSlide[]
}> {
  try {
    const [settings, testimonials, courses, reviews, combos, heroCourses] = await Promise.all([
      db.siteSetting.findUnique({
        where: { id: 'singleton' },
        select: {
          heroVariant: true,
          statStudents: true,
          statCourses: true,
          statHours: true,
          statReviews: true,
        },
      }),
      db.testimonial.findMany({
        where: { isActive: true },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          role: true,
          roleEn: true,
          comment: true,
          photoUrl: true,
          rating: true,
        },
        take: 12,
      }),
      // Real public counters — the stat-strip defaults.
      db.course.count({ where: { isPublished: true } }),
      db.review.count({ where: { isApproved: true } }),
      // Coverflow hero slides — EXACT same shapes the client fetch would
      // produce (/api/combos + /api/courses?limit=14), read here so the ring
      // and its center image exist on the first paint (LCP + preload).
      db.combo.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, imageUrl: true },
      }),
      db.course.findMany({
        where: { isPublished: true },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, slug: true, thumbnail: true },
        take: 14,
      }),
    ])
    const comboSlides: HeroSlide[] = combos
      .filter((c) => c && c.imageUrl)
      .map((c) => ({
        key: `combo-${c.id}`,
        title: c.title,
        image: c.imageUrl as string,
        href: `/combos/${c.id}`,
        kind: 'COMBO' as const,
      }))
    const courseSlides: HeroSlide[] = heroCourses
      .filter((c) => c && c.thumbnail)
      .map((c) => ({
        key: `course-${c.id}`,
        title: c.title,
        image: c.thumbnail as string,
        href: `/courses/${c.slug}`,
        kind: 'COURSE' as const,
      }))
    return {
      heroVariant: settings?.heroVariant ?? 'classic',
      testimonials,
      stats: {
        students: settings?.statStudents ?? null,
        hours: settings?.statHours ?? null,
        courses: settings?.statCourses ?? courses,
        reviews: settings?.statReviews ?? reviews,
      },
      heroSlides: [...comboSlides, ...courseSlides].slice(0, 14),
    }
  } catch {
    // DB unavailable → safe defaults (classic hero, no curated testimonials,
    // stats fall back to the previous client-side display values)
    return {
      heroVariant: 'classic',
      testimonials: [],
      stats: { students: null, hours: null, courses: 0, reviews: 0 },
      heroSlides: [],
    }
  }
}

export default async function Page() {
  const { heroVariant, testimonials, stats, heroSlides } = await loadHomeBootstrap()
  return (
    <SpaRoot
      initialHeroVariant={heroVariant}
      curatedTestimonials={testimonials}
      initialStats={stats}
      initialHeroSlides={heroSlides}
    />
  )
}

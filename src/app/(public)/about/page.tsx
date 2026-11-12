/**
 * Page "/about" — thin SERVER wrapper around AboutView.
 *
 * Reads the same admin-overridable stat counters as the home page
 * (SiteSetting.statStudents/statCourses/statHours/statReviews + the real
 * published-course / approved-review counts) so the About stat strip shows
 * the admin's numbers — or the automatic real ones when no override is set —
 * on the very first paint.
 */
import type { Metadata } from 'next'
import { db } from '@/lib/db'
import AboutView from '@/components/views/about-view'

export const dynamic = 'force-dynamic'

// Unique per-page metadata: /about previously inherited the root
// default title — the exact same <title> as the home page — which the SEO
// audit flags as duplicate titles (keyword cannibalisation). A distinct
// title/description gives Google one page per intent.
export const metadata: Metadata = {
  // rendered: "আমাদের সম্পর্ক | About Us | পাঠশালা PathShala" (≤65 chars)
  title: 'আমাদের সম্পর্ক | About Us',
  description:
    'পাঠশালা সম্পর্কে জানুন — বাংলাদেশের অনলাইন লার্নিং প্ল্যাটফর্ম। SSC, HSC ও অনার্স শিক্ষার্থীদের জন্য সেরা কোর্স, লাইভ পরীক্ষা কেন্দ্র ও ফ্রি সাজেশন।',
}

export interface AboutPageStats {
  students: number | null
  hours: number | null
  courses: number
  reviews: number
}

async function loadAboutStats(): Promise<AboutPageStats | undefined> {
  try {
    const [settings, courses, reviews] = await Promise.all([
      db.siteSetting.findUnique({
        where: { id: 'singleton' },
        select: {
          statStudents: true,
          statCourses: true,
          statHours: true,
          statReviews: true,
        },
      }),
      // Real public counters — the stat-strip defaults.
      db.course.count({ where: { isPublished: true } }),
      db.review.count({ where: { isApproved: true } }),
    ])
    return {
      students: settings?.statStudents ?? null,
      hours: settings?.statHours ?? null,
      courses: settings?.statCourses ?? courses,
      reviews: settings?.statReviews ?? reviews,
    }
  } catch {
    // DB unavailable → AboutView keeps its previous display defaults.
    return undefined
  }
}

export default async function AboutPage() {
  const stats = await loadAboutStats()
  return <AboutView initialStats={stats} />
}

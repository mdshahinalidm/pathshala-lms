import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { JsonLd } from '@/components/seo/json-ld'
import CourseDetailView from '@/components/views/course-detail-view'
import { serverOrigin } from '@/lib/site-origin'

type Props = { params: Promise<{ slug: string }> }

const COURSE_SELECT = {
  title: true,
  titleEn: true,
  subtitle: true,
  description: true,
  slug: true,
  thumbnail: true,
  price: true,
  discountPrice: true,
  isPublished: true,
} as const

function findCourse(slug: string) {
  return db.course.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    select: COURSE_SELECT,
  })
}

/** SEO metadata straight from the DB (param may be a slug or a course id). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const course = await findCourse(slug)
    if (course) {
      // Document title ≤65 chars (Google SERP best practice): the layout
      // template appends " | পাঠশালা PathShala" (20 chars), so the course
      // part stays ≤45. OpenGraph keeps the full title — no limit there.
      const fullTitle = course.title
      const docTitle =
        fullTitle.length <= 45 ? fullTitle : fullTitle.slice(0, 44).trimEnd() + '…'
      const description =
        course.subtitle?.trim() || course.description.trim().slice(0, 160) || course.title
      const image = course.thumbnail || '/images/og-image.jpg'
      return {
        title: docTitle,
        description,
        // canonical points at the canonical slug URL even when visited by id
        alternates: { canonical: `/courses/${course.slug}` },
        openGraph: {
          title: fullTitle,
          description,
          type: 'article',
          url: `/courses/${course.slug}`,
          images: [{ url: image, alt: course.title }],
        },
        twitter: { card: 'summary_large_image', title: fullTitle, description, images: [image] },
        // unpublished courses shouldn't be indexed (page still renders/preview)
        ...(course.isPublished ? {} : { robots: { index: false, follow: false } }),
      }
    }
  } catch {
    /* fall through to default */
  }
  return { title: 'কোর্স ডিটেইলস | Course Details' }
}

export default async function CourseDetailPage({ params }: Props) {
  const { slug } = await params
  // origin follows the actual request host (any domain auto-sync).
  const base = await serverOrigin()

  let courseLd: Record<string, unknown> | null = null
  let breadcrumbLd: Record<string, unknown> | null = null
  let courseTitle: string | null = null
  try {
    const course = await findCourse(slug)
    if (course) {
      courseTitle = course.title
      const courseUrl = `${base}/courses/${course.slug}`
      courseLd = {
        '@context': 'https://schema.org',
        '@type': 'Course',
        name: course.title,
        ...(course.titleEn ? { alternateName: course.titleEn } : {}),
        description: course.description.trim() || course.subtitle?.trim() || course.title,
        url: courseUrl,
        inLanguage: 'bn',
        provider: { '@type': 'Organization', name: 'PathShala', url: base },
        offers: {
          '@type': 'Offer',
          price: course.discountPrice ?? course.price,
          priceCurrency: 'BDT',
          availability: course.isPublished
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          url: courseUrl,
        },
      }
      breadcrumbLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'হোম', item: base },
          { '@type': 'ListItem', position: 2, name: 'কোর্স', item: `${base}/courses` },
          { '@type': 'ListItem', position: 3, name: course.title, item: courseUrl },
        ],
      }
    }
  } catch {
    // DB unavailable → render the page without structured data
  }

  return (
    <>
      {courseLd && <JsonLd data={courseLd} />}
      {breadcrumbLd && <JsonLd data={breadcrumbLd} />}
      {/* Google SEO rule: exactly one H1 per page. CourseDetailView renders a
          loading skeleton server-side (client fetch afterwards), so the page
          H1 lives here — server-rendered in the raw HTML, visually hidden. */}
      {courseTitle ? <h1 className="sr-only">{courseTitle} | পাঠশালা PathShala</h1> : null}
      <CourseDetailView courseId={slug} />
    </>
  )
}

import { Suspense } from 'react'
import type { Metadata } from 'next'
import CatalogView from '@/components/views/catalog-view'
import { JsonLd } from '@/components/seo/json-ld'
import { db } from '@/lib/db'
import { serverOrigin } from '@/lib/site-origin'

// Dynamic rendering: search params are read client-side (useSearchParams);
// rendering dynamically keeps the RSC payload inline so hydration is a single
// pass and persisted-language rehydration can never race it.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const title = 'সব কোর্স | All Courses'
  const description =
    'এসএসসি, এইচএসসি, ভর্তি পরীক্ষা ও স্কিল ডেভেলপমেন্ট — সব কোর্স এক জায়গায়। Browse all PathShala courses with filters, search and categories.'
  return {
    title,
    description,
    alternates: { canonical: '/courses' },
    openGraph: { title, description, type: 'website', url: '/courses' },
  }
}

/** ItemList structured data for all published courses (fails silent). */
async function CourseItemList() {
  let itemList: Record<string, unknown> | null = null
  try {
    // origin follows the actual request host (any domain auto-sync).
    const base = await serverOrigin()
    const courses = await db.course.findMany({
      where: { isPublished: true },
      select: { title: true, slug: true },
      orderBy: { createdAt: 'asc' },
    })
    itemList = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'সব কোর্স | All Courses',
      numberOfItems: courses.length,
      itemListElement: courses.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.title,
        url: `${base}/courses/${c.slug}`,
      })),
    }
  } catch {
    return null
  }
  return <JsonLd data={itemList} />
}

export default function CoursesPage() {
  return (
    <>
      <Suspense fallback={null}>
        <CourseItemList />
      </Suspense>
      <Suspense fallback={null}>
        <CatalogView />
      </Suspense>
    </>
  )
}

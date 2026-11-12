import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { JsonLd } from '@/components/seo/json-ld'
import ComboDetailView from '@/components/views/combo-detail-view'
import { serverOrigin } from '@/lib/site-origin'

type Props = { params: Promise<{ id: string }> }

/** SEO metadata straight from the DB (active combos only). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  try {
    const combo = await db.combo.findFirst({
      where: { id, isActive: true },
      select: { title: true, description: true, imageUrl: true, price: true },
    })
    if (combo) {
      const title = combo.title
      const description =
        combo.description.trim().slice(0, 160) ||
        `কম্বো অফার — ${combo.title} একসাথে কিনলেই বেশি সাশ্রয়।`
      const image = combo.imageUrl || '/images/og-image.jpg'
      return {
        title,
        description,
        alternates: { canonical: `/combos/${id}` },
        openGraph: {
          title,
          description,
          type: 'article',
          url: `/combos/${id}`,
          images: [{ url: image, alt: combo.title }],
        },
        twitter: { card: 'summary_large_image', title, description, images: [image] },
      }
    }
  } catch {
    /* fall through to default */
  }
  return { title: 'কম্বো ডিটেইলস | Combo Details', robots: { index: false, follow: false } }
}

export default async function ComboDetailPage({ params }: Props) {
  const { id } = await params
  // origin follows the actual request host (any domain auto-sync).
  const base = await serverOrigin()

  let productLd: Record<string, unknown> | null = null
  let breadcrumbLd: Record<string, unknown> | null = null
  try {
    const combo = await db.combo.findFirst({
      where: { id, isActive: true },
      select: { title: true, description: true, imageUrl: true, price: true },
    })
    if (combo) {
      const comboUrl = `${base}/combos/${id}`
      productLd = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: combo.title,
        description: combo.description.trim() || combo.title,
        url: comboUrl,
        inLanguage: 'bn',
        ...(combo.imageUrl ? { image: combo.imageUrl.startsWith('http') ? combo.imageUrl : `${base}${combo.imageUrl}` } : {}),
        brand: { '@type': 'Organization', name: 'PathShala', url: base },
        offers: {
          '@type': 'Offer',
          price: combo.price,
          priceCurrency: 'BDT',
          availability: 'https://schema.org/InStock',
          url: comboUrl,
        },
      }
      breadcrumbLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'হোম', item: base },
          { '@type': 'ListItem', position: 2, name: 'কম্বো অফার', item: `${base}/combos` },
          { '@type': 'ListItem', position: 3, name: combo.title, item: comboUrl },
        ],
      }
    }
  } catch {
    // DB unavailable → render the page without structured data
  }

  return (
    <>
      {productLd && <JsonLd data={productLd} />}
      {breadcrumbLd && <JsonLd data={breadcrumbLd} />}
      <ComboDetailView comboId={id} />
    </>
  )
}

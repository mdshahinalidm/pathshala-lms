import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { JsonLd } from '@/components/seo/json-ld'
import NoticeDetailView from '@/components/views/notice-detail-view'
import { serverOrigin } from '@/lib/site-origin'

type Props = { params: Promise<{ id: string }> }

function findNotice(id: string) {
  return db.notice.findUnique({ where: { id } })
}

/** SEO metadata straight from the DB for each notice. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const notice = await findNotice(id).catch(() => null)
  // Resolve not-found HERE (before streaming starts) so the response
  // carries a real 404 status. NOTE: notFound() throws — never wrap it
  // in a try/catch, and the DB read's error is normalized to null above.
  if (!notice) notFound()

  const title = notice.title
  const description = notice.body.trim().slice(0, 160) || notice.title
  const image = notice.imageUrl || '/images/og-image.jpg'
  const published = notice.createdAt.toISOString()
  return {
    title: `${title} | নোটিশ`,
    description,
    alternates: { canonical: `/notices/${notice.id}` },
    openGraph: {
      title,
      description,
      type: 'article',
      url: `/notices/${notice.id}`,
      images: [{ url: image, alt: title }],
      publishedTime: published,
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export const dynamic = 'force-dynamic'

export default async function NoticeDetailPage({ params }: Props) {
  const { id } = await params
  const notice = await findNotice(id).catch(() => null)
  if (!notice) notFound()

  const related = await db.notice
    .findMany({
      where: { id: { not: notice.id } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true, type: true, createdAt: true },
    })
    .catch(() => [])

  // origin follows the actual request host (any domain auto-sync).
  const base = await serverOrigin()

  const url = `${base}/notices/${notice.id}`

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: notice.title,
          articleBody: notice.body,
          datePublished: notice.createdAt.toISOString(),
          image: notice.imageUrl ? `${base}${notice.imageUrl}` : `${base}/images/og-image.jpg`,
          mainEntityOfPage: url,
          publisher: { '@type': 'Organization', name: 'পাঠশালা | PathShala' },
        }}
      />
      <NoticeDetailView
        notice={{
          id: notice.id,
          title: notice.title,
          body: notice.body,
          type: notice.type as 'URGENT' | 'GENERAL' | 'EVENT',
          isBanner: notice.isBanner,
          imageUrl: notice.imageUrl,
          pdfUrl: notice.pdfUrl,
          pdfName: notice.pdfName,
          createdAt: notice.createdAt.toISOString(),
        }}
        related={related.map((r) => ({
          id: r.id,
          title: r.title,
          type: r.type as 'URGENT' | 'GENERAL' | 'EVENT',
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </>
  )
}

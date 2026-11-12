/**
 * Page "/admin/seo-center/technical" — 41 Technical SEO live checks (Google-rules complete, engine v3).
 */
import type { Metadata } from 'next'
import { SeoTechnicalView } from '@/components/views/admin/seo-center-view'

export const metadata: Metadata = { title: 'টেকনিক্যাল SEO' }

export default function AdminSeoTechnicalPage() {
  return <SeoTechnicalView />
}

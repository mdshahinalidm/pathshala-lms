/**
 * Page "/admin/seo-center/on-page" — 27 On-Page SEO live checks (Google-rules complete, engine v3).
 */
import type { Metadata } from 'next'
import { SeoOnPageView } from '@/components/views/admin/seo-center-view'

export const metadata: Metadata = { title: 'অন-পেজ SEO' }

export default function AdminSeoOnPagePage() {
  return <SeoOnPageView />
}

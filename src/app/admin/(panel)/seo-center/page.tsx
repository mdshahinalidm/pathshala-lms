/**
 * Page "/admin/seo-center" — SEO Center Overview (real-time analytics).
 */
import type { Metadata } from 'next'
import { SeoOverviewView } from '@/components/views/admin/seo-center-view'

export const metadata: Metadata = { title: 'SEO সেন্টার' }

export default function AdminSeoCenterPage() {
  return <SeoOverviewView />
}

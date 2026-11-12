/**
 * Page "/admin/seo-center/sitemap-robots" — exact sitemap.xml + robots.txt viewer.
 */
import type { Metadata } from 'next'
import { SeoSitemapRobotsView } from '@/components/views/admin/seo-center-view'

export const metadata: Metadata = { title: 'সাইটম্যাপ ও Robots' }

export default function AdminSeoSitemapRobotsPage() {
  return <SeoSitemapRobotsView />
}

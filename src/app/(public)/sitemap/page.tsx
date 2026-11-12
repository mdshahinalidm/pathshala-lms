/**
 * Page "/sitemap" — human-readable URL directory for Google Search Console.
 *
 * Lists EVERY public URL (static pages, published courses, active combos,
 * notices, mini tools, policy pages) grouped by section with absolute URLs
 * and one-click copy — so the whole set can be pasted into GSC
 * (URL Inspection / sitemap submission) for instant crawling & indexing.
 * Mirrors /sitemap.xml exactly (both are generated from the same data).
 */
import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { SitemapView, type SitemapSection } from '@/components/views/sitemap-view'
import { serverOrigin } from '@/lib/site-origin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'সাইটম্যাপ | Sitemap',
  description:
    'পাঠশালার সব পাবলিক পেজের URL তালিকা — কোর্স, পরীক্ষা, কম্বো, নোটিশ, টুলস ও পলিসি পেজ। Google Search Console-এ সাবমিট করার জন্য প্রস্তুত।',
}

async function loadSections(): Promise<SitemapSection[]> {
  // origin follows the actual request host (any domain auto-sync).
  const b = await serverOrigin()

  const staticSection: SitemapSection = {
    key: 'main',
    titleBn: 'প্রধান পেজ',
    titleEn: 'Main Pages',
    urls: [
      { path: '/', titleBn: 'হোম', titleEn: 'Home', priority: 1.0, freq: 'daily' },
      { path: '/courses', titleBn: 'কোর্সসমূহ', titleEn: 'All Courses', priority: 0.9, freq: 'daily' },
      { path: '/exams', titleBn: 'পরীক্ষা', titleEn: 'Exams', priority: 0.9, freq: 'daily' },
      { path: '/questions', titleBn: 'প্রশ্নব্যাংক', titleEn: 'Question Bank', priority: 0.8, freq: 'daily' },
      { path: '/notices', titleBn: 'নোটিশ', titleEn: 'Notices', priority: 0.7, freq: 'weekly' },
      { path: '/suggestions', titleBn: 'সাজেশন', titleEn: 'Suggestions', priority: 0.7, freq: 'weekly' },
      { path: '/sitemap', titleBn: 'সাইটম্যাপ (এই পেজ)', titleEn: 'Sitemap (this page)', priority: 0.6, freq: 'weekly' },
    ],
  }

  const toolsSection: SitemapSection = {
    key: 'tools',
    titleBn: 'মিনি টুলস',
    titleEn: 'Mini Tools',
    urls: [
      { path: '/tools/gpa-calculator', titleBn: 'GPA ক্যালকুলেটর', titleEn: 'GPA Calculator', priority: 0.7, freq: 'monthly' },
      { path: '/tools/cgpa-calculator', titleBn: 'CGPA ক্যালকুলেটর', titleEn: 'CGPA Calculator', priority: 0.7, freq: 'monthly' },
      { path: '/tools/percentage-gpa', titleBn: 'শতকরা ↔ GPA', titleEn: 'Percentage ↔ GPA', priority: 0.7, freq: 'monthly' },
    ],
  }

  const policySection: SitemapSection = {
    key: 'policy',
    titleBn: 'পলিসি ও তথ্য পেজ',
    titleEn: 'Policy & Info Pages',
    urls: [
      { path: '/about', titleBn: 'আমাদের সম্পর্কে', titleEn: 'About Us', priority: 0.5, freq: 'monthly' },
      { path: '/contact', titleBn: 'যোগাযোগ করুন', titleEn: 'Contact Us', priority: 0.5, freq: 'monthly' },
      { path: '/verify', titleBn: 'সার্টিফিকেট ভেরিফিকেশন', titleEn: 'Certificate Verification', priority: 0.4, freq: 'monthly' },
      { path: '/privacy-policy', titleBn: 'প্রাইভেসি পলিসি', titleEn: 'Privacy Policy', priority: 0.3, freq: 'yearly' },
      { path: '/terms', titleBn: 'শর্তাবলী', titleEn: 'Terms & Conditions', priority: 0.3, freq: 'yearly' },
    ],
  }

  try {
    const [courses, combos, notices] = await Promise.all([
      db.course.findMany({
        where: { isPublished: true },
        select: { slug: true, title: true, titleEn: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      db.combo.findMany({
        where: { isActive: true },
        select: { id: true, title: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      db.notice.findMany({
        select: { id: true, title: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ])

    const courseSection: SitemapSection = {
      key: 'courses',
      titleBn: 'কোর্স পেজ',
      titleEn: 'Course Pages',
      urls: courses.map((c) => ({
        path: `/courses/${c.slug}`,
        titleBn: c.title,
        titleEn: c.titleEn || c.title,
        priority: 0.8,
        freq: 'weekly' as const,
        lastModified: c.updatedAt.toISOString(),
      })),
    }

    const comboSection: SitemapSection = {
      key: 'combos',
      titleBn: 'কম্বো অফার',
      titleEn: 'Combo Offers',
      urls: combos.map((c) => ({
        path: `/combos/${c.id}`,
        titleBn: c.title,
        titleEn: c.title,
        priority: 0.7,
        freq: 'weekly' as const,
        lastModified: c.updatedAt.toISOString(),
      })),
    }

    const noticeSection: SitemapSection = {
      key: 'notices',
      titleBn: 'নোটিশ পেজ',
      titleEn: 'Notice Pages',
      urls: notices.map((n) => ({
        path: `/notices/${n.id}`,
        titleBn: n.title,
        titleEn: n.title,
        priority: 0.5,
        freq: 'monthly' as const,
        lastModified: n.createdAt.toISOString(),
      })),
    }

    return [staticSection, courseSection, comboSection, noticeSection, toolsSection, policySection].filter(
      (s) => s.urls.length > 0
    )
  } catch {
    // DB unavailable → static sections only
    return [staticSection, toolsSection, policySection]
  }
}

export default async function SitemapPage() {
  const [sections, origin] = await Promise.all([loadSections(), serverOrigin()])
  return <SitemapView sections={sections} base={origin} />
}

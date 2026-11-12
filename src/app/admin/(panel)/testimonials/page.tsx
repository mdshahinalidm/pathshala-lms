import type { Metadata } from 'next'
import AdminTestimonialsView from '@/components/views/admin/testimonials-view'

export const metadata: Metadata = {
  title: 'টেস্টিমোনিয়াল | Testimonials — পাঠশালা অ্যাডমিন',
}

/**
 * admin-curated testimonials — the home page's "শিক্ষার্থীদের
 * মতামত" section shows these when at least one exists.
 */
export default function AdminTestimonialsPage() {
  return <AdminTestimonialsView />
}

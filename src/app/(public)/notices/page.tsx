import type { Metadata } from 'next'
import NoticesView from '@/components/views/notices-view'

export const metadata: Metadata = {
  title: 'নোটিশ বোর্ড | Notice Board',
  description:
    'জরুরি, সাধারণ ও ইভেন্ট নোটিশ — পাঠশালা নোটিশ বোর্ড। Urgent, general and event notices from PathShala.',
  keywords: ['নোটিশ', 'notice board', 'পরীক্ষার নোটিশ', 'exam notice'],
  alternates: { canonical: '/notices' },
  openGraph: {
    title: 'নোটিশ বোর্ড | Notice Board — পাঠশালা',
    description: 'সর্বশেষ নোটিশ ও ঘোষণা — পাঠশালা নোটিশ বোর্ড।',
    type: 'website',
    url: '/notices',
  },
}

export default function NoticesPage() {
  return <NoticesView />
}

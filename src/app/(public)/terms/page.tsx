import type { Metadata } from 'next'
import { TermsView } from '@/components/views/legal-views'

export const metadata: Metadata = {
  title: 'শর্তাবলী | Terms & Conditions',
  description:
    'পাঠশালা ব্যবহারের শর্তাবলী — কোর্স, পেমেন্ট ও অ্যাকাউন্ট সংক্রান্ত নীতিমালা। Terms for using PathShala.',
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  return <TermsView />
}

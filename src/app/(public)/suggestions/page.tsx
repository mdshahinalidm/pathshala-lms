import type { Metadata } from 'next'
import SuggestionsView from '@/components/views/suggestions-view'

export const metadata: Metadata = {
  title: 'সাজেশন ও রিসোর্স | Suggestions & Resources',
  description:
    'ফ্রি ও পেইড সাজেশন, পিডিএফ ও স্টাডি ম্যাটেরিয়াল ডাউনলোড করুন। Free and paid exam suggestions, PDFs and study materials.',
  keywords: ['সাজেশন', 'suggestion', 'পিডিএফ ডাউনলোড', 'PDF download', 'স্টাডি ম্যাটেরিয়াল'],
  alternates: { canonical: '/suggestions' },
  openGraph: {
    title: 'সাজেশন ও রিসোর্স | Suggestions & Resources — পাঠশালা',
    description: 'পরীক্ষার সেরা সাজেশন ও স্টাডি ম্যাটেরিয়াল — ফ্রি ডাউনলোড করুন।',
    type: 'website',
    url: '/suggestions',
  },
}

export default function SuggestionsPage() {
  return <SuggestionsView />
}

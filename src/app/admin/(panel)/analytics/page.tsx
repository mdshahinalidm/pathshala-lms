import type { Metadata } from 'next'
import AnalyticsView from '@/components/views/admin/analytics-view'

export const metadata: Metadata = {
  title: 'অ্যানালিটিক্স | Analytics — পাঠশালা অ্যাডমিন',
}

/**
 * dedicated Analytics page — ড্যাশবোর্ডে ডুপ্লিকেট হিসেবে দেখানো
 * বিশ্লেষণ সেকশনগুলো এখন এখানে (সাইডবারে শিক্ষার্থীর ঠিক নিচে)।
 */
export default function AdminAnalyticsPage() {
  return <AnalyticsView />
}

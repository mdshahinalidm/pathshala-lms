import type { Metadata } from 'next'
import MySuggestionsView from '@/components/views/dashboard/my-suggestions-view'

export const metadata: Metadata = {
  title: 'আমার সাজেশন | My Suggestions — পাঠশালা',
}

export default function DashboardSuggestionsPage() {
  return <MySuggestionsView />
}

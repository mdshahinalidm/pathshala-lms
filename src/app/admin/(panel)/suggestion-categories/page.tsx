import type { Metadata } from 'next'
import AdminSuggestionCategoriesView from '@/components/views/admin/suggestion-categories-view'

export const metadata: Metadata = {
  title: 'সাজেশন ক্যাটাগরি | Suggestion Categories — পাঠশালা অ্যাডমিন',
}

export default function AdminSuggestionCategoriesPage() {
  return <AdminSuggestionCategoriesView />
}

import type { Metadata } from 'next'
import AdminPurchasesView from '@/components/views/admin/purchases-view'

export const metadata: Metadata = {
  title: 'সাজেশন ক্রয় | Suggestion Purchases — পাঠশালা অ্যাডমিন',
}

export default function AdminPurchasesPage() {
  return <AdminPurchasesView />
}

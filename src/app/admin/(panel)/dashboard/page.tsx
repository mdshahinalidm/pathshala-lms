import type { Metadata } from 'next'
import DashboardView from '@/components/views/admin/dashboard-view'

export const metadata: Metadata = {
  title: 'অ্যাডমিন ড্যাশবোর্ড | Admin Analytics',
}

export default function AdminDashboardPage() {
  return <DashboardView />
}

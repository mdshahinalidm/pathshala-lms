import type { Metadata } from 'next'
import DashboardNoticesView from '@/components/views/dashboard/notices-view'

export const metadata: Metadata = {
  title: 'নোটিশ বোর্ড | Notice Board — পাঠশালা',
}

export default function DashboardNoticesPage() {
  return <DashboardNoticesView />
}

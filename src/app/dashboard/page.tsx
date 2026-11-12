import type { Metadata } from 'next'
import MyCoursesView from '@/components/views/dashboard/my-courses-view'

export const metadata: Metadata = {
  title: 'মাই কোর্স | My Courses',
}

export default function DashboardPage() {
  return <MyCoursesView />
}

import type { Metadata } from 'next'
import LiveClassesView from '@/components/views/dashboard/live-classes-view'

export const metadata: Metadata = {
  title: 'লাইভ ক্লাস | Live Classes',
}

export default function DashboardLivePage() {
  return <LiveClassesView />
}

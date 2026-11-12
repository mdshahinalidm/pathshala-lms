import { Suspense } from 'react'
import WrittenResultsView from '@/components/views/dashboard/written-results-view'

export const metadata = { title: 'রেজাল্ট — পাঠশালা' }

/** /dashboard/results — student "My Results" (published written exams). */
export default function DashboardResultsPage() {
  return (
    <Suspense fallback={null}>
      <WrittenResultsView />
    </Suspense>
  )
}

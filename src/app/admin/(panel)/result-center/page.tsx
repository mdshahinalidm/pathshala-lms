import { Suspense } from 'react'
import ResultCenterView from '@/components/views/admin/result-center-view'

/** /admin/result-center — grade written exams & publish results. */
export default function AdminResultCenterPage() {
  return (
    <Suspense fallback={null}>
      <ResultCenterView />
    </Suspense>
  )
}

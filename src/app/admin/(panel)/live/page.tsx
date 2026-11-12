import { Suspense } from 'react'
import AdminLiveClassesView from '@/components/views/admin/live-classes-view'

export default function AdminLiveClassesPage() {
  return (
    <Suspense fallback={null}>
      <AdminLiveClassesView />
    </Suspense>
  )
}

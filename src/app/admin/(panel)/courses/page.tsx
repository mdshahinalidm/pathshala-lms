import { Suspense } from 'react'
import AdminCoursesView from '@/components/views/admin/courses-view'

export default function AdminCoursesPage() {
  return (
    <Suspense fallback={null}>
      <AdminCoursesView />
    </Suspense>
  )
}

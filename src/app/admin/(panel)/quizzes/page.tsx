import { Suspense } from 'react'
import AdminQuizzesView from '@/components/views/admin/quizzes-view'

export default function AdminQuizzesPage() {
  return (
    <Suspense fallback={null}>
      <AdminQuizzesView mode="QUIZ" />
    </Suspense>
  )
}

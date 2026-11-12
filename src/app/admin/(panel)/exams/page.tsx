import { Suspense } from 'react'
import AdminQuizzesView from '@/components/views/admin/quizzes-view'

/** /admin/exams — live EXAM manager (same engine as quizzes, type=EXAM). */
export default function AdminExamsPage() {
  return (
    <Suspense fallback={null}>
      <AdminQuizzesView mode="EXAM" />
    </Suspense>
  )
}

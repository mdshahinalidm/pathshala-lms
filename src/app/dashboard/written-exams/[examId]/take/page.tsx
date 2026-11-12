import { Suspense } from 'react'
import WrittenExamTakeView from '@/components/views/dashboard/written-exam-take-view'

/** /dashboard/written-exams/[examId]/take — the exam room (server timer + upload). */
export default function DashboardWrittenExamTakePage({ params }: { params: Promise<{ examId: string }> }) {
  return (
    <Suspense fallback={null}>
      <TakePageInner params={params} />
    </Suspense>
  )
}

async function TakePageInner({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  return <WrittenExamTakeView examId={examId} />
}

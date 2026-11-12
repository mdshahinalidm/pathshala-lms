import { Suspense } from 'react'
import WrittenResultDetailView from '@/components/views/dashboard/written-result-detail-view'

/** /dashboard/results/[submissionId] — one published result + evaluated sheets. */
export default function DashboardResultDetailPage({ params }: { params: Promise<{ submissionId: string }> }) {
  return (
    <Suspense fallback={null}>
      <ResultPageInner params={params} />
    </Suspense>
  )
}

async function ResultPageInner({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params
  return <WrittenResultDetailView submissionId={submissionId} />
}

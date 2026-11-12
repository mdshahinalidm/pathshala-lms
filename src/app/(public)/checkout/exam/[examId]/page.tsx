import type { Metadata } from 'next'
import ExamCheckoutView from '@/components/views/checkout/exam-checkout-view'

export const metadata: Metadata = {
  title: 'পরীক্ষা চেকআউট | Exam Checkout — পাঠশালা',
  robots: { index: false, follow: false },
}

export default async function ExamCheckoutPage({
  params,
}: {
  params: Promise<{ examId: string }>
}) {
  const { examId } = await params
  return <ExamCheckoutView examId={examId} />
}

import WrittenExamRunnerView from '@/components/views/dashboard/written-exam-runner-view'

export const metadata = { title: 'লিখিত পরীক্ষা চলছে | Written Exam — পাঠশালা' }

export default async function WrittenExamRunnerPage({
  params,
}: {
  params: Promise<{ examId: string }>
}) {
  const { examId } = await params
  return <WrittenExamRunnerView attemptId={examId} />
}

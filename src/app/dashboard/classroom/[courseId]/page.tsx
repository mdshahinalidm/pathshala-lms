import ClassroomView from '@/components/views/dashboard/classroom-view'

export default async function ClassroomPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  return <ClassroomView courseId={courseId} />
}

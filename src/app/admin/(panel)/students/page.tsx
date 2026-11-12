import type { Metadata } from 'next'
import AdminStudentsView from '@/components/views/admin/students-view'

export const metadata: Metadata = {
  title: 'শিক্ষার্থী | Students — পাঠশালা অ্যাডমিন',
}

export default function AdminStudentsPage() {
  return <AdminStudentsView />
}

import { Suspense } from 'react'
import AdminMediaLibraryView from '@/components/views/admin/media-library-view'

export const metadata = { title: 'মিডিয়া লাইব্রেরি | Media Library — পাঠশালা Admin' }

export default function AdminMediaLibraryPage() {
  return (
    <Suspense fallback={null}>
      <AdminMediaLibraryView />
    </Suspense>
  )
}

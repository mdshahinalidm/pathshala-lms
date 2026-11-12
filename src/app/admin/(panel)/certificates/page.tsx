import { Suspense } from 'react'
import AdminCertificatesView from '@/components/views/admin/certificates-view'

export default function AdminCertificatesPage() {
  return (
    <Suspense fallback={null}>
      <AdminCertificatesView />
    </Suspense>
  )
}

import type { Metadata } from 'next'
import CertificatesView from '@/components/views/dashboard/certificates-view'

export const metadata: Metadata = {
  title: 'সার্টিফিকেট | Certificates',
}

export default function DashboardCertificatesPage() {
  return <CertificatesView />
}

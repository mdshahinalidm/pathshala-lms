import { Suspense } from 'react'
import AdminPaymentGatewaysView from '@/components/views/admin/payment-gateways-view'

export const metadata = { title: 'পেমেন্ট গেটওয়ে | Payment Gateways — পাঠশালা Admin' }

export default function AdminPaymentGatewaysPage() {
  return (
    <Suspense fallback={null}>
      <AdminPaymentGatewaysView />
    </Suspense>
  )
}

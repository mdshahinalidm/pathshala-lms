import { Suspense } from 'react'
import AdminCouponsView from '@/components/views/admin/coupons-view'

export default function AdminCouponsPage() {
  return (
    <Suspense fallback={null}>
      <AdminCouponsView />
    </Suspense>
  )
}

import { Suspense } from 'react'
import AdminCombosView from '@/components/views/admin/combos-view'

export default function AdminCombosPage() {
  return (
    <Suspense fallback={null}>
      <AdminCombosView />
    </Suspense>
  )
}

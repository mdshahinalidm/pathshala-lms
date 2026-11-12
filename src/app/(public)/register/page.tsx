import { Suspense } from 'react'
import type { Metadata } from 'next'
import AuthView from '@/components/views/auth-view'

// Dynamic rendering: search params are read client-side (useSearchParams);
// rendering dynamically keeps the RSC payload inline so hydration is a single
// pass and persisted-language rehydration can never race it.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'রেজিস্ট্রেশন | Register',
  description: 'ফ্রি একাউন্ট খুলুন এবং আজই শেখা শুরু করুন।',
  robots: { index: false, follow: false },
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <AuthView />
    </Suspense>
  )
}

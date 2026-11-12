import { Suspense } from 'react'
import type { Metadata } from 'next'
import AuthView from '@/components/views/auth-view'

// Dynamic rendering: search params are read client-side (useSearchParams);
// rendering dynamically keeps the RSC payload inline so hydration is a single
// pass and persisted-language rehydration can never race it.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'লগইন | Login',
  description: 'পাঠশালা একাউন্টে লগইন করুন — ইমেইল/ফোন, পাসওয়ার্ড বা OTP দিয়ে।',
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthView />
    </Suspense>
  )
}

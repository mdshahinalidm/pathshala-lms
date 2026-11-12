import type { Metadata } from 'next'
import CheckoutView from '@/components/views/checkout-view'

export const metadata: Metadata = {
  title: 'চেকআউট | Checkout — পাঠশালা',
  robots: { index: false, follow: false },
}

export default async function CheckoutPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  return <CheckoutView courseId={courseId} />
}

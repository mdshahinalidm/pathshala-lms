import type { Metadata } from 'next'
import ComboCheckoutView from '@/components/views/checkout/combo-checkout-view'

export const metadata: Metadata = {
  title: 'কম্বো চেকআউট | Combo Checkout — পাঠশালা',
  robots: { index: false, follow: false },
}

export default async function ComboCheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ComboCheckoutView comboId={id} />
}

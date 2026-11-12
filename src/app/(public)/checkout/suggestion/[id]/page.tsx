import type { Metadata } from 'next'
import SuggestionCheckoutView from '@/components/views/checkout/suggestion-checkout-view'

export const metadata: Metadata = {
  title: 'সাজেশন চেকআউট | Suggestion Checkout — পাঠশালা',
  robots: { index: false, follow: false },
}

export default async function SuggestionCheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <SuggestionCheckoutView suggestionId={id} />
}

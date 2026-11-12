import type { Metadata } from 'next'
import CombosView from '@/components/views/combos-view'

export const metadata: Metadata = {
  title: 'কম্বো অফার | Combo Offers',
  description:
    'কোর্স, পরীক্ষা ও সাজেশন একসাথে কিনলেই বেশি সাশ্রয় — পাঠশালার কম্বো প্যাকেজ অফার। এক প্যাকেজে পুরো প্রস্তুতি, কম খরচে।',
  alternates: { canonical: '/combos' },
}

export default function CombosPage() {
  return <CombosView />
}

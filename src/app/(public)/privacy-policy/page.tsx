import type { Metadata } from 'next'
import { PrivacyPolicyView } from '@/components/views/legal-views'

export const metadata: Metadata = {
  title: 'প্রাইভেসি পলিসি | Privacy Policy',
  description:
    'পাঠশালা কীভাবে আপনার তথ্য সংগ্রহ ও সুরক্ষা করে — প্রাইভেসি পলিসি। How PathShala collects and protects your data.',
  alternates: { canonical: '/privacy-policy' },
}

export default function PrivacyPolicyPage() {
  return <PrivacyPolicyView />
}

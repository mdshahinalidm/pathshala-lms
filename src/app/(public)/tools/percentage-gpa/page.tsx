import type { Metadata } from 'next'
import PercentageGpaView from '@/components/views/tools/percentage-gpa-view'

export const metadata: Metadata = {
  title: 'শতকরা ↔ GPA কনভার্টার | Percentage ↔ GPA',
  description:
    'শতকরা নম্বর থেকে GPA অথবা GPA থেকে আনুমানিক শতকরা নম্বর — দুই দিকেই কনভার্ট করুন। SSC/HSC গ্রেডিং টেবিল অনুযায়ী।',
  alternates: { canonical: '/tools/percentage-gpa' },
}

export default function PercentageGpaPage() {
  return <PercentageGpaView />
}

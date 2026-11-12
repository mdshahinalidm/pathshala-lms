import type { Metadata } from 'next'
import GpaCalculatorView from '@/components/views/tools/gpa-calculator-view'

export const metadata: Metadata = {
  title: 'GPA ক্যালকুলেটর | GPA Calculator',
  description:
    'বিষয়ভিত্তিক নম্বর দিয়ে সাথে সাথে GPA হিসাব করুন — SSC ও HSC গ্রেডিং সিস্টেম (A+ 5.00 থেকে F 0.00)। ফ্রি অনলাইন টুল।',
  alternates: { canonical: '/tools/gpa-calculator' },
}

export default function GpaCalculatorPage() {
  return <GpaCalculatorView />
}

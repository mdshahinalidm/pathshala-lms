import type { Metadata } from 'next'
import CgpaCalculatorView from '@/components/views/tools/cgpa-calculator-view'

export const metadata: Metadata = {
  title: 'CGPA ক্যালকুলেটর | CGPA Calculator',
  description:
    'ক্রেডিট ও গ্রেড পয়েন্ট দিয়ে সাথে সাথে CGPA হিসাব করুন — অনার্স/বিশ্ববিদ্যালয়ের ৪.০০ স্কেল অনুযায়ী। ফ্রি অনলাইন টুল।',
  alternates: { canonical: '/tools/cgpa-calculator' },
}

export default function CgpaCalculatorPage() {
  return <CgpaCalculatorView />
}

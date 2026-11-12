import type { Metadata } from 'next'
import ExamsView from '@/components/views/exams-view'

export const metadata: Metadata = {
  // ≤65 chars rendered (template appends " | পাঠশালা PathShala")
  title: 'পরীক্ষা কেন্দ্র | Exam Center',
  description:
    'লাইভ পরীক্ষা ও প্র্যাকটিস কুইজ — SSC, HSC ও অনার্স শিক্ষার্থীদের জন্য ফ্রি অনলাইন পরীক্ষা। অংশ নিন, রেজাল্ট সাথে সাথে প্রোফাইলে সেভ হবে।',
  alternates: { canonical: '/exams' },
}

export default function ExamsPage() {
  return <ExamsView />
}

import type { Metadata } from 'next'
import QuestionsView from '@/components/views/questions-view'

export const metadata: Metadata = {
  title: 'প্রশ্ন ব্যাংক | Question Bank',
  description:
    'সাম্প্রতিক প্রশ্ন ও প্রশ্ন আর্কাইভ — যেসব প্রশ্ন পরীক্ষায় এসেছে সেগুলোর সঠিক উত্তরসহ আর্কাইভ। SSC, HSC ও অনার্স প্রস্তুতির জন্য।',
  alternates: { canonical: '/questions' },
}

export default function QuestionsPage() {
  return <QuestionsView />
}

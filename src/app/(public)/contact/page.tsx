import type { Metadata } from 'next'
import ContactView from '@/components/views/contact-view'

export const metadata: Metadata = {
  title: 'যোগাযোগ | Contact',
  description:
    'পাঠশালা টিমের সাথে যোগাযোগ করুন — ফর্ম, ফোন ও ইমেইল। Get in touch with the PathShala team: form, phone and email.',
  keywords: ['যোগাযোগ', 'contact PathShala', 'সাপোর্ট', 'support'],
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'যোগাযোগ | Contact — পাঠশালা',
    description: 'যেকোনো প্রশ্ন বা সহায়তার জন্য পাঠশালা টিমের সাথে যোগাযোগ করুন।',
    type: 'website',
    url: '/contact',
  },
}

export default function ContactPage() {
  return <ContactView />
}

'use client'

/**
 * LegalViews — Privacy Policy + Terms & Conditions pages.
 * Same centered prose layout as the About page; bilingual (bn default, EN toggle).
 */
import Link from 'next/link'
import { ArrowLeft, FileText, ScrollText } from 'lucide-react'
import { useUI } from '@/store/ui-store'

function LegalShell({
  icon,
  title,
  updated,
  children,
}: {
  icon: React.ReactNode
  title: string
  updated: string
  children: React.ReactNode
}) {
  const { tx } = useUI()
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> {tx('হোমে ফিরুন', 'Back to home')}
      </Link>
      <header className="mt-4 flex items-center gap-3">
        <span className="grad-brand flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-md">
          {icon}
        </span>
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          <p className="text-sm text-muted-foreground">{updated}</p>
        </div>
      </header>
      <article className="prose-legal mt-8 space-y-6 text-[15px] leading-relaxed text-foreground/90">{children}</article>
    </div>
  )
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold">{heading}</h2>
      <div className="mt-2 space-y-2 text-muted-foreground">{children}</div>
    </section>
  )
}

export function PrivacyPolicyView() {
  const { tx } = useUI()
  return (
    <LegalShell
      icon={<FileText className="h-6 w-6" />}
      title={tx('প্রাইভেসি পলিসি', 'Privacy Policy')}
      updated={tx('সর্বশেষ হালনাগাদ: জানুয়ারি ২০২৬', 'Last updated: January 2026')}
    >
      <Section heading={tx('১. আমরা কী তথ্য সংগ্রহ করি', '1. What we collect')}>
        <p>
          {tx(
            'অ্যাকাউন্ট তৈরির সময় আপনার নাম, ইমেইল/মোবাইল নম্বর ও পাসওয়ার্ড (এনক্রিপ্টেড) সংগ্রহ করা হয়। কোর্স কেনার সময় পেমেন্ট তথ্য শুধুমাত্র নিরাপদ পেমেন্ট গেটওয়েতে (bKash, Nagad, SSLCommerz, Stripe) প্রসেস হয় — আমরা কার্ড/পিন নম্বর সংরক্ষণ করি না।',
            'When you register we collect your name, email/phone and an encrypted password. Payments are processed entirely by secure gateways (bKash, Nagad, SSLCommerz, Stripe) — we never store card or PIN numbers.'
          )}
        </p>
      </Section>
      <Section heading={tx('২. তথ্য কীভাবে ব্যবহৃত হয়', '2. How we use it')}>
        <p>
          {tx(
            'আপনার তথ্য ব্যবহৃত হয়: অ্যাকাউন্ট যাচাই (OTP), কোর্স অ্যাক্সেস ও প্রোগ্রেস ট্র্যাকিং, পেমেন্ট যাচাই, নোটিশ/পরীক্ষার আপডেট এবং সাপোর্ট দেওয়ার জন্য। আমরা আপনার অনুমতি ছাড়া তৃতীয় পক্ষের কাছে বিজ্ঞাপনের জন্য তথ্য বিক্রি করি না।',
            'Your data is used for: account verification (OTP), course access and progress tracking, payment verification, notice/exam updates and support. We never sell your data to third parties for advertising.'
          )}
        </p>
      </Section>
      <Section heading={tx('৩. তথ্যের নিরাপত্তা', '3. Data security')}>
        <p>
          {tx(
            'পাসওয়ার্ড এনক্রিপ্টেড (bcrypt), সব ট্রাফিক HTTPS এবং OTP দিয়ে অ্যাকাউন্ট যাচাই করা হয়। ভিডিও কনটেন্ট সুরক্ষার জন্য প্ল্যাটফর্মে অ্যান্টি-পাইরেসি ব্যবস্থা সক্রিয়।',
            'Passwords are bcrypt-hashed, all traffic is HTTPS and accounts are verified with OTP. Anti-piracy measures protect all video content.'
          )}
        </p>
      </Section>
      <Section heading={tx('৪. কুকি ও সেশন', '4. Cookies & sessions')}>
        <p>
          {tx(
            'লগইন রাখতে আমরা একটি সুরক্ষিত সেশন কুকি ব্যবহার করি। থিম/ভাষা পছন্দ আপনার ব্রাউজারে সংরক্ষিত হয়।',
            'A secure session cookie keeps you logged in. Theme/language preferences are stored in your browser.'
          )}
        </p>
      </Section>
      <Section heading={tx('৫. আপনার অধিকার', '5. Your rights')}>
        <p>
          {tx(
            'আপনি চাইলে আপনার প্রোফাইল তথ্য হালনাগাদ করতে পারেন বা অ্যাকাউন্ট ডিলিটের অনুরোধ করতে পারেন — support@pathshala.com-এ মেইল করুন।',
            'You may update your profile or request account deletion anytime — email support@pathshala.com.'
          )}
        </p>
      </Section>
    </LegalShell>
  )
}

export function TermsView() {
  const { tx } = useUI()
  return (
    <LegalShell
      icon={<ScrollText className="h-6 w-6" />}
      title={tx('শর্তাবলী ও নীতিমালা', 'Terms & Conditions')}
      updated={tx('সর্বশেষ হালনাগাদ: জানুয়ারি ২০২৬', 'Last updated: January 2026')}
    >
      <Section heading={tx('১. অ্যাকাউন্ট', '1. Accounts')}>
        <p>
          {tx(
            'সঠিক তথ্য দিয়ে অ্যাকাউন্ট তৈরি করুন। একটি অ্যাকাউন্ট একজনের জন্য — একাধিক ডিভাইসে একসাথে লগইন সীমিত (শেষ লগইনটি সক্রিয় থাকে)। ভুয়া তথ্য বা অ্যাকাউন্ট শেয়ারিং ধরা পেলে অ্যাকাউন্ট স্থগিত হতে পারে।',
            'Register with accurate information. One account per person; concurrent device logins are limited (the newest session stays active). Fake info or account sharing may result in suspension.'
          )}
        </p>
      </Section>
      <Section heading={tx('২. কোর্স অ্যাক্সেস ও ভ্যালিডিটি', '2. Course access & validity')}>
        <p>
          {tx(
            'প্রতিটি কোর্সের ভ্যালিডিটি কোর্স পেজে উল্লেখ থাকে (১/২/৩/৬ মাস বা লাইফটাইম)। ভর্তির তারিখ থেকে সময় গণনা হয়। লাইফটাইম কোর্সের অ্যাক্সেস কখনো শেষ হয় না।',
            'Each course shows its validity on the course page (1/2/3/6 months or lifetime), counted from enrollment. Lifetime access never expires.'
          )}
        </p>
      </Section>
      <Section heading={tx('৩. পেমেন্ট ও রিফান্ড', '3. Payments & refunds')}>
        <p>
          {tx(
            'লাইভ গেটওয়ে দিয়ে পেমেন্ট করলে কোর্স সাথে সাথে আনলক হয়। ম্যানুয়াল পেমেন্টে অ্যাডমিন যাচাইয়ের পরে আনলক হয় (সাধারণত ২৪ ঘণ্টার মধ্যে)। ডিজিটাল কনটেন্ট হওয়ায় একবার কোর্স অ্যাক্সেস পেয়ে গেলে টাকা ফেরত প্রযোজ্য নয়; ডুপ্লিকেট পেমেন্টের ক্ষেত্রে সম্পূর্ণ ফেরত দেওয়া হয়।',
            'Live gateway payments unlock instantly. Manual payments unlock after admin verification (usually within 24 hours). Because content is digital, refunds do not apply once a course is unlocked; duplicate payments are fully refunded.'
          )}
        </p>
      </Section>
      <Section heading={tx('৪. কনটেন্ট কপিরাইট', '4. Content copyright')}>
        <p>
          {tx(
            'সব ভিডিও, PDF ও ম্যাটেরিয়াল পাঠশালার মেধাস্বত্বাধীন। স্ক্রিন রেকর্ড, ডাউনলোড টুল বা শেয়ারিং কঠোরভাবে নিষিদ্ধ — আইনগত ব্যবস্থা নেওয়া হতে পারে।',
            'All videos, PDFs and materials are the intellectual property of PathShala. Screen recording, download tools or sharing are strictly prohibited and may result in legal action.'
          )}
        </p>
      </Section>
      <Section heading={tx('৫. পরীক্ষা ও মূল্যায়ন', '5. Exams & assessments')}>
        <p>
          {tx(
            'পরীক্ষার সময় ট্যাব পরিবর্তন বা অসদুপায়ী ব্যবহার করলে সেই অ্যাটেম্পট বাতিল হতে পারে। ফলাফল চূড়ান্ত।',
            'Switching tabs or cheating during an exam may void that attempt. Results are final.'
          )}
        </p>
      </Section>
      <Section heading={tx('৬. শর্তাবলীর পরিবর্তন', '6. Changes to these terms')}>
        <p>
          {tx(
            'প্রয়োজনে শর্তাবলী হালনাগাদ হতে পারে — গুরুত্বপূর্ণ পরিবর্তন নোটিশ বোর্ডে ঘোষণা করা হবে।',
            'These terms may be updated when needed — significant changes will be announced on the notice board.'
          )}
        </p>
      </Section>
    </LegalShell>
  )
}

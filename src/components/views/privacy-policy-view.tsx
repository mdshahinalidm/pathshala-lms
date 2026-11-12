'use client'

/**
 * PrivacyPolicyView — bilingual (Bangla primary) privacy policy for the
 * online course platform. Same hero-strip + section pattern as AboutView.
 */

import { motion } from 'framer-motion'
import {
  ShieldCheck,
  Database,
  ClipboardList,
  Cookie,
  CreditCard,
  RotateCcw,
  Lock,
  Mail,
  type LucideIcon,
} from 'lucide-react'
import { useUI } from '@/store/ui-store'

interface PolicyPara {
  bn: string
  en: string
}

interface PolicySection {
  icon: LucideIcon
  title: string
  en: string
  paras: PolicyPara[]
  list?: PolicyPara[]
}

const SECTIONS: PolicySection[] = [
  {
    icon: Database,
    title: 'আমরা কী কী তথ্য সংগ্রহ করি',
    en: 'Information We Collect',
    paras: [
      {
        bn: 'রেজিস্ট্রেশনের সময় আমরা আপনার নাম, ইমেইল ঠিকানা ও মোবাইল নম্বর সংগ্রহ করি। কোর্স কেনার সময় বিলিং ও লেনদেন যাচাইয়ের প্রয়োজনীয় তথ্য সংরক্ষিত হয়।',
        en: 'During registration we collect your name, email address and mobile number. When you purchase a course, necessary billing and transaction-verification details are stored.',
      },
      {
        bn: 'সাইট ব্যবহারের সময় ব্রাউজারের ধরন, ডিভাইস ও দেখা পেজের মতো সাধারণ তথ্য স্বয়ংক্রিয়ভাবে জমা হয় — যা সাইটের অভিজ্ঞতা উন্নত করতে ব্যবহৃত হয়।',
        en: 'While you use the site, general information such as browser type, device and pages visited is collected automatically — used to improve the experience.',
      },
    ],
  },
  {
    icon: ClipboardList,
    title: 'তথ্য ব্যবহারের উদ্দেশ্য',
    en: 'How We Use Your Information',
    paras: [
      {
        bn: 'সংগৃহীত তথ্য ব্যবহৃত হয় — অ্যাকাউন্ট পরিচালনা, কেনা কোর্সে প্রবেশাধিকার নিশ্চিত করা, সাপোর্ট দেওয়া, নোটিশ ও গুরুত্বপূর্ণ আপডেট পাঠানো এবং সাইটের সেবা উন্নত করা।',
        en: 'Collected information is used to manage your account, grant access to purchased courses, provide support, send notices and important updates, and improve our services.',
      },
      {
        bn: 'আমরা আপনার ব্যক্তিগত তথ্য কোনো তৃতীয় পক্ষের কাছে বিক্রি করি না। শুধুমাত্র আইনগত বাধ্যবাধকতা বা সেবা দেওয়ার প্রয়োজনে (যেমন পেমেন্ট গেটওয়ে) সীমিত তথ্য ভাগ করা হয়।',
        en: 'We never sell your personal information to third parties. Limited data is shared only when legally required or necessary to deliver the service (e.g. payment gateways).',
      },
    ],
  },
  {
    icon: Cookie,
    title: 'কুকিজ নীতি',
    en: 'Cookies Policy',
    paras: [
      {
        bn: 'লগইন সেশন পরিচালনা ও আপনার পছন্দ (ভাষা, থিম) মনে রাখার জন্য আমরা প্রয়োজনীয় কুকিজ ব্যবহার করি।',
        en: 'We use essential cookies to manage your login session and remember your preferences (language, theme).',
      },
      {
        bn: 'ব্রাউজার সেটিংস থেকে কুকিজ বন্ধ করা সম্ভব; তবে তাতে লগইন ও কিছু ফিচার সঠিকভাবে কাজ নাও করতে পারে।',
        en: 'You can disable cookies from your browser settings; however, login and some features may not work correctly afterwards.',
      },
    ],
  },
  {
    icon: CreditCard,
    title: 'পেমেন্ট তথ্যের সুরক্ষা',
    en: 'Payment Information',
    paras: [
      {
        bn: 'সব পেমেন্ট প্রসেস হয় SSLCommerz, bKash, Nagad ও Stripe-এর মতো নির্ভরযোগ্য গেটওয়ের মাধ্যমে। কার্ড নম্বর, পিন বা ওটিপি আমাদের সার্ভারে কখনোই সংরক্ষিত হয় না।',
        en: 'All payments are processed through trusted gateways such as SSLCommerz, bKash, Nagad and Stripe. Card numbers, PINs or OTPs are never stored on our servers.',
      },
      {
        bn: 'লেনদেন যাচাই ও চালান তৈরির জন্য শুধুমাত্র প্রয়োজনীয় লেনদেন-রেফারেন্স তথ্য রাখা হয়।',
        en: 'Only the necessary transaction references are kept for verification and invoice generation.',
      },
    ],
  },
  {
    icon: RotateCcw,
    title: 'রিফান্ড নীতি',
    en: 'Refund Policy',
    paras: [
      {
        bn: 'রিফান্ড সংক্রান্ত সিদ্ধান্ত প্রতিটি কোর্স ও পরিস্থিতির জন্য অ্যাডমিনের বিবেচনায় গৃহীত হয়। রিফান্ড চাইতে অর্ডার নম্বর ও কারণ উল্লেখ করে সাপোর্ট ইমেইলে যোগাযোগ করুন।',
        en: 'Refund decisions are made at the discretion of the administration for each course and situation. To request a refund, contact support with your order number and reason.',
      },
      {
        bn: 'অনুমোদিত রিফান্ড সাধারণত ৭–১০ কর্মদিবসের মধ্যে একই পেমেন্ট মাধ্যমে ফেরত দেওয়া হয়।',
        en: 'Approved refunds are usually returned via the original payment method within 7–10 working days.',
      },
    ],
  },
  {
    icon: Lock,
    title: 'তথ্যের নিরাপত্তা',
    en: 'Data Security',
    paras: [
      {
        bn: 'আপনার তথ্য রক্ষায় আমরা যুক্তিসঙ্গত কারিগরি ও প্রাতিষ্ঠানিক ব্যবস্থা গ্রহণ করি। তবে ইন্টারনেটে কোনো পরিবহণই ১০০% নিরাপদ নয় — তাই আপনার পাসওয়ার্ড গোপন রাখুন।',
        en: 'We take reasonable technical and organizational measures to protect your data. However, no transmission over the internet is 100% secure — please keep your password confidential.',
      },
    ],
  },
  {
    icon: Mail,
    title: 'যোগাযোগ',
    en: 'Contact Us',
    paras: [
      {
        bn: 'প্রাইভেসি সংক্রান্ত যেকোনো প্রশ্ন বা অনুরোধে আমাদের লিখুন support@pathshala.com-এ অথবা কল করুন +880 1700-000000 নম্বরে।',
        en: 'For any privacy-related questions or requests, email us at support@pathshala.com or call +880 1700-000000.',
      },
    ],
  },
]

export default function PrivacyPolicyView() {
  const { tx } = useUI()

  return (
    <div className="flex flex-col">
      {/* ══ Hero strip ══ */}
      <section className="hero-dots relative overflow-hidden border-b bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-3.5 py-14 text-center sm:py-20">
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground"
            aria-hidden
          >
            <ShieldCheck className="h-7 w-7" />
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-2xl font-extrabold tracking-tight sm:text-4xl"
          >
            {tx('প্রাইভেসি পলিসি', 'Privacy Policy')}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base"
          >
            {tx(
              'পাঠশালা আপনার ব্যক্তিগত তথ্যের গোপনীয়তাকে সবচেয়ে গুরুত্বপূর্ণ মনে করে। এই নীতিতে বর্ণিত আছে কীভাবে আমরা তথ্য সংগ্রহ, ব্যবহার ও সুরক্ষা করি।',
              'PathShala treats your privacy with the utmost importance. This policy explains how we collect, use and protect your information.'
            )}
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-xs text-muted-foreground/80"
          >
            {tx('সর্বশেষ হালনাগাদ: জানুয়ারি ২০২৬', 'Last updated: January 2026')}
          </motion.p>
        </div>
      </section>

      {/* ══ Policy sections ══ */}
      <section className="mx-auto w-full max-w-4xl space-y-4 px-3.5 py-12 sm:py-16">
        {SECTIONS.map((s, i) => {
          const Icon = s.icon
          return (
            <motion.article
              key={s.en}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.45, delay: Math.min(i * 0.05, 0.2) }}
              className="rounded-2xl border bg-card p-6 sm:p-8"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="text-base font-bold sm:text-lg">{tx(s.title, s.en)}</h2>
              </div>
              <div className="mt-4 space-y-3">
                {s.paras.map((p) => (
                  <p key={p.en} className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {tx(p.bn, p.en)}
                  </p>
                ))}
                {s.list && (
                  <ul className="list-inside list-disc space-y-1.5 text-sm text-muted-foreground sm:text-base">
                    {s.list.map((li) => (
                      <li key={li.en}>{tx(li.bn, li.en)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.article>
          )
        })}

        <p className="rounded-2xl border border-dashed bg-muted/30 p-5 text-center text-sm text-muted-foreground">
          {tx(
            'এই নীতিমালা যেকোনো সময় হালনাগাদ হতে পারে — হালনাগাদ সংস্করণ এই পেজেই প্রকাশিত হবে।',
            'This policy may be updated at any time — the latest version will always be published on this page.'
          )}
        </p>
      </section>
    </div>
  )
}

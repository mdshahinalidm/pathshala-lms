'use client'

/**
 * TermsView — bilingual (Bangla primary) terms & conditions for the
 * online course platform. Same hero-strip + section pattern as AboutView.
 */

import { motion } from 'framer-motion'
import {
  ScrollText,
  FileSignature,
  User,
  BookOpen,
  Wallet,
  RotateCcw,
  ShieldAlert,
  Copyright,
  Scale,
  RefreshCw,
  Mail,
  type LucideIcon,
} from 'lucide-react'
import { useUI } from '@/store/ui-store'

interface TermPara {
  bn: string
  en: string
}

interface TermSection {
  icon: LucideIcon
  title: string
  en: string
  paras: TermPara[]
  list?: TermPara[]
}

const SECTIONS: TermSection[] = [
  {
    icon: FileSignature,
    title: 'শর্তাবলী গ্রহণ',
    en: 'Acceptance of Terms',
    paras: [
      {
        bn: 'পাঠশালা ওয়েবসাইট ও সেবা ব্যবহার করলেই আপনি এই শর্তাবলীতে সম্মত হচ্ছেন। যদি কোনো শর্তে একমত না হন, তবে সাইটটি ব্যবহার করবেন না।',
        en: 'By using the PathShala website and services, you agree to these terms. If you do not agree with any condition, please do not use the site.',
      },
    ],
  },
  {
    icon: User,
    title: 'অ্যাকাউন্ট সংক্রান্ত',
    en: 'Your Account',
    paras: [
      {
        bn: 'রেজিস্ট্রেশনের সময় সঠিক ও হালনাগাদ তথ্য দিতে হবে। আপনার পাসওয়ার্ড ও অ্যাকাউন্টের নিরাপত্তা রক্ষার দায়িত্ব আপনার।',
        en: 'You must provide accurate and up-to-date information during registration. You are responsible for keeping your password and account secure.',
      },
      {
        bn: 'অন্য কারও সাথে অ্যাকাউন্ট শেয়ার করা বা বিক্রি করা সম্পূর্ণ নিষিদ্ধ — প্রমাণ পেলে অ্যাকাউন্ট স্থগিত বা বাতিল করা হতে পারে।',
        en: 'Sharing or selling your account with anyone else is strictly prohibited — accounts may be suspended or cancelled upon detection.',
      },
    ],
  },
  {
    icon: BookOpen,
    title: 'কোর্স ক্রয় ও প্রবেশাধিকার',
    en: 'Course Purchase & Access',
    paras: [
      {
        bn: 'কোর্স কেনার পর নির্দিষ্ট মেয়াদের জন্য (অথবা কোর্সভেদে আজীবন) শুধুমাত্র আপনার শেখার উদ্দেশ্যে কনটেন্ট ব্যবহারের অনুমতি থাকে।',
        en: 'After purchase, course content is licensed to you for personal learning only, for the stated duration (or lifetime, depending on the course).',
      },
      {
        bn: 'কোর্সের ভিডিও, পিডিএফ বা অন্য কনটেন্ট ডাউনলোড, রেকর্ড, বিতরণ বা বাণিজ্যিক উদ্দেশ্যে ব্যবহার নিষিদ্ধ।',
        en: 'Downloading, recording, distributing or commercially using course videos, PDFs or any other content is prohibited.',
      },
    ],
  },
  {
    icon: Wallet,
    title: 'পেমেন্ট',
    en: 'Payments',
    paras: [
      {
        bn: 'কোর্সের মূল্য যেকোনো সময় পরিবর্তন হতে পারে; তবে কনফার্ম হওয়া অর্ডারের মূল্য পরিবর্তন হয় না। পেমেন্ট গ্রহণ করা হয় অনুমোদিত গেটওয়ের মাধ্যমে।',
        en: 'Course prices may change at any time; however, the price of a confirmed order never changes. Payments are accepted through authorized gateways.',
      },
    ],
  },
  {
    icon: RotateCcw,
    title: 'রিফান্ড',
    en: 'Refunds',
    paras: [
      {
        bn: 'রিফান্ডের অনুরোধ প্রতিটি ক্ষেত্রে অ্যাডমিনের বিবেচনায় গৃহীত হয়। যুক্তিসঙ্গত কারণে অনুমোদিত রিফান্ড ৭–১০ কর্মদিবসে মূল পেমেন্ট মাধ্যমে ফেরত দেওয়া হয়।',
        en: 'Refund requests are considered at the discretion of the administration in each case. Approved refunds for valid reasons are returned to the original payment method within 7–10 working days.',
      },
    ],
  },
  {
    icon: ShieldAlert,
    title: 'ব্যবহারের নিয়ম',
    en: 'Acceptable Use',
    paras: [
      {
        bn: 'নিচের কাজগুলো কঠোরভাবে নিষিদ্ধ:',
        en: 'The following actions are strictly prohibited:',
      },
    ],
    list: [
      { bn: 'প্ল্যাটফর্মের কনটেন্ট অনুমতি ছাড়া কপি, শেয়ার বা পুনঃবিক্রয়', en: 'Copying, sharing or reselling platform content without permission' },
      { bn: 'সাইটের স্বাভাবিক কার্যক্রমে বিঘ্ঘ ঘটানো বা নিরাপত্তা দুর্বলতা কাজে লাগানো', en: 'Disrupting the site or exploiting security weaknesses' },
      { bn: 'ভুয়া তথ্য, স্প্যাম বা অন্যদের জন্য ক্ষতিকর কার্যক্রম', en: 'Fake information, spam or any activity harmful to others' },
    ],
  },
  {
    icon: Copyright,
    title: 'মেধাস্বত্ব',
    en: 'Intellectual Property',
    paras: [
      {
        bn: 'পাঠশালার সব কোর্স কনটেন্ট, লোগো ও ডিজাইনের মালিকানা পাঠশালা বা সংশ্লিষ্ট শিক্ষকের। লিখিত অনুমতি ছাড়া এগুলো ব্যবহার করা যাবে না।',
        en: 'All course content, logos and designs belong to PathShala or the respective instructors. They may not be used without written permission.',
      },
    ],
  },
  {
    icon: Scale,
    title: 'দায় সীমিতকরণ',
    en: 'Limitation of Liability',
    paras: [
      {
        bn: 'সেবা "যথাসম্ভব" ভিত্তিতে প্রদান করা হয়। নির্দিষ্ট পরীক্ষার ফলাফল বা ভর্তির নিশ্চয়তা দেওয়া হয় না। প্রযুক্তিগত ত্রুটি বা সেবা ব্যাঘাতের জন্য অনিবার্য কারণে পাঠশালা দায়ী থাকবে না।',
        en: 'Services are provided on an "as available" basis. No guarantee of specific exam results or admissions is given. PathShala is not liable for technical errors or unavoidable service interruptions.',
      },
    ],
  },
  {
    icon: RefreshCw,
    title: 'শর্তাবলী পরিবর্তন',
    en: 'Changes to These Terms',
    paras: [
      {
        bn: 'পাঠশালা যেকোনো সময় এই শর্তাবলী হালনাগাদ করতে পারে। পরিবর্তনের পর সাইট ব্যবহার অব্যাহত রাখলে নতুন শর্ত প্রযোজ্য হবে বলে গণ্য হবে।',
        en: 'PathShala may update these terms at any time. Continued use of the site after changes constitutes acceptance of the new terms.',
      },
    ],
  },
  {
    icon: Mail,
    title: 'যোগাযোগ',
    en: 'Contact Us',
    paras: [
      {
        bn: 'শর্তাবলী সংক্রান্ত প্রশ্নে ইমেইল করুন support@pathshala.com-এ অথবা কল করুন +880 1700-000000 নম্বরে।',
        en: 'For questions about these terms, email support@pathshala.com or call +880 1700-000000.',
      },
    ],
  },
]

export default function TermsView() {
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
            <ScrollText className="h-7 w-7" />
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-2xl font-extrabold tracking-tight sm:text-4xl"
          >
            {tx('শর্তাবলী', 'Terms & Conditions')}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base"
          >
            {tx(
              'পাঠশালা ব্যবহারের নিয়ম ও শর্ত — অ্যাকাউন্ট, কোর্স ক্রয়, পেমেন্ট, রিফান্ড ও দায়বদ্ধতা সংক্রান্ত চুক্তি।',
              'The rules of using PathShala — our agreement covering accounts, course purchases, payments, refunds and liability.'
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

      {/* ══ Terms sections ══ */}
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
            'শর্তাবলী সম্পর্কে কোনো প্রশ্ন থাকলে নির্দ্বিধায় যোগাযোগ করুন — আমরা সবসময় পাশে আছি।',
            'If you have any questions about these terms, feel free to reach out — we are always here to help.'
          )}
        </p>
      </section>
    </div>
  )
}

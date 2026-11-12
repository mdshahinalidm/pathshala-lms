'use client'

/**
 * ContactView — contact form + info cards + map embed + FAQ accordion.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Send,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { SectionHeading } from '@/components/shared/section-heading'
import { useUI } from '@/store/ui-store'
import { apiPost } from '@/lib/api-client'

const SUBJECTS = [
  { value: 'GENERAL', bn: 'সাধারণ জিজ্ঞাসা', en: 'General inquiry' },
  { value: 'COURSE', bn: 'কোর্স সংক্রান্ত', en: 'Course related' },
  { value: 'PAYMENT', bn: 'পেমেন্ট সমস্যা', en: 'Payment issue' },
  { value: 'OTHER', bn: 'অন্যান্য', en: 'Other' },
]

const FAQS = [
  {
    q: 'কোর্সে ভর্তি হবো কীভাবে?',
    qEn: 'How do I enroll in a course?',
    a: 'কোর্স পেজে গিয়ে "কিনুন এখনই" বাটনে ক্লিক করে bKash/Nagad/কার্ড দিয়ে পেমেন্ট করুন। ফ্রি কোর্সে শুধু "ভর্তি হোন" চাপলেই হবে।',
    aEn: 'Open the course page, click "Buy Now" and pay with bKash/Nagad/card. For free courses just press "Enroll Now".',
  },
  {
    q: 'পেমেন্ট সফল হলেও কোর্স দেখাচ্ছে না, কী করবো?',
    qEn: 'Payment succeeded but the course is not showing. What to do?',
    a: 'কয়েক মিনিট অপেক্ষা করে ড্যাশবোর্ড রিফ্রেশ করুন। সমস্যা থাকলে অর্ডার ট্রানজেকশন আইডি সহ আমাদের জানান।',
    aEn: 'Wait a few minutes and refresh your dashboard. If it persists, contact us with your transaction ID.',
  },
  {
    q: 'ভিডিও ক্লাস কি অফলাইনে ডাউনলোড করা যাবে?',
    qEn: 'Can I download video classes for offline viewing?',
    a: 'না, কপিরাইট সুরক্ষার জন্য ভিডিও শুধু প্ল্যাটফর্মে দেখা যায়। তবে PDF নোট ডাউনলোড করা যায়।',
    aEn: 'No — for copyright protection videos are only streamable on the platform. PDF notes can be downloaded.',
  },
  {
    q: 'ফ্রি সাজেশন কি লগইন ছাড়া নামানো যাবে?',
    qEn: 'Can I download free suggestions without login?',
    a: 'হ্যাঁ! "সাজেশন ও রিসোর্স" পেজের ফ্রি ম্যাটেরিয়াল সবার জন্য উন্মুক্ত — লগইন ছাড়াই ডাউনলোড করা যায়।',
    aEn: 'Yes! Free materials on the Suggestions page are open to everyone — no login needed.',
  },
]

export default function ContactView() {
  const { t, tx } = useUI()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [subject, setSubject] = useState('GENERAL')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)

  const validate = () => {
    const errs: Record<string, string> = {}
    if (name.trim().length < 2) errs.name = tx('নাম লিখুন', 'Please enter your name')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = tx('সঠিক ইমেইল দিন', 'Enter a valid email')
    if (message.trim().length < 10)
      errs.message = tx('কমপক্ষে ১০ অক্ষরের বার্তা লিখুন', 'Message must be at least 10 characters')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSending(true)
    try {
      await apiPost('/api/contact', {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        subject,
        message: message.trim(),
      })
      toast.success(t('message_sent'))
      setName('')
      setEmail('')
      setPhone('')
      setSubject('GENERAL')
      setMessage('')
      setErrors({})
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('error'))
    } finally {
      setSending(false)
    }
  }

  const INFO = [
    {
      icon: MapPin,
      label: tx('ঠিকানা', 'Address'),
      value: tx('বাড়ি ১২, রোড ৫, ধানমন্ডি, ঢাকা-১২০৫', 'House 12, Road 5, Dhanmondi, Dhaka-1205'),
    },
    { icon: Phone, label: tx('ফোন', 'Phone'), value: '+৮৮০ ১৭০০-০০০০০০' },
    { icon: Mail, label: tx('ইমেইল', 'Email'), value: 'support@pathshala.com' },
    { icon: Clock, label: tx('সময়', 'Hours'), value: tx('শনি-বৃহস্পতি, সকাল ৯টা — রাত ৯টা', 'Sat–Thu, 9:00 AM – 9:00 PM') },
  ]

  return (
    <div className="mx-auto w-full max-w-7xl px-3.5 py-8 sm:py-10">
      {/* Google SEO rule: page-level H1 (visually hidden — SectionHeading renders h2). */}
      <h1 className="sr-only">{tx('যোগাযোগ — পাঠশালা', 'Contact — PathShala')}</h1>
      <SectionHeading
        title={t('nav_contact')}
        subtitle={tx('যেকোনো প্রশ্ন বা সমস্যায় আমাদের জানান — আমরা ২৪ ঘণ্টার মধ্যে উত্তর দিই।', 'Any question or issue — let us know, we reply within 24 hours.')}
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* ══ LEFT: form + info ══ */}
        <div className="space-y-6">
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45 }}
            onSubmit={submit}
            noValidate
            className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6"
            aria-label={t('send_message')}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-name">{t('name')} *</Label>
                <Input
                  id="c-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'c-name-err' : undefined}
                  placeholder={tx('আপনার নাম', 'Your name')}
                />
                {errors.name && (
                  <p id="c-name-err" className="text-xs text-destructive">{errors.name}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email">{t('email')} *</Label>
                <Input
                  id="c-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'c-email-err' : undefined}
                  placeholder="you@example.com"
                />
                {errors.email && (
                  <p id="c-email-err" className="text-xs text-destructive">{errors.email}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-phone">{t('phone')}</Label>
                <Input
                  id="c-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-subject">{tx('বিষয়', 'Subject')}</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger id="c-subject" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {tx(s.bn, s.en)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-message">{tx('বার্তা', 'Message')} *</Label>
              <Textarea
                id="c-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                aria-invalid={!!errors.message}
                aria-describedby={errors.message ? 'c-message-err' : undefined}
                rows={5}
                placeholder={tx('আপনার বার্তা বিস্তারিত লিখুন...', 'Write your message in detail...')}
              />
              {errors.message && (
                <p id="c-message-err" className="text-xs text-destructive">{errors.message}</p>
              )}
            </div>

            <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t('loading')}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden />
                  {t('send_message')}
                </>
              )}
            </Button>
          </motion.form>

          {/* Info cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {INFO.map((item, i) => {
              const Icon = item.icon
              return (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.4, delay: i * 0.06 }}
                  className="flex items-start gap-3 rounded-2xl border bg-card p-4"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <p className="mt-0.5 break-words text-sm font-medium">{item.value}</p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* ══ RIGHT: map + FAQ ══ */}
        <div className="flex flex-col gap-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className="min-h-[320px] flex-1 overflow-hidden rounded-2xl border lg:min-h-[360px]"
          >
            <iframe
              src="https://www.google.com/maps?q=Dhanmondi,Dhaka&output=embed"
              title={tx('পাঠশালা অফিস ম্যাপ — ধানমন্ডি, ঢাকা', 'PathShala office map — Dhanmondi, Dhaka')}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-full min-h-[320px] w-full border-0"
            />
          </motion.div>

          <div className="rounded-2xl border bg-card p-5">
            <h2 className="text-lg font-bold">{tx('সাধারণ জিজ্ঞাসা', 'Frequently Asked Questions')}</h2>
            <Accordion type="single" collapsible className="mt-3">
              {FAQS.map((f, i) => (
                <AccordionItem key={f.q} value={`faq-${i}`} className={i === FAQS.length - 1 ? 'border-b-0' : ''}>
                  <AccordionTrigger className="text-left text-sm font-medium">{tx(f.q, f.qEn)}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    {tx(f.a, f.aEn)}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </div>
  )
}

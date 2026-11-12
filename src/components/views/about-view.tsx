'use client'

/**
 * AboutView — mission, story, values, team, stats.
 *
 * "Our Team" renders the instructors created in Admin → Instructors
 * (GET /api/instructors). When the section is still empty, the original
 * static team list stays visible so the page never changes unexpectedly.
 */
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  Target,
  HeartHandshake,
  Lightbulb,
  Award,
  GraduationCap,
  Users,
  BookOpen,
  Clock,
  Star,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCounter } from '@/components/shared/stat-counter'
import { SectionHeading } from '@/components/shared/section-heading'
import { useUI } from '@/store/ui-store'
import { apiGet } from '@/lib/api-client'

interface TeamMember {
  id?: string
  name: string
  role: string
  roleEn: string
  bio?: string | null
  photoUrl?: string | null
}

const VALUES = [
  {
    icon: Target,
    title: 'শিক্ষার্থী-কেন্দ্রিকতা',
    sub: 'প্রতিটি সিদ্ধান্তে শিক্ষার্থীর সুবিধা প্রথম',
    en: 'Student First',
    enSub: 'Every decision starts with student benefit',
  },
  {
    icon: Award,
    title: 'মানের স্বীকৃতি',
    sub: 'দেশসেরা শিক্ষক ও যাচাইকৃত কনটেন্ট',
    en: 'Quality Assured',
    enSub: 'Top teachers and verified content',
  },
  {
    icon: Lightbulb,
    title: 'উদ্ভাবন',
    sub: 'প্রযুক্তি দিয়ে শেখাকে সহজ ও মজার করা',
    en: 'Innovation',
    enSub: 'Making learning easier and fun with tech',
  },
  {
    icon: HeartHandshake,
    title: 'সবার জন্য শিক্ষা',
    sub: 'সীমান্তের শিক্ষার্থীরও সমান সুযোগ',
    en: 'Education for All',
    enSub: 'Equal opportunity for every learner',
  },
]

const FALLBACK_TEAM: TeamMember[] = [
  { name: 'ড. আনিসুর রহমান', role: 'প্রতিষ্ঠাতা ও পরিচালক', roleEn: 'Founder & Director' },
  { name: 'সারাহ জনসন', role: 'ইংরেজি প্রশিক্ষক', roleEn: 'English Trainer' },
  { name: 'মোঃ রফিকুল ইসলাম', role: 'গণিত শিক্ষক', roleEn: 'Math Instructor' },
  { name: 'তানভীর হাসান', role: 'পদার্থবিজ্ঞান প্রশিক্ষক', roleEn: 'Physics Instructor' },
  { name: 'নুসরাত জাহান', role: 'রসায়ন শিক্ষক', roleEn: 'Chemistry Instructor' },
  { name: 'আরিফুল ইসলাম', role: 'আইসিটি প্রশিক্ষক', roleEn: 'ICT Instructor' },
]

/** Public counters (server-read, admin-overridable) — stat strip values. */
interface AboutStats {
  students: number | null
  hours: number | null
  courses: number
  reviews: number
}

export default function AboutView({ initialStats }: { initialStats?: AboutStats }) {
  const { t, tx, lang } = useUI()

  // Instructors managed in Admin → Instructors; DB rows drive the section.
  // undefined = still loading · null = loaded but empty (static fallback).
  const [team, setTeam] = useState<TeamMember[] | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    apiGet<{
      id: string
      name: string
      nameEn?: string | null
      designation?: string | null
      designationEn?: string | null
      bio?: string | null
      photoUrl?: string | null
    }[]>('/api/instructors')
      .then((rows) => {
        if (cancelled) return
        const mapped: TeamMember[] = (rows ?? []).map((r) => ({
          id: r.id,
          name: (lang === 'bn' ? r.name : r.nameEn || r.name) || r.name,
          role:
            (lang === 'bn' ? r.designation || '' : r.designationEn || r.designation || '') ||
            tx('শিক্ষক', 'Instructor'),
          roleEn:
            r.designationEn || r.designation || '',
          bio: r.bio ?? null,
          photoUrl: r.photoUrl ?? null,
        }))
        setTeam(mapped.length > 0 ? mapped : null)
      })
      .catch(() => {
        if (!cancelled) setTeam(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const teamMembers: TeamMember[] = team ?? FALLBACK_TEAM

  return (
    <div className="flex flex-col">
      {/* ══ Mission hero strip ══ */}
      <section className="hero-dots relative overflow-hidden border-b bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-4 py-14 text-center sm:py-20">
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground"
            aria-hidden
          >
            <GraduationCap className="h-7 w-7" />
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-2xl font-extrabold tracking-tight sm:text-4xl"
          >
            {t('nav_about')}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base"
          >
            {tx(
              'আমাদের লক্ষ্য — দেশের প্রতিটি শিক্ষার্থীর কাছে মানসম্মত, সাশ্রয়ী ও ফলাফল-ভিত্তিক শিক্ষা পৌঁছে দেওয়া। পাঠশালায় আমরা বিশ্বাস করি, সঠিক গাইডেন্স পেলে প্রতিটি শিক্ষার্থী তার স্বপ্নের ফলাফল অর্জন করতে পারে।',
              'Our mission — bring quality, affordable and result-driven education to every student in Bangladesh. At PathShala we believe every learner can achieve their dream results with the right guidance.'
            )}
          </motion.p>
        </div>
      </section>

      {/* ══ Story ══ */}
      <section className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-12 sm:py-16 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="relative aspect-[4/3] overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 to-accent shadow-lg"
        >
          <Image
            src="/images/hero.jpg"
            alt={tx('পাঠশালার গল্প', 'The PathShala story')}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="space-y-4"
        >
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {tx('আমাদের গল্প', 'Our Story')}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            {tx(
              '২০২৩ সালে কয়েকজন শিক্ষক ও প্রকৌশলীর এক ছোট্ট স্বপ্ন থেকে পাঠশালার যাত্রা শুরু। শুরুতে কয়েকটি ফ্রি ইউটিউব ক্লাস হলেও আজ হাজারো শিক্ষার্থী এখান থেকে এসএসসি, এইচএসসি ও ভর্তি পরীক্ষার প্রস্তুতি নিচ্ছে।',
              'PathShala started in 2023 as a small dream of a few teachers and engineers. From a handful of free YouTube classes, today thousands of students prepare for SSC, HSC and admission tests here.'
            )}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            {tx(
              'আমরা বিশ্বাস করি — শেখা কখনো থামে না। তাই কোর্সের পাশাপাশি ফ্রি সাজেশন, লাইভ পরীক্ষা ও লিডারবোর্ড সবার জন্য উন্মুক্ত।',
              'We believe learning never stops. That is why free suggestions, live exams and leaderboards stay open for everyone.'
            )}
          </p>
        </motion.div>
      </section>

      {/* ══ Values ══ */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto w-full max-w-7xl px-3.5 py-12 sm:py-16">
          <SectionHeading
            title={tx('আমাদের মূল্যবোধ', 'Our Values')}
            subtitle={tx('যে চারটি নীতি আমাদের প্রতিদিন এগিয়ে নেয়', 'Four principles that drive us every day')}
          />
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((v, i) => {
              const Icon = v.icon
              return (
                <motion.div
                  key={v.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.45, delay: i * 0.08 }}
                  className="rounded-2xl border bg-card p-6 transition-shadow hover:shadow-md"
                >
                  <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="font-semibold">{tx(v.title, v.en)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{tx(v.sub, v.enSub)}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ══ Team (Admin → Instructors drive this; static fallback) ══ */}
      <section className="mx-auto w-full max-w-7xl px-3.5 py-12 sm:py-16">
        <SectionHeading
          title={tx('আমাদের টিম', 'Our Team')}
          subtitle={tx('শিক্ষক, প্রকৌশলী ও ক্রিয়েটরদের এক অন্যরকম দল', 'A unique team of teachers, engineers and creators')}
        />
        {team === undefined ? (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {teamMembers.map((m, i) => (
              <motion.div
                key={m.id ?? m.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-5 text-center transition-all hover:-translate-y-1 hover:shadow-md"
              >
                <Avatar className="h-16 w-16">
                  {m.photoUrl ? <AvatarImage src={m.photoUrl} alt={m.name} /> : null}
                  <AvatarFallback className="bg-primary/15 text-lg font-bold text-primary">
                    {m.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-bold leading-snug">{m.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{tx(m.role, m.roleEn)}</p>
                  {m.bio ? (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/80">
                      {m.bio}
                    </p>
                  ) : null}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* ══ Stats strip ══ */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-4 px-4 py-12 lg:grid-cols-4">
          <StatCounter value={initialStats?.students ?? 12500} suffix="+" label={t('stats_students')} icon={<Users className="h-5 w-5" aria-hidden />} />
          <StatCounter value={initialStats?.courses || 55} label={t('stats_courses')} icon={<BookOpen className="h-5 w-5" aria-hidden />} />
          <StatCounter value={initialStats?.hours ?? 1200} suffix="+" label={t('stats_hours')} icon={<Clock className="h-5 w-5" aria-hidden />} />
          <StatCounter value={initialStats?.reviews || 9800} suffix={initialStats?.reviews ? undefined : '+'} label={t('stats_reviews')} icon={<Star className="h-5 w-5" aria-hidden />} />
        </div>
      </section>
    </div>
  )
}

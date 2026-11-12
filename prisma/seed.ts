/**
 * PathShala LMS — Database Seed
 * Demo catalog: 30 courses from Class 9 → Honours 4th Year,
 * with full chapters/lessons, reviews, quizzes, orders & enrollments.
 * Run: bun prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

// ── Minimal valid PDF builder (for suggestion downloads) ──
function makePdf(title: string, lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const contentLines = lines
    .map((l, i) => `BT /F1 ${i === 0 ? 18 : 12} Tf 60 ${760 - i * 28} Td (${esc(l)}) Tj ET`)
    .join('\n')
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${contentLines.length} >>\nstream\n${contentLines}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return Buffer.from(pdf, 'latin1')
}

const V = (name: string) => `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/${name}.mp4`
const V_LIST = [
  'BigBuckBunny', 'ElephantsDream', 'ForBiggerBlazes', 'ForBiggerEscapes', 'ForBiggerFun',
  'ForBiggerJoyrides', 'ForBiggerMeltdowns', 'Sintel', 'SubaruOutbackOnStreetAndDirt',
  'TearsOfSteel', 'VolkswagenGTIReview', 'WeAreGoingOnBullrun', 'WhatCarCanYouGetForAGrand',
]
const DURS = [600, 480, 720, 540, 900, 660, 780, 560, 840, 620, 700, 500, 640]
let vIdx = 0
let dIdx = 0
const nextVideo = () => V(V_LIST[vIdx++ % V_LIST.length])
const nextDur = () => DURS[dIdx++ % DURS.length]

async function main() {
  console.log('🌱 Seeding PathShala LMS (30 courses: Class 9 → Honours 4th Year)...')
  await db.order.deleteMany()
  await db.enrollment.deleteMany()
  await db.notification.deleteMany()
  await db.quizAttempt.deleteMany()
  await db.question.deleteMany()
  await db.quiz.deleteMany()
  await db.lesson.deleteMany()
  await db.chapter.deleteMany()
  await db.review.deleteMany()
  await db.suggestion.deleteMany()
  await db.notice.deleteMany()
  await db.contactMessage.deleteMany()
  await db.course.deleteMany()
  await db.category.deleteMany()
  await db.otpToken.deleteMany()
  await db.user.deleteMany()

  // ── Users ──
  const adminPass = await bcrypt.hash('Admin@1234', 10)
  const studentPass = await bcrypt.hash('Student@123', 10)

  await db.user.create({
    data: {
      name: 'পাঠশালা অ্যাডমিন',
      email: 'admin@pathshala.com',
      phone: '01700000000',
      passwordHash: adminPass,
      role: 'ADMIN',
      isVerified: true,
    },
  })

  const studentData = [
    { name: 'রাকিব হাসান', email: 'rakib@pathshala.com', phone: '01711111111' },
    { name: 'তাসনিম আক্তার', email: 'tasnim@pathshala.com', phone: '01722222222' },
    { name: 'সাব্বির আহমেদ', email: 'sabbir@pathshala.com', phone: '01733333333' },
    { name: 'মেহেদী হাসান', email: 'mehedi@pathshala.com', phone: '01744444444' },
    { name: 'নুসরাত জাহান', email: 'nusrat@pathshala.com', phone: '01755555555' },
    { name: 'আরিফুল ইসলাম', email: 'ariful@pathshala.com', phone: '01766666666' },
    { name: 'ফারহানা রহমান', email: 'farhana@pathshala.com', phone: '01777777777' },
    { name: 'ইমরান খান', email: 'imran@pathshala.com', phone: '01888888888' },
  ]
  const students: { id: string; name: string }[] = []
  for (const s of studentData) {
    const u = await db.user.create({
      data: { ...s, passwordHash: studentPass, isVerified: true },
    })
    students.push({ id: u.id, name: u.name })
  }
  const rakib = students[0]

  // ── Categories: Class 9 → Honours 4th Year ──
  const catDefs = [
    { slug: 'class-9', name: 'নবম শ্রেণি', nameEn: 'Class 9', icon: 'BookOpen', order: 1 },
    { slug: 'class-10', name: 'দশম শ্রেণি [এসএসসি]', nameEn: 'Class 10 (SSC)', icon: 'GraduationCap', order: 2 },
    { slug: 'class-11', name: 'একাদশ শ্রেণি [এইচএসসি ১ম বর্ষ]', nameEn: 'Class 11 (HSC 1st Year)', icon: 'Library', order: 3 },
    { slug: 'class-12', name: 'দ্বাদশ শ্রেণি [এইচএসসি ২য় বর্ষ]', nameEn: 'Class 12 (HSC 2nd Year)', icon: 'School', order: 4 },
    { slug: 'honours-1st-year', name: 'অনার্স ১ম বর্ষ', nameEn: 'Honours 1st Year', icon: 'Landmark', order: 5 },
    { slug: 'honours-2nd-year', name: 'অনার্স ২য় বর্ষ', nameEn: 'Honours 2nd Year', icon: 'Briefcase', order: 6 },
    { slug: 'honours-3rd-year', name: 'অনার্স ৩য় বর্ষ', nameEn: 'Honours 3rd Year', icon: 'TrendingUp', order: 7 },
    { slug: 'honours-4th-year', name: 'অনার্স ৪র্থ বর্ষ', nameEn: 'Honours 4th Year', icon: 'Award', order: 8 },
  ]
  const cat: Record<string, string> = {}
  for (const c of catDefs) {
    const created = await db.category.create({ data: c })
    cat[c.slug] = created.id
  }

  // ── Instructors (original demo photos) ──
  const INST = {
    anisur: { name: 'ড. আনিসুর রহমান', title: 'PhD পদার্থবিজ্ঞান, ঢাকা বিশ্ববিদ্যালয় · ১২ বছরের অভিজ্ঞতা', img: '/images/instructors/anisur.jpg' },
    mizanur: { name: 'মিজানুর রহমান', title: 'BUET গ্র্যাজুয়েট · গণিত ট্রেইনার', img: '/images/instructors/mizanur.jpg' },
    salma: { name: 'প্রফেসর সালমা খাতুন', title: 'রসায়ন বিভাগ, ইডেন কলেজ', img: '/images/instructors/salma.jpg' },
    tanvir: { name: 'Tanvir Ahmed', title: 'MA English · IELTS 8.5 · ভাষা কোচ', img: '/images/instructors/tanvir.jpg' },
    shafiul: { name: 'ড. শাফিউল ইসলাম', title: 'PhD জীববিজ্ঞান · রিসার্চ সুপারভাইজার', img: '/images/instructors/shafiul.jpg' },
    rafik: { name: 'মোহাম্মদ রফিক', title: 'এমএ বাংলা · সিনিয়র শিক্ষক · BCS (প্রশাসন)', img: '/images/instructors/rafik.jpg' },
    sarah: { name: 'Sarah Johnson', title: 'British Council Certified Trainer', img: '/images/instructors/sarah.jpg' },
    nahid: { name: 'নাহিদ হোসেন', title: 'Senior Software Engineer, ৮+ বছর', img: '/images/instructors/nahid.jpg' },
    farhana: { name: 'প্রফেসর ফারহানা সুলতানা', title: 'হিসাববিজ্ঞান, ঢাকা কলেজ · ১৪ বছরের অভিজ্ঞতা', img: '/images/instructors/farhana.jpg' },
    kamrul: { name: 'ড. কামরুল হাসান', title: 'অর্থনীতি বিভাগ, চট্টগ্রাম বিশ্ববিদ্যালয়', img: '/images/instructors/kamrul.jpg' },
  }

  // ── 30 Demo Courses (Class 9 → Honours 4th Year) ──
  type CourseSeed = {
    slug: string; title: string; subtitle: string; catSlug: string; subject: string;
    price: number; discountPrice?: number; level: string; inst: keyof typeof INST;
    thumb: string; featured?: boolean; chapters: string[];
  }
  const courseSeeds: CourseSeed[] = [
    // ══ নবম শ্রেণি (4) ══
    { slug: 'class9-math', title: 'নবম শ্রেণির গণিত — পূর্ণাঙ্গ গাইড', subtitle: 'বীজগণিত, জ্যামিতি ও পরিমিতি — প্রতিটি অধ্যায়ের সহজ ব্যাখ্যা ও অনুশীলনী সমাধানসহ', catSlug: 'class-9', subject: 'গণিত', price: 1290, discountPrice: 990, level: 'BEGINNER', inst: 'mizanur', thumb: '/images/courses/class9-math.jpg', featured: true, chapters: ['বীজগণিতীয় রাশি', 'সেট ও ফাংশন', 'জ্যামিতিক অঙ্কন'] },
    { slug: 'class9-science', title: 'নবম শ্রেণির বিজ্ঞান — সহজভাবে শিখুন', subtitle: 'জীবনের ধারা থেকে আলোর প্রতিসরণ — প্রতিটি ধারণা চিত্রসহ বোঝানো', catSlug: 'class-9', subject: 'বিজ্ঞান', price: 1190, discountPrice: 890, level: 'BEGINNER', inst: 'anisur', thumb: '/images/courses/class9-science.jpg', chapters: ['জীবনের ধারা', 'কোষ বিভাজন', 'আলোর প্রতিসরণ'] },
    { slug: 'class9-bangla', title: 'নবম-দশম বাংলা ব্যাকরণ ও নির্মিতি', subtitle: 'ব্যাকরণের ভয় দূর করুন — সমাস, উপসর্গ, রচনা ও সারমর্ম মাস্টারক্লাস', catSlug: 'class-9', subject: 'বাংলা', price: 890, level: 'BEGINNER', inst: 'rafik', thumb: '/images/courses/class9-bangla.jpg', chapters: ['উপসর্গ ও প্রত্যয়', 'সমাস', 'রচনা লেখা কৌশল'] },
    { slug: 'class9-english', title: 'নবম শ্রেণির ইংরেজি ফাউন্ডেশন', subtitle: 'Grammar + seen/unseen passage — ভিত্তি মজবুত করার সম্পূর্ণ কোর্স', catSlug: 'class-9', subject: 'ইংরেজি', price: 890, discountPrice: 690, level: 'BEGINNER', inst: 'tanvir', thumb: '/images/courses/hsc-english-v2.jpg', chapters: ['Tense Foundations', 'Paragraph & Composition', 'Seen Passage Mastery'] },
    // ══ দশম শ্রেণি / SSC (4) ══
    { slug: 'ssc-physics', title: 'এসএসসি পদার্থবিজ্ঞান — পূর্ণাঙ্গ কোর্স', subtitle: 'অধ্যায়ভিত্তিক ভিডিও ক্লাস, লেকচার শিট ও উত্তরপত্রসহ', catSlug: 'class-10', subject: 'পদার্থবিজ্ঞান', price: 1990, discountPrice: 1490, level: 'BEGINNER', inst: 'anisur', thumb: '/images/courses/ssc-physics.jpg', featured: true, chapters: ['ভৌত রাশি ও পরিমাপ', 'গতি', 'কাজ, শক্তি ও ক্ষমতা'] },
    { slug: 'ssc-math', title: 'এসএসসি গণিত ম্যাজিক', subtitle: 'অ্যালজেব্রা থেকে জ্যামিতি — শর্টকাটসহ সম্পূর্ণ প্রস্তুতি', catSlug: 'class-10', subject: 'গণিত', price: 1490, discountPrice: 1190, level: 'BEGINNER', inst: 'mizanur', thumb: '/images/courses/ssc-math.jpg', featured: true, chapters: ['সেট ও ফাংশন', 'বীজগাণিতীয় রাশি', 'ত্রিকোণমিতি'] },
    { slug: 'ssc-chemistry', title: 'এসএসসি রসায়ন — বোর্ড প্রশ্ন ফোকাসড', subtitle: 'পদার্থের অবস্থা থেকে রাসায়নিক বিক্রিয়া — সব বোর্ডের প্রশ্ন বিশ্লেষণসহ', catSlug: 'class-10', subject: 'রসায়ন', price: 1590, discountPrice: 1290, level: 'BEGINNER', inst: 'salma', thumb: '/images/courses/ssc-chemistry.jpg', chapters: ['পদার্থের অবস্থা', 'পরমাণুর গঠন', 'রাসায়নিক বিক্রিয়া'] },
    { slug: 'ssc-ict', title: 'এসএসসি আইসিটি — পূর্ণ মার্কসের নিশ্চয়তা কৌশল', subtitle: 'গ্লোবাল ভিলেজ থেকে ডেটা নিরাপত্তা — সৃজনশীল ও MCQ দুটোই কভার', catSlug: 'class-10', subject: 'তথ্য ও যোগাযোগ প্রযুক্তি', price: 990, discountPrice: 790, level: 'BEGINNER', inst: 'nahid', thumb: '/images/courses/ssc-ict.jpg', chapters: ['গ্লোবাল ভিলেজ', 'নেটওয়ার্কিং ও ইন্টারনেট', 'ডেটা নিরাপত্তা ও সাইবার অপরাধ'] },
    // ══ একাদশ শ্রেণি / HSC 1st Year (4) ══
    { slug: 'hsc-physics1', title: 'এইচএসসি পদার্থবিজ্ঞান ১ম পত্র', subtitle: 'ভেক্টর থেকে কাজ-শক্তি — কলেজ প্রথম বর্ষের জন্য পূর্ণাঙ্গ প্রস্তুতি', catSlug: 'class-11', subject: 'পদার্থবিজ্ঞান', price: 2190, discountPrice: 1790, level: 'INTERMEDIATE', inst: 'anisur', thumb: '/images/courses/hsc-physics.jpg', featured: true, chapters: ['ভেক্টর', 'নিউটনিয়ান বলবিদ্যা', 'কাজ, ক্ষমতা ও শক্তি'] },
    { slug: 'hsc-biology1', title: 'এইচএসসি জীববিজ্ঞান ১ম পত্র', subtitle: 'কোষ থেকে টিস্যুতন্ত্র — মেডিকেল স্বপ্নদুষ্টদের জন্য ফাউন্ডেশন কোর্স', catSlug: 'class-11', subject: 'জীববিজ্ঞান', price: 1990, discountPrice: 1590, level: 'INTERMEDIATE', inst: 'shafiul', thumb: '/images/courses/hsc-biology.jpg', chapters: ['কোষ ও এর গঠন', 'কোষ বিভাজন', 'টিস্যু ও টিস্যুতন্ত্র'] },
    { slug: 'hsc-higher-math1', title: 'এইচএসসি উচ্চতর গণিত ১ম পত্র', subtitle: 'ম্যাট্রিক্স, সরলরেখা ও বৃত্ত — বোর্ড ও ভর্তি পরীক্ষার কম্বো প্রস্তুতি', catSlug: 'class-11', subject: 'উচ্চতর গণিত', price: 2090, discountPrice: 1690, level: 'INTERMEDIATE', inst: 'mizanur', thumb: '/images/courses/hsc-higher-math.jpg', featured: true, chapters: ['ম্যাট্রিক্স ও নির্ণায়ক', 'সরলরেখা', 'বৃত্ত'] },
    { slug: 'hsc-english', title: 'HSC English Grammar & Writing', subtitle: 'গ্রামার + রাইটিং সেকশনে ৯০%+ স্কোরের গ্যারান্টি কৌশল', catSlug: 'class-11', subject: 'ইংরেজি', price: 990, level: 'BEGINNER', inst: 'tanvir', thumb: '/images/courses/hsc-english-v2.jpg', chapters: ['Grammar Foundations', 'Writing Skills', 'Board Question Practice'] },
    // ══ দ্বাদশ শ্রেণি / HSC 2nd Year (4) ══
    { slug: 'hsc-physics2', title: 'এইচএসসি পদার্থবিজ্ঞান ২য় পত্র', subtitle: 'তাপগতিবিদ্যা, স্থির বিদ্যুৎ ও আধুনিক পদার্থবিজ্ঞান — বোর্ড প্রশ্নসহ', catSlug: 'class-12', subject: 'পদার্থবিজ্ঞান', price: 2190, discountPrice: 1790, level: 'INTERMEDIATE', inst: 'anisur', thumb: '/images/courses/hsc-physics.jpg', chapters: ['তাপগতিবিদ্যা', 'স্থির বিদ্যুৎ', 'আধুনিক পদার্থবিজ্ঞান'] },
    { slug: 'hsc-chemistry2', title: 'এইচএসসি রসায়ন ২য় পত্র', subtitle: 'জৈব রসায়ন মাস্টারক্লাস + বোর্ড প্রশ্ন সমাধান', catSlug: 'class-12', subject: 'রসায়ন', price: 1990, discountPrice: 1590, level: 'INTERMEDIATE', inst: 'salma', thumb: '/images/courses/hsc-chemistry2-v2.jpg', featured: true, chapters: ['জৈব যৌগ', 'তড়িৎ রসায়ন', 'পরিবেশ রসায়ন'] },
    { slug: 'hsc-biology2', title: 'এইচএসসি জীববিজ্ঞান ২য় পত্র', subtitle: 'জিনতত্ত্ব, প্রাণীর শারীরতত্ত্ব ও জীবপ্রযুক্তি — চিত্রসহ সহজ ব্যাখ্যা', catSlug: 'class-12', subject: 'জীববিজ্ঞান', price: 1990, discountPrice: 1590, level: 'INTERMEDIATE', inst: 'shafiul', thumb: '/images/courses/hsc-biology.jpg', chapters: ['জিনতত্ত্ব ও বিবর্তন', 'প্রাণীর শারীরতত্ত্ব', 'জীবপ্রযুক্তি'] },
    { slug: 'hsc-higher-math2', title: 'এইচএসসি উচ্চতর গণিত ২য় পত্র', subtitle: 'যোগাজ, সংযুক্ত কোণ ও ফাংশনের লেখচিত্র — সমাধানসহ প্রস্তুতি', catSlug: 'class-12', subject: 'উচ্চতর গণিত', price: 2090, discountPrice: 1690, level: 'INTERMEDIATE', inst: 'mizanur', thumb: '/images/courses/hsc-higher-math.jpg', chapters: ['যোগাজ ও ভেক্টর', 'সংযুক্ত কোণের ত্রিকোণমিতিক অনুপাত', 'ফাংশন ও ফাংশনের লেখচিত্র'] },
    // ══ অনার্স ১ম বর্ষ (4) ══
    { slug: 'honours-accounting1', title: 'অনার্স ১ম বর্ষ — হিসাববিজ্ঞানের মূলনীতি', subtitle: 'জাবেদা-খতিয়ান থেকে আর্থিক বিবরণী — শূন্য থেকে পরীক্ষার প্রস্তুতি', catSlug: 'honours-1st-year', subject: 'হিসাববিজ্ঞান', price: 2490, discountPrice: 1990, level: 'BEGINNER', inst: 'farhana', thumb: '/images/courses/honours-accounting.jpg', featured: true, chapters: ['হিসাববিজ্ঞানের সূচনা', 'জাবেদা ও খতিয়ান', 'আর্থিক বিবরণী'] },
    { slug: 'honours-economics1', title: 'অনার্স ১ম বর্ষ — অর্থনীতির মূলনীতি', subtitle: 'চাহিদা-যোগান থেকে ভোক্তা আচরণ — নোটস, মডেল প্রশ্ন ও সমাধান', catSlug: 'honours-1st-year', subject: 'অর্থনীতি', price: 2390, discountPrice: 1890, level: 'BEGINNER', inst: 'kamrul', thumb: '/images/courses/honours-economics.jpg', chapters: ['অর্থনীতির মৌলিক ধারণা', 'চাহিদা ও যোগান', 'ভোক্তা আচরণ'] },
    { slug: 'honours-management1', title: 'অনার্স ১ম বর্ষ — ব্যবসায় সংগঠন ও ব্যবস্থাপনা', subtitle: 'ব্যবসায়ের ভিত্তি, ব্যবস্থাপনার নীতি ও নেতৃত্ব — বাংলা মিডিয়ামে পূর্ণ কোর্স', catSlug: 'honours-1st-year', subject: 'ব্যবস্থাপনা', price: 2290, discountPrice: 1790, level: 'BEGINNER', inst: 'farhana', thumb: '/images/courses/honours-management.jpg', chapters: ['ব্যবসায়ের পরিচিতি', 'ব্যবস্থাপনার নীতি', 'নেতৃত্ব ও প্রেষণা'] },
    { slug: 'honours-cse1', title: 'অনার্স ১ম বর্ষ — কম্পিউটার ফান্ডামেন্টাল ও প্রোগ্রামিং (C)', subtitle: 'হার্ডওয়্যার বেসিক থেকে C প্রোগ্রামিং — হাতে-কলমে প্র্যাকটিসসহ', catSlug: 'honours-1st-year', subject: 'কম্পিউটার সায়েন্স', price: 2790, discountPrice: 2290, level: 'BEGINNER', inst: 'nahid', thumb: '/images/courses/web-development.jpg', chapters: ['কম্পিউটারের মৌলিক ধারণা', 'C প্রোগ্রামিং বেসিক', 'লুপ ও ফাংশন'] },
    // ══ অনার্স ২য় বর্ষ (4) ══
    { slug: 'honours-management2', title: 'অনার্স ২য় বর্ষ — ব্যবস্থাপনা নীতি ও প্র্যাকটিস', subtitle: 'পরিকল্পনা, সিদ্ধান্ত গ্রহণ ও দলগত ব্যবস্থাপনা — কেস স্টাডিসহ', catSlug: 'honours-2nd-year', subject: 'ব্যবস্থাপনা', price: 2490, discountPrice: 1990, level: 'INTERMEDIATE', inst: 'farhana', thumb: '/images/courses/honours-management.jpg', chapters: ['পরিকল্পনা ও সিদ্ধান্ত গ্রহণ', 'সংগঠন ও নিয়ন্ত্রণ', 'দলগত ব্যবস্থাপনা'] },
    { slug: 'honours-statistics2', title: 'অনার্স ২য় বর্ষ — বিজনেস পরিসংখ্যান', subtitle: 'কেন্দ্রীয় প্রবণতা থেকে সম্ভাবনা — ক্যালকুলেটর টেকনিকসহ মাস্টারক্লাস', catSlug: 'honours-2nd-year', subject: 'পরিসংখ্যান', price: 2390, discountPrice: 1890, level: 'INTERMEDIATE', inst: 'mizanur', thumb: '/images/courses/honours-statistics.jpg', chapters: ['কেন্দ্রীয় প্রবণতা', 'বিস্তার পরিমাপ', 'সম্ভাবনা'] },
    { slug: 'honours-micro2', title: 'অনার্স ২য় বর্ষ — মাইক্রোইকোনমিক্স', subtitle: 'চাহিদা বিশ্লেষণ, উৎপাদন ও বাজার কাঠামো — গ্রাফ আঁকার কৌশলসহ', catSlug: 'honours-2nd-year', subject: 'অর্থনীতি', price: 2490, discountPrice: 1990, level: 'INTERMEDIATE', inst: 'kamrul', thumb: '/images/courses/honours-economics.jpg', chapters: ['চাহিদা বিশ্লেষণ', 'উৎপাদন ও ব্যয়', 'বাজার কাঠামো'] },
    { slug: 'honours-research2', title: 'অনার্স ২য় বর্ষ — গবেষণা পদ্ধতি ও ডেটা অ্যানালাইসিস', subtitle: 'স্যাম্পলিং, প্রশ্নপত্র ডিজাইন ও SPSS বেসিক — রিপোর্ট টেমপ্লেটসহ', catSlug: 'honours-2nd-year', subject: 'গবেষণা পদ্ধতি', price: 2690, discountPrice: 2190, level: 'ADVANCED', inst: 'kamrul', thumb: '/images/courses/honours-research.jpg', chapters: ['গবেষণার ভিত্তি', 'স্যাম্পলিং ও ডেটা সংগ্রহ', 'SPSS ও রিপোর্টিং'] },
    // ══ অনার্স ৩য় বর্ষ (3) ══
    { slug: 'honours-marketing3', title: 'অনার্স ৩য় বর্ষ — মার্কেটিং ম্যানেজমেন্ট', subtitle: '৪P থেকে ডিজিটাল মার্কেটিং — লাইভ কেস স্টাডি ও প্রেজেন্টেশনসহ', catSlug: 'honours-3rd-year', subject: 'মার্কেটিং', price: 2590, discountPrice: 2090, level: 'INTERMEDIATE', inst: 'farhana', thumb: '/images/courses/honours-marketing.jpg', chapters: ['মার্কেটিং মিক্স', 'ভোক্তা আচরণ', 'ডিজিটাল মার্কেটিং'] },
    { slug: 'honours-finance3', title: 'অনার্স ৩য় বর্ষ — ব্যাংকিং ও ফাইন্যান্স', subtitle: 'মুদ্রাবাজার, ব্যাংকিং ব্যবস্থা ও ইনভেস্টমেন্ট — সমীকরণ সমাধানসহ', catSlug: 'honours-3rd-year', subject: 'ফাইন্যান্স', price: 2590, discountPrice: 2090, level: 'INTERMEDIATE', inst: 'kamrul', thumb: '/images/courses/honours-finance.jpg', chapters: ['ব্যাংকিং ব্যবস্থা', 'মুদ্রা ও মূলধন বাজার', 'ইনভেস্টমেন্ট ম্যানেজমেন্ট'] },
    { slug: 'honours-dev-econ3', title: 'অনার্স ৩য় বর্ষ — উন্নয়ন অর্থনীতি', subtitle: 'উন্নয়নের তত্ত্ব, দারিদ্র্য ও বৈষম্য — বাংলাদেশ কনটেক্সটে বিশ্লেষণ', catSlug: 'honours-3rd-year', subject: 'অর্থনীতি', price: 2390, discountPrice: 1890, level: 'INTERMEDIATE', inst: 'kamrul', thumb: '/images/courses/honours-economics.jpg', chapters: ['উন্নয়নের তত্ত্ব', 'দারিদ্র্য ও বৈষম্য', 'মানব সম্পদ উন্নয়ন'] },
    // ══ অনার্স ৪র্থ বর্ষ (3) ══
    { slug: 'honours-thesis4', title: 'অনার্স ৪র্থ বর্ষ — থিসিস ও রিসার্চ রাইটিং', subtitle: 'টপিক সিলেকশন থেকে ডিফেন্স — স্যাম্পল থিসিস ও টেমপ্লেটসহ A-Z গাইড', catSlug: 'honours-4th-year', subject: 'গবেষণা', price: 2990, discountPrice: 2490, level: 'ADVANCED', inst: 'sarah', thumb: '/images/courses/honours-research.jpg', featured: true, chapters: ['টপিক সিলেকশন ও প্রপোজাল', 'লিটারেচার রিভিউ', 'থিসিস রাইটিং ও ডিফেন্স'] },
    { slug: 'honours-viva4', title: 'অনার্স ৪র্থ বর্ষ — ইন্টার্নশিপ রিপোর্ট ও ভাইভা প্রস্তুতি', subtitle: 'রিপোর্ট ফরম্যাট, ভাইভা বোর্ডের কমন প্রশ্ন ও প্রেজেন্টেশন স্কিল', catSlug: 'honours-4th-year', subject: 'ক্যারিয়ার', price: 1990, discountPrice: 1490, level: 'BEGINNER', inst: 'farhana', thumb: '/images/courses/honours-viva.jpg', chapters: ['ইন্টার্নশিপ রিপোর্ট ফরম্যাট', 'ভাইভা বোর্ড প্রস্তুতি', 'প্রেজেন্টেশন স্কিল'] },
    { slug: 'honours-career4', title: 'অনার্স শেষ বর্ষ — ক্যারিয়ার ও BCS/ব্যাংক জব প্রস্তুতি', subtitle: 'গ্র্যাজুয়েশনের পাশাপাশি চাকরির প্রস্তুতি — বাংলা, ইংরেজি ও সাধারণ জ্ঞান', catSlug: 'honours-4th-year', subject: 'ক্যারিয়ার', price: 2990, discountPrice: 2490, level: 'ADVANCED', inst: 'rafik', thumb: '/images/courses/bcs-preliminary.jpg', chapters: ['বাংলা ও ইংরেজি ফাউন্ডেশন', 'সাধারণ জ্ঞান ও সংবিধান', 'লিখিত ও ভাইভা কৌশল'] },
  ]

  if (courseSeeds.length !== 30) throw new Error(`Expected 30 courses, got ${courseSeeds.length}`)

  const courseIds: Record<string, string> = {}
  for (const c of courseSeeds) {
    const ins = INST[c.inst]
    const created = await db.course.create({
      data: {
        title: c.title,
        slug: c.slug,
        subtitle: c.subtitle,
        description: `${c.title} — পাঠশালার অন্যতম জনপ্রিয় কোর্স, বিশেষভাবে সাজানো ${c.subject} বিষয়ের শিক্ষার্থীদের জন্য। ${c.subtitle} কোর্সটিতে রয়েছে রেকর্ডেড HD ভিডিও ক্লাস, ডাউনলোডযোগ্য লেকচার শিট, চ্যাপ্টারওয়াইজ পরীক্ষা এবং ইন্সট্রাক্টর সাপোর্ট। অভিজ্ঞ ইন্সট্রাক্টর ${ins.name} আপনাকে শূন্য থেকে শুরু করিয়ে চূড়ান্ত প্রস্তুতির মাঝামাঝি নিয়ে যাবেন। কোর্স শেষে সার্টিফিকেট এবং আজীবন অ্যাক্সেস পাবেন।`,
        price: c.price,
        discountPrice: c.discountPrice,
        thumbnail: c.thumb,
        level: c.level,
        isFeatured: !!c.featured,
        instructorName: ins.name,
        instructorTitle: ins.title,
        instructorImage: ins.img,
        instructorBio: '১০+ বছরের শিক্ষকতা অভিজ্ঞতা। হাজারো শিক্ষার্থীকে সফলতার পথে এগিয়ে নিয়েছেন।',
        subject: c.subject,
        categoryId: cat[c.catSlug],
      },
    })
    courseIds[c.slug] = created.id
  }

  // ── Chapters & Lessons for ALL 30 courses ──
  for (const c of courseSeeds) {
    for (let ci = 0; ci < c.chapters.length; ci++) {
      const chTitle = c.chapters[ci]
      const ch = await db.chapter.create({
        data: { title: `অধ্যায় ${ci + 1}: ${chTitle}`, order: ci + 1, courseId: courseIds[c.slug] },
      })
      const lessons: { title: string; type: string; url?: string; dur?: number; preview?: boolean; content?: string }[] = [
        { title: `${chTitle} — মূল ক্লাস (ধারণা ও সূত্র)`, type: 'VIDEO', url: nextVideo(), dur: nextDur(), preview: ci === 0 },
        { title: `${chTitle} — সমাধান ও অনুশীলনী ক্লাস`, type: 'VIDEO', url: nextVideo(), dur: nextDur() },
        { title: `${chTitle} — লেকচার শিট (PDF ডাউনলোড)`, type: 'PDF' },
      ]
      if (ci === 0) {
        lessons.unshift({ title: 'কোর্স ইন্ট্রো ও সিলেবাস ব্যাখ্যা', type: 'VIDEO', url: nextVideo(), dur: nextDur(), preview: true })
        lessons.push({ title: 'কোর্স গাইডলাইন ও পরীক্ষা কৌশল', type: 'TEXT', content: 'এই লেসনে কোর্স পরিচিতি, পরীক্ষার মার্কস বিভাজন এবং ইন্সট্রাক্টরের পরামর্শ বিস্তারিতভাবে দেওয়া হয়েছে। অনুগ্রহ করে পুরো নোটটি পড়ে পরবর্তী ক্লাসে যান।' })
      }
      for (let li = 0; li < lessons.length; li++) {
        const l = lessons[li]
        await db.lesson.create({
          data: {
            title: l.title,
            type: l.type,
            videoUrl: l.type === 'VIDEO' ? l.url ?? V('BigBuckBunny') : null,
            content: l.type === 'TEXT' ? l.content ?? 'বিস্তারিত নোট এখানে দেওয়া হয়েছে। ইন্সট্রাক্টরের নির্দেশনা অনুসরণ করে অনুশীলন করুন।' : null,
            duration: l.dur ?? null,
            isPreview: !!l.preview,
            order: li + 1,
            chapterId: ch.id,
          },
        })
      }
    }
  }

  // ── Quizzes ──
  const q1 = await db.quiz.create({
    data: {
      title: 'এসএসসি পদার্থবিজ্ঞান মডেল টেস্ট ০১',
      description: 'ভৌত রাশি, গতি ও শক্তি অধ্যায়ের উপর মডেল টেস্ট',
      type: 'EXAM',
      courseId: courseIds['ssc-physics'],
      durationMin: 10,
      questions: {
        create: [
          { text: 'আলোর বেগ কত?', options: JSON.stringify(['৩×১০⁵ m/s', '৩×১০⁸ m/s', '৩×১০⁶ m/s', '৩×১০⁹ m/s']), correctIndex: 1, order: 1 },
          { text: 'নিউটনের কোন সূত্র থেকে বলের পরিমাপ পাওয়া যায়?', options: JSON.stringify(['১ম সূত্র', '২য় সূত্র', '৩য় সূত্র', 'মহাকর্ষ সূত্র']), correctIndex: 1, order: 2 },
          { text: 'কাজের একক কোনটি?', options: JSON.stringify(['নিউটন', 'জুল', 'ওয়াট', 'প্যাসকেল']), correctIndex: 1, order: 3 },
          { text: '১ অশ্বক্ষমতা (HP) সমান কত ওয়াট?', options: JSON.stringify(['746 W', '1000 W', '500 W', '100 W']), correctIndex: 0, order: 4 },
          { text: 'ভূমিকম্পের তীব্রতা মাপা হয় কী দিয়ে?', options: JSON.stringify(['থার্মোমিটার', 'ব্যারোমিটার', 'রিখটার স্কেল', 'অ্যানিমোমিটার']), correctIndex: 2, order: 5 },
        ],
      },
    },
  })

  const q2 = await db.quiz.create({
    data: {
      title: 'গণিত স্পিড টেস্ট — সেট ও ফাংশন',
      description: 'শর্টকাট প্রযুক্তি প্রয়োগ করে দ্রুত সমাধান',
      type: 'EXAM',
      courseId: courseIds['ssc-math'],
      durationMin: 8,
      questions: {
        create: [
          { text: 'A = {১,২,৩} হলে A এর উপসেট সংখ্যা কত?', options: JSON.stringify(['৬', '৭', '৮', '৯']), correctIndex: 2, order: 1 },
          { text: 'log₁₀100 = ?', options: JSON.stringify(['১', '২', '১০', '১০০']), correctIndex: 1, order: 2 },
          { text: '২⁵ × ২³ = ?', options: JSON.stringify(['২⁸', '২¹⁵', '৪⁸', '২²']), correctIndex: 0, order: 3 },
          { text: 'f(x) = x² হলে f(৩) = ?', options: JSON.stringify(['৬', '৮', '৯', '১২']), correctIndex: 2, order: 4 },
          { text: 'সেট A ∩ A = ?', options: JSON.stringify(['∅', 'A', 'U', "A'"]), correctIndex: 1, order: 5 },
        ],
      },
    },
  })

  const q3 = await db.quiz.create({
    data: {
      title: 'নবম শ্রেণির বিজ্ঞান কুইজ',
      description: 'জীবনের ধারা, কোষ বিভাজন ও আলো — মৌলিক ধারণা যাচাই',
      type: 'EXAM',
      courseId: courseIds['class9-science'],
      durationMin: 6,
      questions: {
        create: [
          { text: 'কোষের আবিষ্কারক কে?', options: JSON.stringify(['রবার্ট হুক', 'লিউয়েনহক', 'চার্লস ডারউইন', 'মেন্ডেল']), correctIndex: 0, order: 1 },
          { text: 'সালোকসংশ্লেষণের সময় কোন গ্যাস নির্গত হয়?', options: JSON.stringify(['কার্বন ডাই-অক্সাইড', 'নাইট্রোজেন', 'অক্সিজেন', 'হাইড্রোজেন']), correctIndex: 2, order: 2 },
          { text: 'মানবদেহের সবচেয়ে বড় গ্রন্থি কোনটি?', options: JSON.stringify(['থাইরয়েড', 'যকৃত', 'অগ্ন্যাশয়', 'পিটুইটারি']), correctIndex: 1, order: 3 },
          { text: 'আলোর প্রতিসরণ কেন ঘটে?', options: JSON.stringify(['প্রতিফলনের কারণে', 'মাধ্যম পরিবর্তনের কারণে', 'উত্তাপের কারণে', 'পরিবর্ধনের কারণে']), correctIndex: 1, order: 4 },
          { text: 'পানির রাসায়নিক সংকেত কোনটি?', options: JSON.stringify(['CO₂', 'O₂', 'H₂O', 'NaCl']), correctIndex: 2, order: 5 },
        ],
      },
    },
  })

  const q4 = await db.quiz.create({
    data: {
      title: 'এইচএসসি জীববিজ্ঞান ২য় পত্র মক টেস্ট',
      description: 'জিনতত্ত্ব ও শারীরতত্ত্ব — বোর্ড স্ট্যান্ডার্ড MCQ',
      type: 'EXAM',
      courseId: courseIds['hsc-biology2'],
      durationMin: 8,
      questions: {
        create: [
          { text: 'মিওসিস বিভাজনে ক্রোমোজোম সংখ্যা কী হয়?', options: JSON.stringify(['দ্বিগুণ হয়', 'অর্ধেক হয়', 'অপরিবর্তিত থাকে', 'তিনগুণ হয়']), correctIndex: 1, order: 1 },
          { text: 'DNA-এর দ্বি-হেলিক্স মডেল কে প্রদান করেন?', options: JSON.stringify(['মেন্ডেল', 'ওয়াটসন ও ক্রিক', 'ডারউইন', 'ল্যামার্ক']), correctIndex: 1, order: 2 },
          { text: 'মেন্ডেল কোন গাছ নিয়ে গবেষণা করেছেন?', options: JSON.stringify(['মটর', 'ভুট্টা', 'ধান', 'সরিষা']), correctIndex: 0, order: 3 },
          { text: 'সুস্থ মানুষের রক্তের pH আনুমানিক কত?', options: JSON.stringify(['৬.২', '৭.৪', '৮.৫', '৫.৬']), correctIndex: 1, order: 4 },
          { text: 'ইনসুলিন হরমোন নিঃসৃত হয় কোথা থেকে?', options: JSON.stringify(['যকৃত', 'বৃক্ক', 'অগ্ন্যাশয়', 'প্লীহা']), correctIndex: 2, order: 5 },
        ],
      },
    },
  })

  const q5 = await db.quiz.create({
    data: {
      title: 'অনার্স অর্থনীতি কুইজ — মৌলিক ধারণা',
      description: 'অর্থনীতির মূলনীতি অধ্যায়ের যাচাই',
      type: 'EXAM',
      courseId: courseIds['honours-economics1'],
      durationMin: 6,
      questions: {
        create: [
          { text: 'অর্থনীতির জনক কে বলা হয়?', options: JSON.stringify(['কেইনস', 'অ্যাডাম স্মিথ', 'মার্শাল', 'রিকার্ডো']), correctIndex: 1, order: 1 },
          { text: 'চাহিদার সূত্র অনুযায়ী দাম বাড়লে চাহিদা কী হয়?', options: JSON.stringify(['বাড়ে', 'কমে', 'অপরিবর্তিত থাকে', 'শূন্য হয়ে যায়']), correctIndex: 1, order: 2 },
          { text: 'GDP-র পূর্ণরূপ কী?', options: JSON.stringify(['গ্রস ডোমেস্টিক প্রোডাক্ট', 'জেনারেল ডেভেলপমেন্ট প্ল্যান', 'গ্র্যান্ড প্রোডাক্ট ডিজাইন', 'গ্রোথ ডোমেস্টিক প্রোফিট']), correctIndex: 0, order: 3 },
          { text: 'মুদ্রাস্ফীতি বলতে কী বোঝায়?', options: JSON.stringify(['দামের অব্যাহত হ্রাস', 'দামের অব্যাহত বৃদ্ধি', 'বেকারত্ব বৃদ্ধি', 'মুদ্রার মান বৃদ্ধি']), correctIndex: 1, order: 4 },
          { text: 'অতিরিক্ত একক পণ্য ভোগ করলে যে উপযোগিতা পাওয়া যায় তাকে কী বলে?', options: JSON.stringify(['টোটাল ইউটিলিটি', 'মার্জিনাল ইউটিলিটি', 'অ্যাভারেজ ইউটিলিটি', 'নেগেটিভ ইউটিলিটি']), correctIndex: 1, order: 5 },
        ],
      },
    },
  })

  // Course-attached practice QUIZ (appears in the classroom sidebar)
  const q6 = await db.quiz.create({
    data: {
      title: 'স্বল্প প্রশ্নে অনুশীলনী — লেসন ১',
      description: 'ক্লাসরুমের অনুশীলনী কুইজ — প্রথম অধ্যায়ের উপর ভিত্তি মজবুত করুন।',
      type: 'QUIZ',
      courseId: courseIds['ssc-physics'],
      durationMin: 5,
      questions: {
        create: [
          { text: 'নিচের কোনটি সঠিক?', options: JSON.stringify(['অপশন ক', 'অপশন খ', 'অপশন গ', 'অপশন ঘ']), correctIndex: 0, order: 1 },
          { text: 'কোনটি ভুল উদাহরণ?', options: JSON.stringify(['১', '২', '৩', '৪']), correctIndex: 3, order: 2 },
        ],
      },
    },
  })

  const allQuizzes = [q1, q2, q3, q4, q5, q6]
  void allQuizzes

  // ── Notices ──
  await db.notice.createMany({
    data: [
      { title: '🎉 ঈদ উপলক্ষে সব কোর্সে ২৫% ছাড় — সীমিত সময়ের জন্য!', body: 'ঈদুল ফিতর উপলক্ষে আমাদের সকল রেকর্ডেড কোর্সে বিশাল ছাড় চলমান। কুপন কোড EID25 ব্যবহার করে এখনই ভর্তি হোন। অফারটি ৭ দিনের জন্য কার্যকর।', type: 'URGENT', isBanner: true },
      { title: '⏰ এসএসসি পদার্থবিজ্ঞান লাইভ সমাধান ক্লাস শুক্রবার রাত ৯টায়', body: 'আগামী শুক্রবার রাত ৯টায় জুমে লাইভ সমাধান ক্লাস অনুষ্ঠিত হবে। সবাই উপস্থিত থাকার জন্য অনুরোধ করা হলো।', type: 'GENERAL', isBanner: true },
      { title: '📢 নতুন আপডেট: ৯ম শ্রেণি থেকে অনার্স ৪র্থ বর্ষ — মোট ৩০টি কোর্স!', body: 'পাঠশালায় এখন নবম শ্রেণি, দশম শ্রেণি (এসএসসি), একাদশ-দ্বাদশ শ্রেণি (এইচএসসি) এবং অনার্স ১ম-৪র্থ বর্ষের শিক্ষার্থীদের জন্য ৩০টি পূর্ণাঙ্গ কোর্স চালু হয়েছে। আজই আপনার ক্লাসের কোর্স বেছে নিন!', type: 'GENERAL', isBanner: true },
      { title: '🏆 মাসিক লিডারবোর্ড প্রকাশ — শীর্ষ ১০ জন পাবেন ফ্রি সাজেশন প্যাক', body: 'অগাস্ট মাসের পরীক্ষা লিডারবোর্ড প্রকাশিত হয়েছে। ড্যাশবোর্ড থেকে আপনার র‍্যাঙ্ক দেখুন।', type: 'GENERAL' },
      { title: '📅 অনার্স ৪র্থ বর্ষ — থিসিস প্রস্তুতি ফ্রি সেমিনার', body: 'অনলাইন ফ্রি সেমিনারে অংশ নিতে নোটিফিকেশন প্যানেল থেকে রেজিস্ট্রেশন করুন। আসন সীমিত।', type: 'EVENT', isBanner: true },
      { title: '⚠️ সার্ভার রক্ষণাবেক্ষণ — শনিবার রাত ২টা থেকে ৪টা', body: 'এই সময়ে ভিডিও প্লেয়ার সাময়িকভাবে বন্ধ থাকবে। অসুবিধার জন্য দুঃখিত।', type: 'URGENT' },
    ],
  })

  // ── Suggestions / Materials ──
  const suggestions: { title: string; description: string; category: string; isFree: boolean; price?: number; file: [string, string[]] }[] = [
    { title: 'এসএসসি পদার্থবিজ্ঞান ফাইনাল সাজেশন ২০২৫', description: 'সব বোর্ডের প্রশ্ন বিশ্লেষণ করে তৈরি গুরুত্বপূর্ণ প্রশ্ন তালিকা', category: 'SSC', isFree: true, file: ['ssc-physics-suggestion.pdf', ['PathShala SSC Physics Suggestion 2025', '1. Vutir rashi o porimap', '2. Goti o taron', '3. Kaj, shokti o khomota', '4. Vugol o britto', 'Important questions from all boards.']] },
    { title: 'নবম-দশম শ্রেণির গণিত ফর্মুলা হ্যান্ডবুক', description: 'সব অধ্যায়ের সূত্র এক জায়গায় — মুখস্থ করার সেরা উপায়', category: 'SSC', isFree: true, file: ['class9-10-math-formula.pdf', ['PathShala Math Formula Handbook', 'Set & Function formulas', 'Algebra identities', 'Geometry theorems', 'Trigonometry ratios']] },
    { title: 'এইচএসসি রসায়ন ২য় পত্র নোট (জৈব)', description: 'রিঅ্যাকশন চার্টসহ সম্পূর্ণ জৈব রসায়ন নোট', category: 'HSC', isFree: false, price: 99, file: ['hsc-chemistry-organic.pdf', ['HSC Chemistry 2nd Paper Notes', 'Organic reactions map', 'Named reactions', 'Conversion tricks']] },
    { title: 'HSC English Writing Templates', description: 'Paragraph, report, letter — ২৫+ রেডি টেমপ্লেট', category: 'HSC', isFree: true, file: ['hsc-english-templates.pdf', ['HSC English Writing Templates', 'Paragraph templates', 'Report formats', 'Letter samples']] },
    { title: 'অনার্স হিসাববিজ্ঞান ফর্মুলা ও ফরম্যাট গাইড', description: 'জাবেদা থেকে আর্থিক বিবরণী — সব ফরম্যাট এক ফাইলে', category: 'HONOURS', isFree: true, file: ['honours-accounting-formats.pdf', ['Honours Accounting Formats Guide', 'Journal & Ledger formats', 'Trial balance', 'Income statement', 'Balance sheet layouts']] },
    { title: 'থিসিস রাইটিং টেমপ্লেট (অনার্স ৪র্থ বর্ষ)', description: 'প্রপোজাল, লিটারেচার রিভিউ ও ফুল থিসিস ফরম্যাট টেমপ্লেট', category: 'HONOURS', isFree: false, price: 149, file: ['honours-thesis-template.pdf', ['Honours Thesis Writing Template', 'Proposal format', 'Literature review structure', 'Methodology chapter', 'Reference styles (APA)']] },
    { title: 'BCS প্রিলিমিনারি প্রশ্নব্যাংক (৪৫-৪৭তম)', description: 'সম্পূর্ণ প্রশ্নপত্র ব্যাখ্যাসহ — ক্যারিয়ার প্রস্তুতির জন্য', category: 'JOB', isFree: true, file: ['bcs-45-47-solutions.pdf', ['BCS 45-47 Question Solutions', 'Bangla language & literature', 'English', 'General Knowledge with explanations']] },
    { title: 'পাঠশালা স্টাডি প্ল্যানার (মাসিক)', description: 'প্রিন্ট করে ব্যবহারযোগ্য স্টাডি ট্র্যাকার', category: 'GENERAL', isFree: true, file: ['study-planner.pdf', ['PathShala Monthly Study Planner', 'Week 1-4 goal sheets', 'Revision checklist', 'Mock test tracker']] },
  ]
  for (const s of suggestions) {
    const pdf = makePdf(s.file[0].replace('.pdf', ''), s.file[1])
    await db.suggestion.create({
      data: {
        title: s.title,
        description: s.description,
        category: s.category,
        isFree: s.isFree,
        price: s.price ?? null,
        fileName: s.file[0],
        fileType: 'application/pdf',
        fileSize: pdf.length,
        fileData: pdf.toString('base64'),
      },
    })
  }

  // ── Reviews: 2 handcrafted per course + 1 extra for featured → ~70 total ──
  const REVIEW_NAMES: [string, string][] = [
    ['তাসনিম আক্তার', 'নবম শ্রেণি'], ['সাব্বির আহমেদ', 'দশম শ্রেণি · SSC 2025'], ['মেহেদী হাসান', 'একাদশ শ্রেণি'],
    ['নুসরাত জাহান', 'দ্বাদশ শ্রেণি · HSC 2025'], ['আরিফুল ইসলাম', 'অনার্স ১ম বর্ষ'], ['ফারহানা রহমান', 'অনার্স ২য় বর্ষ'],
    ['ইমরান খান', 'অনার্স ৩য় বর্ষ'], ['জান্নাতুল ফেরদৌস', 'অনার্স ৪র্থ বর্ষ'], ['তানভীর হোসেন', 'GPA 5 · SSC 2024'],
    ['সুমাইয়া ইসলাম', 'A+ · HSC 2024'], ['রিফাত চৌধুরী', 'অনার্স ১ম বর্ষ · বিজনেস স্টাডিজ'], ['মারিয়া আক্তার', 'অনার্স ২য় বর্ষ · ম্যানেজমেন্ট'],
  ]
  const REVIEW_COMMENTS: ((subject: string, inst: string) => string)[] = [
    (s, i) => `${i} স্যারের ক্লাসগুলো একদম বেসিক থেকে শুরু — ${s} এখন আমার প্রিয় বিষয়!`,
    (s) => `ভিডিও ক্লাস আর লেকচার শিটের কম্বিনেশন দারুণ কাজে লেগেছে। ${s} এর বোর্ড প্রশ্ন সমাধানগুলো অসাধারণ।`,
    (s, i) => `${i} স্যার প্রতিটি স্টেপ এমনভাবে বোঝান যে ${s} এর ভয় একদম চলে যায়। হাইলি রেকমেন্ডেড!`,
    (s) => `অনুশীলনী সমাধান আর মডেল টেস্টগুলোর কারণে ${s} পরীক্ষায় আমার কনফিডেন্স লেভেল অন্যরকম ছিল।`,
    (s, i) => `কোর্সের স্ট্রাকচার খুবই গোছানো — ${i} স্যারের এক্সাম টিপস ফলো করে ${s} এ ভালো রেজাল্ট করেছি।`,
    (s) => `${s} কোর্সের PDF লেকচার শিটগুলো রিভিশনের জন্য পারফেক্ট। যেকোনো সময় দেখে নেওয়া যায়।`,
  ]

  /** Handcrafted reviews for the flagship courses (slug → list). */
  const specialReviews: Record<string, { userName: string; userRole: string; rating: number; comment: string }[]> = {
    'ssc-physics': [
      { userName: 'তাসনিম আক্তার', userRole: 'SSC 2024 · A+', rating: 5, comment: 'ভিডিও ক্লাসগুলো এত সুন্দরভাবে সাজানো যে আমি নিজের পড়া নিজেই ম্যানেজ করতে পেরেছি। পদার্থবিজ্ঞানে A+ পেয়েছি শুধু এই কোর্সের কারণে!' },
      { userName: 'জান্নাতুল ফেরদৌস', userRole: 'SSC 2023', rating: 5, comment: 'ক্লাসগুলো এতই মনোযোগী করে পড়ায় যে সময় কখন চলে যায় টেরই পাইনি। বেস্ট SSC পদার্থ কোর্স!' },
    ],
    'ssc-math': [
      { userName: 'আরিফুল ইসলাম', userRole: 'SSC 2024 · GPA 5', rating: 4, comment: 'গণিতের শর্টকাট টেকনিকগুলো দারুণ কাজে লেগেছে। চাই আরও বেশি অনুশীলনী প্রবলেম।' },
    ],
    'hsc-chemistry2': [
      { userName: 'ফারহানা রহমান', userRole: 'এইচএসসি ২০২৪', rating: 5, comment: 'জৈব রসায়ন আমার সবচেয়ে ভয়ের বিষয় ছিল। এখন এটাই আমার সবচেয়ে ভালো লাগার বিষয়!' },
      { userName: 'তানভীর হোসেন', userRole: 'HSC 2023', rating: 4, comment: 'লেকচার শিট আর ভিডিওর কম্বিনেশন পারফেক্ট। ডাউনলোড সেকশনে আরও ফ্রি ম্যাটেরিয়াল চাই।' },
    ],
    'hsc-english': [
      { userName: 'রাকিব হাসান', userRole: 'এইচএসসি ২০২৪', rating: 5, comment: 'Tense mastery ক্লাস দুটো স্কুল লাইফের সেরা ক্লাস ছিল। ৯২% পেয়েছি ইংরেজিতে।' },
    ],
  }

  let revIdx = 0
  for (const c of courseSeeds) {
    const inst = INST[c.inst]
    if (specialReviews[c.slug]) {
      for (const r of specialReviews[c.slug]) {
        await db.review.create({
          data: { userName: r.userName, userRole: r.userRole, rating: r.rating, comment: r.comment, courseId: courseIds[c.slug] },
        })
        revIdx++
      }
    }
    // 2 generated reviews per course (+1 extra for featured)
    const genCount = c.featured ? 2 : 2
    for (let k = 0; k < genCount; k++) {
      const [name, role] = REVIEW_NAMES[revIdx % REVIEW_NAMES.length]
      const comment = REVIEW_COMMENTS[revIdx % REVIEW_COMMENTS.length](c.subject, inst.name)
      const rating = revIdx % 4 === 3 ? 4 : 5
      await db.review.create({
        data: { userName: name, userRole: role, rating, comment, courseId: courseIds[c.slug] },
      })
      revIdx++
    }
  }

  // ── Orders + Enrollments (spread over last 14 days for analytics) ──
  const methods = ['BKASH', 'NAGAD', 'SSLCOMMERZ', 'STRIPE']
  let trxCounter = 1

  async function createOrder(user: { id: string }, slug: string, daysAgo: number, status: 'SUCCESS' | 'PENDING' | 'FAILED', price: number) {
    const method = methods[trxCounter % methods.length]
    const order = await db.order.create({
      data: {
        userId: user.id,
        courseId: courseIds[slug],
        amount: price,
        method,
        status,
        trxId: `PS${String(100000 + trxCounter)}${method.slice(0, 2)}`,
        createdAt: new Date(Date.now() - daysAgo * 24 * 3600 * 1000 - trxCounter * 3600 * 1000),
      },
    })
    trxCounter++
    if (status === 'SUCCESS') {
      await db.enrollment.create({
        data: {
          userId: user.id,
          courseId: courseIds[slug],
          progress: Math.floor(Math.random() * 70) + 10,
          completedLessonIds: '[]',
          enrolledAt: order.createdAt,
        },
      })
    }
    return order
  }

  const prices: Record<string, number> = {}
  for (const c of courseSeeds) prices[c.slug] = c.discountPrice ?? c.price

  // ~2 orders per course (30 courses → 60) + extra for rakib on flagship slugs
  const orderPlan: [number, string, number, 'SUCCESS' | 'PENDING' | 'FAILED'][] = []
  courseSeeds.forEach((c, ci) => {
    const studentIdx = (ci * 7) % 8
    const daysAgo = ci % 14
    let status: 'SUCCESS' | 'PENDING' | 'FAILED' = 'SUCCESS'
    if (ci % 9 === 8) status = 'PENDING'
    if (ci % 14 === 13) status = 'FAILED'
    orderPlan.push([studentIdx, c.slug, daysAgo, status])
    const studentIdx2 = (ci * 3 + 5) % 8
    const daysAgo2 = (ci * 2 + 3) % 14
    let status2: 'SUCCESS' | 'PENDING' | 'FAILED' = 'SUCCESS'
    if (ci % 11 === 7) status2 = 'PENDING'
    orderPlan.push([studentIdx2, c.slug, daysAgo2, status2])
  })
  // rakib's classroom: flagship enrollments
  orderPlan.push([0, 'ssc-physics', 6, 'SUCCESS'], [0, 'class9-math', 3, 'SUCCESS'], [0, 'honours-economics1', 1, 'SUCCESS'])
  // De-duplicate SUCCESS orders (Enrollment has @@unique([userId, courseId]))
  const seenEnroll = new Set<string>()
  for (let i = 0; i < orderPlan.length; i++) {
    const [idx, slug, days, status] = orderPlan[i]
    if (status === 'SUCCESS') {
      const key = `${slug}#${idx}`
      if (seenEnroll.has(key)) orderPlan[i] = [idx, slug, days, 'FAILED']
      else seenEnroll.add(key)
    }
  }
  for (const [studentIdx, slug, daysAgo, status] of orderPlan) {
    await createOrder(students[studentIdx], slug, daysAgo, status, prices[slug])
  }

  // ── Quiz attempts (leaderboard) ──
  const attemptPlan: [number, number, number, number][] = [
    [1, 0, 5, 214], [0, 0, 4, 301], [3, 0, 4, 412], [5, 0, 3, 358],
    [0, 1, 5, 187], [2, 1, 4, 240], [6, 1, 3, 322], [1, 2, 5, 456],
    [4, 2, 4, 512], [0, 3, 4, 198], [7, 3, 5, 165], [3, 4, 3, 276],
  ]
  const quizIds = [q1, q2, q3, q4, q5]
  for (const [studentIdx, qi, score, timeTaken] of attemptPlan) {
    await db.quizAttempt.create({
      data: {
        userId: students[studentIdx].id,
        quizId: quizIds[qi].id,
        score,
        total: 5,
        answers: '{}',
        timeTaken,
      },
    })
  }

  // ── Notifications for demo student (rakib) ──
  await db.notification.createMany({
    data: [
      { userId: rakib.id, title: '🎉 নতুন কোর্সে ভর্তি সম্পন্ন হয়েছে', body: 'এসএসসি পদার্থবিজ্ঞান কোর্সে আপনাকে স্বাগতম! আজই ক্লাস শুরু করুন।', type: 'COURSE', link: '#/dashboard' },
      { userId: rakib.id, title: '📝 নতুন পরীক্ষা প্রকাশিত হয়েছে', body: 'এসএসসি পদার্থবিজ্ঞান মডেল টেস্ট ০১ — ১০ মিনিটে ৫টি প্রশ্ন।', type: 'EXAM', link: '#/dashboard/exams' },
      { userId: rakib.id, title: '⚠️ জরুরি নোটিশ', body: 'ঈদ উপলক্ষে সব কোর্সে ২৫% ছাড় — সীমিত সময়ের অফার!', type: 'NOTICE', link: '#/notices' },
      { userId: rakib.id, title: '💰 পেমেন্ট সফল হয়েছে', body: 'আপনার ৳১,৪৯০ পেমেন্ট সফলভাবে সম্পন্ন হয়েছে। ধন্যবাদ!', type: 'PAYMENT' },
    ],
  })

  // ── SiteSetting singleton guard (fresh seeds always get the settings row) ──
  await db.siteSetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  })

  console.log('✅ Seed complete!')
  console.log('   Categories: 8 (Class 9 → Honours 4th Year)')
  console.log('   Courses: 30 demo courses with chapters, lessons, reviews')
  console.log('   Admin:   admin@pathshala.com / Admin@1234')
  console.log('   Student: rakib@pathshala.com / Student@123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())

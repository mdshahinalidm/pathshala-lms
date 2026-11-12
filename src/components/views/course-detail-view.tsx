'use client'

/**
 * CourseDetailView — public course landing: description/curriculum/reviews tabs,
 * sticky purchase card, preview lessons dialog, checkout/enroll flows.
 */

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  ChevronRight,
  Home,
  PlayCircle,
  FileBadge,
  Lock,
  BookOpen,
  Star,
  Check,
  Loader2,
  ShoppingBag,
  Download,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { EmptyState } from '@/components/shared/empty-state'
import { PdfBadge } from '@/components/shared/pdf-badge'
import { ValidityChip } from '@/components/shared/validity-chip'
import {
  ProtectedMp4Player, ProtectedYouTubePlayer, ProtectedIframePlayer, ProtectedVimeoPlayer,
} from '@/components/shared/protected-video'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet, apiPost } from '@/lib/api-client'
import { validityChipLabel } from '@/lib/course-validity'
import { fmtBDT, fmtClock, fmtDate } from '@/lib/format'
import { resolveVideoUrl, isFileUrl, pdfEmbedSrc } from '@/lib/video'

interface DetailLesson {
  id: string
  title: string
  type: 'VIDEO' | 'PDF' | 'TEXT'
  duration: number | null
  isPreview: boolean
  videoUrl: string | null
  content?: string | null
  order: number
}
interface DetailChapter {
  id: string
  title: string
  order: number
  lessons: DetailLesson[]
}
interface DetailCourse {
  id: string
  title: string
  slug: string
  subtitle?: string | null
  description?: string | null
  price: number
  discountPrice?: number | null
  thumbnail?: string | null
  level: string
  instructorName: string
  instructorTitle?: string | null
  instructorBio?: string | null
  instructorImage?: string | null
  subject?: string | null
  categoryName?: string | null
  isLifetime?: boolean
  validityMonths?: number | null
  subjects?: { subject: { id: string; name: string; nameEn?: string | null } }[]
  createdAt: string
  chapters: DetailChapter[]
  _count?: { enrollments: number; lessons: number }
}
interface DetailReview {
  id: string
  userName: string
  userRole: string
  rating: number
  comment: string
  createdAt: string
}
interface CourseDetailData {
  course: DetailCourse
  isEnrolled: boolean
  lessonsTotal: number
  reviews: DetailReview[]
}

function ReviewStars({ rating, className = 'h-4 w-4' }: { rating: number; className?: string }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${className} ${i <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} aria-hidden />
      ))}
    </span>
  )
}

export default function CourseDetailView({ courseId }: { courseId: string }) {
  const { t, tx, lang } = useUI()
  const user = useAuth((s) => s.user)

  const [data, setData] = useState<CourseDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [enrolling, setEnrolling] = useState(false)
  const [previewLesson, setPreviewLesson] = useState<DetailLesson | null>(null)
  // Preview lesson video resolved once per open (YOUTUBE → protected player)
  const previewVideo =
    previewLesson?.type === 'VIDEO' && previewLesson.videoUrl
      ? resolveVideoUrl(previewLesson.videoUrl)
      : null

  // Review form
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [postingReview, setPostingReview] = useState(false)

  const load = useCallback(() => {
    if (!courseId) return
    setLoading(true)
    setError('')
    apiGet<CourseDetailData>(`/api/courses/${courseId}`)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [courseId])

  useEffect(() => {
    load()
  }, [load])

  // Auto-open checkout when arriving from a course card "কোর্স কিনুন" button
  // (URL carries ?enroll=1). Only for paid courses the user is not enrolled in.
  useEffect(() => {
    if (!data?.course || data.isEnrolled) return
    try {
      if (new URLSearchParams(window.location.search).get('enroll') !== '1') return
      const price = data.course.discountPrice ?? data.course.price
      if (price > 0) go(`/checkout/${data.course.id}`)
    } catch {
      /* SSR / unusual location — ignore */
    }
  }, [data])

  const submitReview = async () => {
    if (!user) {
      toast.warning(t('required_login'))
      go('#/login')
      return
    }
    if (rating < 1) {
      toast.warning(tx('রেটিং নির্বাচন করুন', 'Please select a rating'))
      return
    }
    if (comment.trim().length < 3) {
      toast.warning(tx('মন্তব্য লিখুন', 'Please write a comment'))
      return
    }
    setPostingReview(true)
    try {
      // Submit the canonical DB id (the page URL param may be a slug —
      // /courses/[slug]) so the review is always linked to the real course.
      // new reviews are PENDING — shown here only after the admin
      // approves them (Admin → Review Moderation), so no optimistic insert.
      await apiPost<DetailReview>('/api/reviews', {
        courseId: data?.course.id ?? courseId,
        rating,
        comment: comment.trim(),
      })
      toast.success(
        tx(
          'রিভিউ জমা হয়েছে, ধন্যবাদ! অ্যাডমিন অনুমোদন করলেই এখানে দেখা যাবে।',
          'Review submitted, thank you! It will appear here once the admin approves it.'
        )
      )
      setRating(0)
      setComment('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setPostingReview(false)
    }
  }

  const enrollFree = async () => {
    setEnrolling(true)
    try {
      await apiPost('/api/enroll-free', { courseId })
      toast.success(t('payment_success'))
      go(`#/dashboard/classroom/${courseId}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setEnrolling(false)
    }
  }

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-3.5">
        <Skeleton className="h-4 w-64" />
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="aspect-video w-full rounded-2xl" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    )
  }

  // ── Error / 404 ──
  if (error || !data?.course) {
    const notFound = /not found|নেই|পাওয়া|404/i.test(error)
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-3.5">
        <EmptyState
          icon={<BookOpen className="h-7 w-7" aria-hidden />}
          title={notFound ? t('course_not_found') : t('error')}
          description={notFound ? undefined : error}
          actionLabel={tx('কোর্স তালিকায় ফিরুন', 'Back to courses')}
          onAction={() => go('#/courses')}
        />
      </div>
    )
  }

  const course = data.course
  const effective = course.discountPrice ?? course.price
  const hasDiscount = course.discountPrice != null && course.discountPrice < course.price
  const students = course._count?.enrollments ?? 0

  const lessonIcon = (type: DetailLesson['type']) =>
    type === 'VIDEO' ? (
      <PlayCircle className="h-4 w-4 text-primary" aria-hidden />
    ) : type === 'PDF' ? (
      <PdfBadge />
    ) : (
      <FileBadge className="h-4 w-4 text-teal-600" aria-hidden />
    )

  const openPreview = (lesson: DetailLesson) => {
    // Locked (not free + not enrolled) → ignore. Video needs a URL; PDF/TEXT
    // open for preview AND enrolled users so their material is one click away.
    if (!lesson.isPreview && !data.isEnrolled) return
    if (lesson.type === 'VIDEO' && !lesson.videoUrl) return
    setPreviewLesson(lesson)
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-3.5 py-6 sm:py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-5">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link href="/" className="inline-flex items-center gap-1 hover:text-primary">
              <Home className="h-3.5 w-3.5" aria-hidden />
              {t('nav_home')}
            </Link>
          </li>
          <li aria-hidden><ChevronRight className="h-3.5 w-3.5" /></li>
          <li><Link href="/courses" className="hover:text-primary">{t('nav_courses')}</Link></li>
          <li aria-hidden><ChevronRight className="h-3.5 w-3.5" /></li>
          <li className="max-w-[200px] truncate font-medium text-foreground sm:max-w-xs" aria-current="page">
            {course.title}
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* ══ LEFT ══ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="min-w-0"
        >
          <div className="flex flex-wrap items-center gap-2">
            {course.categoryName && <Badge variant="secondary">{course.categoryName}</Badge>}
            {/* Course validity (access duration) — colorful pill */}
            <ValidityChip isLifetime={course.isLifetime} validityMonths={course.validityMonths} className="px-2.5 py-1 text-xs" />
            {/* Assigned subjects */}
            {(course.subjects ?? []).map((s) => (
              <Badge key={s.subject.id} variant="outline" className="gap-1.5">
                <span aria-hidden className="grad-rose h-2 w-2 rounded-full" />
                {s.subject.nameEn || s.subject.name}
              </Badge>
            ))}
            {data.isEnrolled && (
              <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">
                ✓ {tx('ভর্তি হয়েছে', 'Enrolled')}
              </Badge>
            )}
          </div>

          <h1 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
            {course.title}
          </h1>
          {course.subtitle && <p className="mt-2 text-sm text-muted-foreground sm:text-base">{course.subtitle}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            {/* Colorful 2.0 — tiny gradient dots per meta chip (rotate tones) */}
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="grad-emerald h-2.5 w-2.5 rounded-full shadow-sm" />
              {data.lessonsTotal} {t('lessons_count')}
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="grad-violet h-2.5 w-2.5 rounded-full shadow-sm" />
              {students} {t('students_count')}
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="grad-amber h-2.5 w-2.5 rounded-full shadow-sm" />
              {data.reviews.length} {t('reviews').toLowerCase()}
            </span>
          </div>

          {/* Thumbnail */}
          <div className="relative mt-5 aspect-video overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 to-accent">
            {course.thumbnail ? (
              <Image
                src={course.thumbnail}
                alt={course.title}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 66vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <PlayCircle className="h-14 w-14 text-primary/40" aria-hidden />
              </div>
            )}
          </div>

          {/* Tabs */}
          <Tabs defaultValue="description" className="mt-6">
            <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
              <TabsTrigger value="description">{t('description')}</TabsTrigger>
              <TabsTrigger value="curriculum">{t('curriculum')}</TabsTrigger>
              <TabsTrigger value="reviews">{t('reviews')} ({data.reviews.length})</TabsTrigger>
            </TabsList>

            {/* Description */}
            <TabsContent value="description" className="mt-4">
              <div className="rounded-2xl border bg-card p-5">
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90 sm:text-base">
                  {course.description || tx('বিবরণ পাওয়া যায়নি।', 'No description available.')}
                </p>
              </div>
            </TabsContent>

            {/* Curriculum */}
            <TabsContent value="curriculum" className="mt-4">
              {course.chapters.length === 0 ? (
                <EmptyState title={tx('কারিকুলাম শীঘ্রই আসছে', 'Curriculum coming soon')} />
              ) : (
                <Accordion type="multiple" className="rounded-2xl border bg-card px-4">
                  {course.chapters.map((ch, ci) => (
                    <AccordionItem key={ch.id} value={ch.id} className={ci === course.chapters.length - 1 ? 'border-b-0' : ''}>
                      <AccordionTrigger className="text-left text-sm font-semibold sm:text-base">
                        <span>
                          {ci + 1}. {ch.title}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            ({ch.lessons.length} {t('lessons_count')})
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="divide-y">
                          {ch.lessons.map((lesson) => {
                            const locked = !lesson.isPreview && !data.isEnrolled
                            // Enrolled users can open ANY lesson; visitors only free-preview ones.
                            const clickable = !locked
                            return (
                              <li key={lesson.id}>
                                <button
                                  type="button"
                                  disabled={!clickable}
                                  onClick={() => openPreview(lesson)}
                                  aria-label={clickable ? `${t('preview')}: ${lesson.title}` : lesson.title}
                                  className={`flex w-full items-center gap-3 py-2.5 text-left text-sm ${
                                    clickable ? 'cursor-pointer hover:bg-accent/50' : 'cursor-default'
                                  } rounded px-1`}
                                >
                                  {lessonIcon(lesson.type)}
                                  <span className={`min-w-0 flex-1 truncate ${locked ? 'text-muted-foreground' : ''}`}>
                                    {lesson.title}
                                  </span>
                                  {lesson.isPreview && (
                                    <Badge variant="secondary" className="shrink-0 rounded-full bg-primary/10 text-primary">
                                      {t('preview')}
                                    </Badge>
                                  )}
                                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                    {lesson.duration != null ? fmtClock(lesson.duration) : '—'}
                                  </span>
                                  {locked ? (
                                    <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
                                  ) : (
                                    <span className="w-3.5 shrink-0" aria-hidden />
                                  )}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </TabsContent>

            {/* Reviews */}
            <TabsContent value="reviews" className="mt-4 space-y-4">
              {/* Add review (logged in) */}
              {user ? (
                <div className="rounded-2xl border bg-card p-5">
                  <h3 className="text-sm font-semibold">{tx('আপনার রিভিউ দিন', 'Write your review')}</h3>
                  <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label={tx('রেটিং', 'Rating')}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <button
                        key={i}
                        type="button"
                        role="radio"
                        aria-checked={rating === i}
                        aria-label={`${i} ${tx('স্টার', 'star')}`}
                        onClick={() => setRating(i)}
                        className="rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Star
                          className={`h-7 w-7 transition-colors ${
                            i <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30 hover:text-amber-300'
                          }`}
                          aria-hidden
                        />
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 space-y-2">
                    <Label htmlFor="review-comment" className="sr-only">{t('reviews')}</Label>
                    <Textarea
                      id="review-comment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={tx('কোর্সটি সম্পর্কে আপনার অভিজ্ঞতা লিখুন...', 'Share your experience about this course...')}
                      rows={3}
                    />
                    <Button onClick={submitReview} disabled={postingReview}>
                      {postingReview ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          {t('loading')}
                        </>
                      ) : (
                        tx('রিভিউ জমা দিন', 'Submit review')
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed bg-card p-4">
                  <p className="text-sm text-muted-foreground">{t('required_login')}</p>
                  <Button size="sm" onClick={() => go('#/login')}>{t('login')}</Button>
                </div>
              )}

              {/* Review list */}
              {data.reviews.length === 0 ? (
                <EmptyState title={tx('এখনো কোনো রিভিউ নেই', 'No reviews yet')} />
              ) : (
                <div className="space-y-3">
                  {data.reviews.map((r) => (
                    <div key={r.id} className="rounded-2xl border bg-card p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                              {r.userName.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-semibold">{r.userName}</p>
                            <p className="text-xs text-muted-foreground">{r.userRole}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <ReviewStars rating={r.rating} />
                          <p className="mt-0.5 text-xs text-muted-foreground">{fmtDate(r.createdAt, lang)}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-foreground/85">{r.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </motion.div>

        {/* ══ RIGHT — purchase card ══ */}
        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="min-w-0"
          aria-label={tx('ভর্তি কার্ড', 'Enrollment card')}
        >
          <div className="sticky top-24 space-y-4">
            <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
              <span aria-hidden className="rainbow-bar absolute inset-x-0 top-0 z-10 h-1" />
              <div className="relative aspect-video bg-gradient-to-br from-primary/10 to-accent">
                {course.thumbnail && (
                  <Image
                    src={course.thumbnail}
                    alt={course.title}
                    fill
                    sizes="340px"
                    /* same asset as the cover — priority keeps the mobile LCP
                       out of the dev-issues badge (no console warning) */
                    priority
                    className="object-cover"
                  />
                )}
              </div>
              <div className="space-y-4 p-5">
                <div className="flex items-baseline gap-2">
                  <span className="grad-text-brand text-3xl font-extrabold">{fmtBDT(effective, lang)}</span>
                  {hasDiscount && (
                    <span className="text-sm text-muted-foreground line-through">{fmtBDT(course.price, lang)}</span>
                  )}
                  {hasDiscount && (
                    <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                      -{Math.round(((course.price - (course.discountPrice ?? course.price)) / course.price) * 100)}%
                    </Badge>
                  )}
                </div>

                {data.isEnrolled ? (
                  <Button size="lg" className="w-full" onClick={() => go(`#/dashboard/classroom/${course.id}`)}>
                    {t('continue_learning')} →
                  </Button>
                ) : effective > 0 ? (
                  <Button size="lg" className="w-full" onClick={() => go(`/checkout/${course.id}`)}>
                    <ShoppingBag className="h-4 w-4" aria-hidden />
                    {t('buy_now')}
                  </Button>
                ) : (
                  <Button size="lg" className="w-full" onClick={enrollFree} disabled={enrolling}>
                    {enrolling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    {t('enroll_now')}
                  </Button>
                )}

                <ul className="space-y-2 text-sm text-muted-foreground">
                  {[
                    course.isLifetime
                      ? tx('লাইফটাইম অ্যাক্সেস', 'Lifetime access')
                      : course.validityMonths
                        ? validityChipLabel(null, course.validityMonths, lang) + (lang === 'bn' ? ' অ্যাক্সেস' : ' of access')
                        : tx('লাইফটাইম অ্যাক্সেস', 'Lifetime access'),
                    tx('যেকোনো ডিভাইস থেকে ক্লাস', 'Learn on any device'),
                    tx('ইন্সট্রাক্টর সাপোর্ট', 'Instructor support'),
                  ].map((label) => (
                    <li key={label} className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50">
                        <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden />
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Instructor mini-card */}
            <div className="rounded-2xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('instructor')}</p>
              <div className="mt-3 flex items-center gap-3">
                <Avatar className="h-12 w-12 ring-2 ring-primary/25">
                  {course.instructorImage && (
                    <AvatarImage src={course.instructorImage} alt={course.instructorName} />
                  )}
                  <AvatarFallback className="bg-primary/15 font-bold text-primary">
                    {course.instructorName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{course.instructorName}</p>
                  {course.instructorTitle && (
                    <p className="truncate text-xs text-muted-foreground">{course.instructorTitle}</p>
                  )}
                </div>
              </div>
              {course.instructorBio && (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{course.instructorBio}</p>
              )}
            </div>
          </div>
        </motion.aside>
      </div>



      {/* Preview lesson dialog — compact preview card (video 16:9 capped at
          min(92vw, 640px), tight padding, one-line title) so it never feels
          like a full-screen takeover on desktop and never overflows on mobile. */}
      <Dialog open={previewLesson !== null} onOpenChange={(v) => !v && setPreviewLesson(null)}>
        <DialogContent
          className="max-w-[min(92vw,640px)] gap-3 rounded-2xl p-4 sm:max-w-[640px] sm:gap-4 sm:p-5"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle className="line-clamp-1 pr-8 text-left text-base sm:text-lg">
              {previewLesson?.title}
            </DialogTitle>
            <DialogDescription asChild>
              <span className="sr-only">{t('preview')}</span>
            </DialogDescription>
          </DialogHeader>
          {previewVideo?.provider === 'YOUTUBE' && previewVideo.videoId ? (
            <ProtectedYouTubePlayer
              key={previewLesson!.id}
              videoId={previewVideo.videoId}
              title={previewLesson!.title}
            />
          ) : previewVideo?.provider === 'VIMEO' && previewVideo.videoId ? (
            <ProtectedVimeoPlayer
              key={previewLesson!.id}
              videoId={previewVideo.videoId}
              title={previewLesson!.title}
            />
          ) : previewVideo?.kind === 'mp4' && previewLesson?.videoUrl ? (
            <ProtectedMp4Player
              key={previewLesson.id}
              src={previewLesson.videoUrl}
            />
          ) : previewVideo?.kind === 'iframe' ? (
            <div className="overflow-hidden rounded-xl bg-black">
              <ProtectedIframePlayer
                key={previewLesson!.id}
                src={previewVideo.src}
                provider={previewVideo.provider as 'DRIVE' | 'EMBED'}
                title={previewLesson!.title}
              />
            </div>
          ) : previewLesson?.type === 'PDF' && isFileUrl(previewLesson.content) ? (
            // FREE / enrolled PDF lesson — inline viewer + open/download.
            // Previously this fell through to the "available after enrollment"
            // message even for free lessons (the exact reported bug).
            <div className="space-y-3">
              <div className="h-[60vh] overflow-hidden rounded-xl border bg-white">
                <iframe
                  src={pdfEmbedSrc(previewLesson.content ?? '')}
                  title={previewLesson.title}
                  className="h-full w-full"
                  loading="lazy"
                />
              </div>
              <div className="flex justify-center gap-2">
                <a href={previewLesson.content ?? '#'} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <ExternalLink className="h-4 w-4" /> {tx('খুলুন', 'Open')}
                  </Button>
                </a>
                <a href={previewLesson.content ?? '#'} download>
                  <Button size="sm" className="gap-1.5">
                    <Download className="h-4 w-4" /> {tx('ডাউনলোড', 'Download')}
                  </Button>
                </a>
              </div>
            </div>
          ) : previewLesson?.content ? (
            // TEXT lesson (or PDF with typed notes) — render the content.
            <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-xl border bg-card p-4 text-sm leading-7">
              {previewLesson.content}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <PdfBadge size="lg" />
              {tx('এই লেসনের কনটেন্ট ভর্তির পর উপলব্ধ হবে।', 'This lesson content is available after enrollment.')}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

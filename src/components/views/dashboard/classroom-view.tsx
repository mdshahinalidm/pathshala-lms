'use client'

/**
 * Classroom — THE ANTI-PIRACY LESSON PLAYER.
 *
 * Anti-piracy measures implemented here:
 *  1. context-menu blocked on the whole container + video element itself
 *  2. keydown blocker: F12, Ctrl/Meta+Shift+I/J/C, Ctrl/Meta+U, Ctrl/Meta+S/P
 *  3. drifting diagonal identity watermark grid over the media stage
 *     (email||phone||name + timestamp, regenerated every 60s)
 *  4. persistent small id-tag (email) bottom-right of the stage
 *  5. ProtectedMp4Player — no native controls, controlsList="nodownload",
 *     disablePictureInPicture, no PiP
 *  6. ProtectedYouTubePlayer — ZERO YouTube chrome (no controls/title/CC/
 *     settings/share/fullscreen/logo/related end-screen), DOUBLE PLAY BUTTON
 *     poster (iframe only loads on click), custom control bar, auto-pause
 *     shield on window blur / tab switch / PrintScreen (see protected-video.tsx)
 *  7. beforeunload guard while the video is playing
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, PlayCircle, AlignLeft, CheckCircle2, Circle,
  Lock, ChevronLeft, ChevronRight,
  GraduationCap, AlertTriangle, Download, ClipboardList, ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CircularProgress } from '@/components/shared/circular-progress'
import { EmptyState } from '@/components/shared/empty-state'
import { PdfBadge } from '@/components/shared/pdf-badge'
import {
  WatermarkOverlay, ProtectedMp4Player, ProtectedYouTubePlayer,
  ProtectedIframePlayer, ProtectedVimeoPlayer,
} from '@/components/shared/protected-video'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet, apiSend } from '@/lib/api-client'
import { fmtClock, digitsBn } from '@/lib/format'
import { resolveVideoUrl, isFileUrl, pdfEmbedSrc } from '@/lib/video'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/* ── Types (API contract) ─────────────────────────────────────────── */

interface Lesson {
  id: string
  title: string
  type: 'VIDEO' | 'PDF' | 'TEXT'
  duration: number | null
  isPreview: boolean
  videoUrl: string | null
  content?: string | null
  order: number
}
interface Chapter {
  id: string
  title: string
  order: number
  lessons: Lesson[]
}
interface CoursePayload {
  course: {
    id: string
    title: string
    slug: string
    subtitle: string | null
    description: string | null
    thumbnail: string | null
    level: string
    instructorName: string
    instructorTitle: string | null
    chapters: Chapter[]
  }
  isEnrolled: boolean
  lessonsTotal: number
}
interface EnrollmentRow {
  id: string
  progress: number
  completedLessonIds: string[]
  course: { id: string }
  lessonsTotal: number
}

interface CourseQuizMeta {
  id: string
  title: string
  questionCount: number
  durationMin: number
  myBest?: number | null
}

/* Legacy helper replaced by resolveVideoUrl (src/lib/video.ts) which supports
 * YouTube (watch/youtu.be/shorts), Vimeo, Google Drive, bunny/CDN embeds and
 * direct/local files — fixes "YouTube লিংক লেসন প্লে হয় না" bug.
 * Since the YouTube/MP4 stages render through the SHARED
 * ProtectedYouTubePlayer / ProtectedMp4Player (src/components/shared/
 * protected-video.tsx) — moved out of this file so the course-preview dialog
 * gets the identical anti-piracy player. */

/* ── PDF / TEXT stage panels ──────────────────────────────────────── */

function PdfStage({ lesson }: { lesson: Lesson }) {
  const { t, tx } = useUI()
  const content = (lesson.content ?? '').trim()
  const isFile = isFileUrl(content)

  // No file URL → friendly stage; typed notes (if any) render in the prose card below.
  if (!isFile) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary/10 via-transparent to-accent p-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
          <PdfBadge size="lg" />
        </span>
        <div>
          <h3 className="text-lg font-bold">{lesson.title}</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {content
              ? tx('এই লেসনের নোট নিচে দেওয়া হয়েছে।', 'This lesson’s notes are shown below.')
              : tx('কোনো ম্যাটেরিয়াল পাওয়া যায়নি।', 'No material found.')}
          </p>
        </div>
        <span className="sr-only">{t('download')}</span>
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Inline PDF viewer — renders natively on desktop; on the few mobile
          browsers that refuse inline PDFs the action bar below still works. */}
      <div className="relative h-[65vh] min-h-[380px] w-full bg-white sm:h-[70vh]">
        <iframe
          src={pdfEmbedSrc(content)}
          title={lesson.title}
          className="h-full w-full"
          loading="lazy"
        />
      </div>
      {/* Action bar — Open in new tab + Download (same-origin forces download
          with the original filename; external URLs open in a new tab). */}
      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-black p-3">
        <p className="mr-auto hidden items-center gap-1.5 pl-1 text-xs font-medium text-white/60 sm:flex">
          <PdfBadge />
          {tx('লেকচার শিট / ম্যাটেরিয়াল', 'Lecture sheet / material')}
        </p>
        <a href={content} target="_blank" rel="noopener noreferrer">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" /> {tx('খুলুন', 'Open')}
          </Button>
        </a>
        <a href={content} download>
          <Button size="sm" className="gap-1.5">
            <Download className="h-4 w-4" /> {tx('ডাউনলোড', 'Download')}
          </Button>
        </a>
      </div>
    </div>
  )
}

function TextStage({ lesson }: { lesson: Lesson }) {
  return (
    <div className="max-h-[70vh] min-h-56 overflow-y-auto bg-gradient-to-br from-primary/5 to-transparent p-6">
      <div className="mx-auto max-w-2xl whitespace-pre-wrap text-sm leading-7 text-foreground/90">
        {lesson.content || '—'}
      </div>
    </div>
  )
}

/* ── Main view ────────────────────────────────────────────────────── */

export default function ClassroomView({ courseId }: { courseId: string }) {
  const { t, tx } = useUI()
  const { user } = useAuth()

  const [data, setData] = useState<CoursePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [nonce, setNonce] = useState(0)

  const [enrolled, setEnrolled] = useState(false)
  const [expired, setExpired] = useState(false)
  const [progress, setProgress] = useState(0)
  const [completedIds, setCompletedIds] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [courseQuizzes, setCourseQuizzes] = useState<CourseQuizMeta[]>([])
  const markingRef = useRef<Set<string>>(new Set())

  // 60s-regenerated watermark timestamp (async fill → no sync setState in effect)
  const [stamp, setStamp] = useState('')
  useEffect(() => {
    const make = () => new Date().toLocaleString('bn-BD')
    const update = () => setStamp(make())
    const t0 = setTimeout(update, 0)
    const id = setInterval(update, 60_000)
    return () => {
      clearTimeout(t0)
      clearInterval(id)
    }
  }, [])

  // DevTools / save / view-source key blocker — active only while mounted
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      const block =
        e.key === 'F12' ||
        (mod && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) ||
        (mod && (k === 'u' || k === 's' || k === 'p'))
      if (block) {
        e.preventDefault()
        e.stopPropagation()
        toast.warning(tx('এই কনটেন্ট সুরক্ষিত!', 'This content is protected!'))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tx])

  // fetch course + enrollment
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    ;(async () => {
      try {
        const payload = await apiGet<CoursePayload>(`/api/courses/${courseId}`)
        if (!alive) return
        setData(payload)
        setEnrolled(payload.isEnrolled)
        setExpired(Boolean((payload as { enrollmentExpired?: boolean }).enrollmentExpired))
        if (payload.isEnrolled) {
          try {
            const list = await apiGet<EnrollmentRow[]>('/api/enrollments')
            if (!alive) return
            const mine = list.find(
              (e) => e.course.id === payload.course.id || e.course.id === courseId
            )
            if (mine) {
              setProgress(mine.progress || 0)
              setCompletedIds(mine.completedLessonIds ?? [])
            }
          } catch {
            /* enrollment details optional — course still plays */
          }
          // Practice quizzes attached to this course (classroom sidebar card)
          apiGet<CourseQuizMeta[]>(
            `/api/quizzes?courseId=${payload.course.id}&scope=published&type=QUIZ`
          )
            .then((qs) => {
              if (alive) setCourseQuizzes(qs ?? [])
            })
            .catch(() => {
              /* optional */
            })
          const first = payload.course.chapters.flatMap((c) => c.lessons)[0]
          setActiveId((prev) => prev ?? first?.id ?? null)
        }
      } catch {
        if (alive) setError(true)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [courseId, nonce])

  const flat = useMemo(() => data?.course.chapters.flatMap((c) => c.lessons) ?? [], [data])
  const activeIndex = flat.findIndex((l) => l.id === activeId)
  const activeLesson = activeIndex >= 0 ? flat[activeIndex] : flat[0] ?? null
  const activeChapter = useMemo(
    () => data?.course.chapters.find((c) => c.lessons.some((l) => l.id === activeLesson?.id)),
    [data, activeLesson]
  )

  const markComplete = useCallback(
    async (lessonId: string, silent: boolean) => {
      if (completedIds.includes(lessonId) || markingRef.current.has(lessonId)) return
      markingRef.current.add(lessonId)
      try {
        const res = await apiSend<{ progress: number }>('/api/enrollments', 'PATCH', {
          courseId,
          lessonId,
        })
        setCompletedIds((prev) => (prev.includes(lessonId) ? prev : [...prev, lessonId]))
        if (typeof res?.progress === 'number') setProgress(res.progress)
        if (!silent) toast.success(tx('লেসন সম্পন্ন হয়েছে!', 'Lesson completed!'))
      } catch {
        /* keep silent — progress sync retried on next action */
      } finally {
        markingRef.current.delete(lessonId)
      }
    },
    [completedIds, courseId, tx]
  )

  const advance = useCallback(
    (dir: 1 | -1) => {
      const idx = flat.findIndex((l) => l.id === (activeId ?? flat[0]?.id))
      const next = flat[idx + dir]
      if (next) setActiveId(next.id)
    },
    [flat, activeId]
  )

  const handleAutoComplete = useCallback(() => {
    if (!activeLesson) return
    void markComplete(activeLesson.id, true)
    toast.info(tx('লেসন প্রায় শেষ — স্বয়ংক্রিয়ভাবে সম্পন্ন হয়েছে ✓', 'Lesson almost over — auto-marked complete ✓'))
  }, [activeLesson, markComplete, tx])

  const handleMarkAndNext = async () => {
    if (!activeLesson) return
    if (!completedIds.includes(activeLesson.id)) await markComplete(activeLesson.id, false)
    advance(1)
  }

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Skeleton className="aspect-video w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-[70vh] w-full rounded-2xl" />
      </div>
    )
  }

  /* ── Error / not found ── */
  if (error || !data) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-7 w-7" />}
        title={t('course_not_found')}
        description={tx('কোর্সটি লোড করা যায়নি।', 'Could not load this course.')}
        actionLabel={t('retry')}
        onAction={() => setNonce((n) => n + 1)}
      />
    )
  }

  /* ── Enrollment expired (course validity ended) ── */
  if (expired && !enrolled) {
    return (
      <EmptyState
        icon={<Lock className="h-7 w-7" />}
        title={tx('কোর্সের মেয়াদ শেষ', 'Course access expired')}
        description={tx(
          'এই কোর্সের অ্যাক্সেস ভ্যালিডিটির মেয়াদ শেষ হয়েছে। চালিয়ে যেতে অ্যাডমিনের সাথে যোগাযোগ করুন বা নতুন করে এনরোল করুন।',
          'This course’s validity period has ended. Contact the admin or enroll again to continue.'
        )}
        actionLabel={tx('কোর্স পেজে যান', 'Go to course page')}
        onAction={() => go(`#/courses/${data.course.id}`)}
      />
    )
  }

  /* ── Not enrolled ── */
  if (!enrolled) {
    return (
      <EmptyState
        icon={<Lock className="h-7 w-7" />}
        title={tx('ভর্তি প্রয়োজন', 'Enrollment required')}
        description={tx(
          'এই কোর্সে আপনার ভর্তি নেই। ক্লাসরুম খুলতে আগে ভর্তি হোন।',
          'You are not enrolled in this course. Enroll first to open the classroom.'
        )}
        actionLabel={tx('কোর্স পেজে যান', 'Go to course page')}
        onAction={() => go(`#/courses/${data.course.id}`)}
      />
    )
  }

  const { course } = data
  const lessonsTotal = data.lessonsTotal || flat.length
  const doneCount = completedIds.length
  const identity = user?.email || user?.phone || user?.name || 'pathshala-user'
  const wmText = `${identity} · ${stamp} · PathShala`
  const wmTag = identity
  const activeDone = activeLesson ? completedIds.includes(activeLesson.id) : false
  // Resolve the active lesson's video once: iframe embed (YouTube/Vimeo/Drive/CDN) or direct file
  const activeVideo =
    activeLesson?.type === 'VIDEO' && activeLesson.videoUrl
      ? resolveVideoUrl(activeLesson.videoUrl)
      : null
  const typeIcon = (type: Lesson['type']) =>
    type === 'VIDEO' ? (
      <PlayCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
    ) : type === 'PDF' ? (
      <PdfBadge />
    ) : (
      <AlignLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
    )

  return (
    // ANTI-PIRACY: no context menu + no text selection anywhere in the classroom
    <div className="no-select" onContextMenu={(e) => e.preventDefault()}>
      {/* Top bar */}
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => go('#/dashboard')} aria-label={tx('ড্যাশবোর্ডে ফিরুন', 'Back to dashboard')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight sm:text-xl">{course.title}</h1>
          <p className="text-xs text-muted-foreground">
            {t('classroom')} · {course.instructorName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CircularProgress value={lessonsTotal ? (doneCount / lessonsTotal) * 100 : progress} size={44} strokeWidth={5} />
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {doneCount}/{lessonsTotal}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* LEFT: main stage */}
        <div className="min-w-0 space-y-4">
          <motion.div
            key={activeLesson?.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="relative overflow-hidden rounded-2xl border bg-black shadow-sm"
          >
            {activeLesson?.type === 'VIDEO' && activeVideo?.provider === 'YOUTUBE' && activeVideo.videoId ? (
              <ProtectedYouTubePlayer
                key={activeLesson.id}
                videoId={activeVideo.videoId}
                title={activeLesson.title}
                onAutoComplete={handleAutoComplete}
              />
            ) : activeLesson?.type === 'VIDEO' && activeVideo?.provider === 'VIMEO' && activeVideo.videoId ? (
              <ProtectedVimeoPlayer
                key={activeLesson.id}
                videoId={activeVideo.videoId}
                title={activeLesson.title}
                onAutoComplete={handleAutoComplete}
              />
            ) : activeLesson?.type === 'VIDEO' && activeVideo?.kind === 'iframe' ? (
              // Drive / generic CDN — branding stripped via overscan + poster
              <ProtectedIframePlayer
                key={activeLesson.id}
                src={activeVideo.src}
                provider={activeVideo.provider as 'DRIVE' | 'EMBED'}
                title={activeLesson.title}
              />
            ) : activeLesson?.type === 'VIDEO' && activeVideo?.kind === 'mp4' ? (
              <ProtectedMp4Player
                key={activeLesson.id}
                src={activeLesson.videoUrl ?? ''}
                onAutoComplete={handleAutoComplete}
              />
            ) : activeLesson?.type === 'PDF' ? (
              <>
                <PdfStage lesson={activeLesson} />
                <WatermarkOverlay text={wmText} tag={wmTag} />
              </>
            ) : activeLesson?.type === 'TEXT' ? (
              <>
                <TextStage lesson={activeLesson} />
                <WatermarkOverlay text={wmText} tag={wmTag} />
              </>
            ) : (
              <div className="flex aspect-video items-center justify-center text-sm text-white/60">
                {tx('কনটেন্ট পাওয়া যায়নি', 'No content found')}
              </div>
            )}
          </motion.div>

          {/* PDF typed notes (pure text, NOT a file URL) rendered as prose card below stage */}
          {activeLesson?.type === 'PDF' && activeLesson.content && !isFileUrl(activeLesson.content) && (
            <div className="rounded-2xl border bg-card p-5">
              <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                <PdfBadge /> {tx('ম্যাটেরিয়াল', 'Material')}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">
                {activeLesson.content}
              </div>
            </div>
          )}

          {/* Lesson info + actions */}
          {activeLesson && (
            <div className="rounded-2xl border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {activeChapter?.title}
                  </p>
                  <h2 className="mt-0.5 text-lg font-bold leading-snug">{activeLesson.title}</h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      {activeLesson.type}
                    </Badge>
                    {activeLesson.duration ? <span>{fmtClock(activeLesson.duration)}</span> : null}
                    {activeDone && (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {t('correct')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {course.description && (
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {course.description}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
                <Button variant="outline" size="sm" onClick={() => advance(-1)} disabled={activeIndex <= 0}>
                  <ChevronLeft className="h-4 w-4" /> {t('prev')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => advance(1)}
                  disabled={activeIndex === flat.length - 1}
                >
                  {t('next')} <ChevronRight className="h-4 w-4" />
                </Button>
                <Button className="ml-auto gap-2" size="sm" onClick={handleMarkAndNext}>
                  <CheckCircle2 className="h-4 w-4" />
                  {activeDone
                    ? t('next')
                    : tx('সম্পন্ন করে পরেরটিতে যান', 'Mark complete & Next')}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: lesson list */}
        <div className="rounded-2xl border bg-card p-3">
          <div className="mb-2 flex items-center gap-2 px-1 py-1 text-sm font-bold">
            <GraduationCap className="h-4 w-4 text-primary" />
            {t('curriculum')}
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {doneCount}/{lessonsTotal}
            </span>
          </div>
          <ScrollArea className="h-[55vh] lg:h-[calc(70vh-3.25rem)]">
            <div className="pr-2">
              {course.chapters.map((ch) => (
                <div key={ch.id} className="mb-3">
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {ch.title}
                  </div>
                  {ch.lessons.map((l) => {
                    const isActive = l.id === activeLesson?.id
                    const isDone = completedIds.includes(l.id)
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setActiveId(l.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition-colors',
                          isActive
                            ? 'bg-primary/10 font-semibold text-primary'
                            : 'text-foreground/85 hover:bg-muted'
                        )}
                      >
                        {isDone ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          typeIcon(l.type)
                        )}
                        <span className="min-w-0 flex-1 truncate">{l.title}</span>
                        {l.duration ? (
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {fmtClock(l.duration)}
                          </span>
                        ) : isDone ? null : (
                          <Circle className="h-2 w-2 shrink-0 text-muted-foreground/40" />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Course practice quizzes (type=QUIZ attached to this course) */}
          {courseQuizzes.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground">
                <ClipboardList className="h-3.5 w-3.5 text-primary" />
                {tx('অনুশীলনী কুইজ', 'Practice Quizzes')}
              </p>
              <div className="space-y-1.5">
                {courseQuizzes.map((qz) => (
                  <button
                    key={qz.id}
                    type="button"
                    onClick={() => go(`/dashboard/exam/${qz.id}`)}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-foreground/85 transition-colors hover:bg-muted"
                  >
                    <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{qz.title}</span>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {digitsBn(qz.questionCount)} {t('questions')}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

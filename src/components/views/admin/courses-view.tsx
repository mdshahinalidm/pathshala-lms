'use client'

/**
 * AdminCoursesView — Course Manager 2.0 (crown jewel).
 * Full course CRUD with a Teachable-class builder:
 * 4-tab dialog (basic / curriculum builder / instructor & media / benefits),
 * real image upload (/api/admin/upload), chapter/lesson reordering,
 * video preview (MP4/YouTube/Vimeo/Bunny), PDF uploads, duplicate, quick PATCHes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Eye,
  FileText,
  GraduationCap,
  Hourglass,
  Infinity as InfinityIcon,
  Layers,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldX,
  Sparkles,
  Star,
  Trash2,
  UploadCloud,
  UserCheck,
  X,
} from 'lucide-react'
import { PdfFileIcon } from '@/components/shared/pdf-file-icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { ImageUpload } from '@/components/admin/image-upload'
import { DateStamp } from '@/components/admin/date-stamp'
import { MediaLibraryPicker } from '@/components/admin/media-library-picker'
import { uploadFileXhr } from '@/lib/upload-client'
import { useBulkSelection, BulkBar, SelectAll, RowBox, ScrollX } from '@/components/admin/data-tools'
import { ListEditor } from '@/components/admin/list-editor'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api-client'
import { VALIDITY_LABELS, VALIDITY_TONES, type ValidityKey } from '@/lib/course-validity'
import { digitsBn, fmtBDT } from '@/lib/format'
import { resolveVideoUrl } from '@/lib/video'
import {
  ProtectedYouTubePlayer, ProtectedIframePlayer, ProtectedVimeoPlayer, ProtectedMp4Player,
} from '@/components/shared/protected-video'
import { useAuth } from '@/store/auth-store'
import { go, useUI } from '@/store/ui-store'
import { useHashRoute } from '@/hooks/use-hash-route'
import { isPanelRole, isOwner } from '@/lib/roles'

/* ── Types ── */

interface AdminCourseRow {
  id: string
  title: string
  slug?: string
  subtitle?: string | null
  price: number
  discountPrice?: number | null
  thumbnail?: string | null
  isPublished: boolean
  isFeatured: boolean
  instructorId?: string | null
  instructorName?: string | null
  categoryName?: string | null
  categoryId?: string | null
  lessonsTotal?: number
  _count?: { enrollments: number; chapters: number }
  createdAt: string
}

interface Category {
  id: string
  name: string
  nameEn?: string | null
  slug: string
}

interface Subject {
  id: string
  name: string
  nameEn?: string | null
  slug: string
  _count?: { courses: number }
}

interface DetailLesson {
  id: string
  title: string
  type: string
  videoUrl?: string | null
  content?: string | null
  duration?: number | null
  isPreview: boolean
  order?: number
}

interface DetailChapter {
  id: string
  title: string
  order?: number
  lessons?: DetailLesson[]
}

interface CourseDetail {
  id: string
  title: string
  titleEn?: string | null
  subtitle?: string | null
  description?: string | null
  price: number
  discountPrice?: number | null
  thumbnail?: string | null
  language?: string
  isPublished: boolean
  isFeatured: boolean
  benefits?: string | null
  requirements?: string | null
  instructorId?: string | null
  instructorName?: string | null
  instructorTitle?: string | null
  instructorBio?: string | null
  instructorImage?: string | null
  categoryId?: string | null
  isLifetime?: boolean
  validityMonths?: number | null
  subjects?: { subject: { id: string; name: string; nameEn?: string | null } }[]
  chapters?: DetailChapter[]
}

type LessonType = 'VIDEO' | 'PDF' | 'TEXT'
type VideoProvider = 'MP4' | 'YOUTUBE' | 'VIMEO' | 'BUNNY' | 'DRIVE'

interface LessonDraft {
  key: string
  id?: string
  title: string
  type: LessonType
  provider: VideoProvider
  videoUrl: string
  content: string
  pdfName: string
  durationMin: string
  isPreview: boolean
}

interface ChapterDraft {
  key: string
  id?: string
  title: string
  lessons: LessonDraft[]
}

interface CourseFormState {
  title: string
  titleEn: string
  subtitle: string
  description: string
  price: string
  discountPrice: string
  categoryId: string
  language: 'bn' | 'en'
  isFeatured: boolean
  isPublished: boolean
  thumbnail: string
  instructorId: string
  instructorName: string
  instructorTitle: string
  instructorBio: string
  instructorImage: string
  benefits: string[]
  requirements: string[]
  // Course validity: 'lifetime' | '1' | '2' | '3' | '6' | '12' (months)
  validity: string
  // Assigned subjects (CourseSubject pivot — managed in Admin → Subjects)
  subjectIds: string[]
}

/** Instructor row for the course-form dropdown (Admin → Instructors). */
interface InstructorLite {
  id: string
  name: string
  designation?: string | null
  designationEn?: string | null
  bio?: string | null
  photoUrl?: string | null
  isActive: boolean
}

type DialogTab = 'basic' | 'curriculum' | 'media' | 'extras'

interface PreviewState {
  title: string
  provider: VideoProvider
  url: string
}

/* ── Constants ── */

const PRESET_THUMBS = [
  '/images/courses/web-development.jpg',
  '/images/courses/ielts-guarantee.jpg',
  '/images/courses/ssc-math.jpg',
  '/images/courses/admission-science.jpg',
  '/images/courses/ssc-physics.jpg',
  '/images/courses/hsc-chemistry2-v2.jpg',
  '/images/courses/hsc-english-v2.jpg',
  '/images/courses/bcs-preliminary.jpg',
]

const LESSON_TYPES: LessonType[] = ['VIDEO', 'PDF', 'TEXT']
const VIDEO_PROVIDERS: VideoProvider[] = ['MP4', 'YOUTUBE', 'VIMEO', 'BUNNY', 'DRIVE']
const PDF_MAX_MB = 100
const VIDEO_MAX_MB = 128

const BLANK_FORM: CourseFormState = {
  title: '',
  titleEn: '',
  subtitle: '',
  description: '',
  price: '',
  discountPrice: '',
  categoryId: '',
  language: 'bn',
  isFeatured: false,
  isPublished: true,
  validity: 'lifetime',
  subjectIds: [],
  thumbnail: '',
  instructorId: '',
  instructorName: '',
  instructorTitle: '',
  instructorBio: '',
  instructorImage: '',
  benefits: [],
  requirements: [],
}

const newKey = () => Math.random().toString(36).slice(2, 10)

/* ── Helpers ── */

function parseArr(v: string | null | undefined): string[] {
  if (!v) return []
  try {
    const parsed: unknown = JSON.parse(v)
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : []
  } catch {
    return []
  }
}

/** Detail GET may return the course directly or wrapped as { course } — accept both. */
function toDetail(data: unknown): CourseDetail {
  if (data && typeof data === 'object' && 'course' in data) {
    return (data as { course: CourseDetail }).course
  }
  return data as CourseDetail
}

function deriveProvider(url: string): VideoProvider {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YOUTUBE'
  if (/vimeo\.com/i.test(url)) return 'VIMEO'
  if (/drive\.google\.com/i.test(url)) return 'DRIVE'
  if (/b-cdn\.net|mediadelivery\.net|bunny/i.test(url)) return 'BUNNY'
  return 'MP4'
}

function detailToChapters(chapters: DetailChapter[]): ChapterDraft[] {
  return chapters.map((ch) => ({
    key: newKey(),
    id: ch.id,
    title: ch.title,
    lessons: (ch.lessons ?? []).map((ls) => ({
      key: newKey(),
      id: ls.id,
      title: ls.title,
      type: (LESSON_TYPES.includes(ls.type as LessonType) ? ls.type : 'VIDEO') as LessonType,
      provider: deriveProvider(ls.videoUrl ?? ''),
      videoUrl: ls.videoUrl ?? '',
      content: ls.content ?? '',
      pdfName: '',
      durationMin:
        ls.duration && ls.duration > 0 ? String(Math.max(1, Math.round(ls.duration / 60))) : '',
      isPreview: ls.isPreview,
    })),
  }))
}

function buildBody(form: CourseFormState, chapters: ChapterDraft[]) {
  return {
    title: form.title.trim(),
    titleEn: form.titleEn.trim() || null,
    subtitle: form.subtitle.trim() || null,
    description: form.description.trim(),
    price: Number(form.price || 0),
    discountPrice: form.discountPrice === '' ? null : Number(form.discountPrice),
    categoryId: form.categoryId || null,
    language: form.language,
    isFeatured: form.isFeatured,
    isPublished: form.isPublished,
    thumbnail: form.thumbnail || null,
    instructorId: form.instructorId || null,
    instructorName: form.instructorName.trim(),
    instructorTitle: form.instructorTitle.trim() || null,
    instructorBio: form.instructorBio.trim() || null,
    instructorImage: form.instructorImage.trim() || null,
    benefits: form.benefits.map((b) => b.trim()).filter(Boolean),
    requirements: form.requirements.map((r) => r.trim()).filter(Boolean),
    isLifetime: form.validity === 'lifetime',
    validityMonths: form.validity === 'lifetime' ? null : Number(form.validity),
    subjectIds: form.subjectIds,
    chapters: chapters.map((ch, ci) => ({
      id: ch.id,
      title: ch.title.trim() || `অধ্যায় ${ci + 1}`,
      order: ci + 1,
      lessons: ch.lessons.map((ls, li) => ({
        id: ls.id,
        title: ls.title.trim(),
        type: ls.type,
        videoUrl: ls.type === 'VIDEO' ? ls.videoUrl.trim() || null : null,
        content: ls.type === 'VIDEO' ? null : ls.content.trim() || null,
        duration: Math.max(0, Number(ls.durationMin || 0)) * 60,
        isPreview: ls.isPreview,
        order: li + 1,
      })),
    })),
  }
}

/** Full-replace body built from a detail GET — ids stripped (for duplicate). */
function detailToBody(
  c: CourseDetail,
  overrides: { title?: string; isPublished?: boolean; isFeatured?: boolean } = {}
) {
  return {
    title: overrides.title ?? c.title,
    titleEn: c.titleEn ?? null,
    subtitle: c.subtitle ?? null,
    description: c.description ?? '',
    price: c.price ?? 0,
    discountPrice: c.discountPrice ?? null,
    categoryId: c.categoryId ?? null,
    language: c.language === 'en' ? 'en' : 'bn',
    isFeatured: overrides.isFeatured ?? c.isFeatured,
    isPublished: overrides.isPublished ?? c.isPublished,
    thumbnail: c.thumbnail ?? null,
    instructorId: c.instructorId ?? null,
    instructorName: c.instructorName || 'PathShala Team',
    instructorTitle: c.instructorTitle ?? null,
    instructorBio: c.instructorBio ?? null,
    instructorImage: c.instructorImage ?? null,
    benefits: parseArr(c.benefits),
    requirements: parseArr(c.requirements),
    chapters: (c.chapters ?? []).map((ch, ci) => ({
      title: ch.title || `অধ্যায় ${ci + 1}`,
      order: ci + 1,
      lessons: (ch.lessons ?? []).map((ls, li) => ({
        title: ls.title,
        type: ls.type,
        videoUrl: ls.videoUrl ?? null,
        content: ls.content ?? null,
        duration: ls.duration ?? 0,
        isPreview: ls.isPreview,
        order: ls.order ?? li + 1,
      })),
    })),
  }
}

function providerLabel(p: VideoProvider, bn: boolean): string {
  switch (p) {
    case 'MP4':
      return bn ? 'MP4 ভিডিও' : 'MP4 Video'
    case 'YOUTUBE':
      return 'YouTube'
    case 'VIMEO':
      return 'Vimeo'
    case 'BUNNY':
      return 'Bunny CDN'
    case 'DRIVE':
      return 'Google Drive'
  }
}

function providerPlaceholder(p: VideoProvider): string {
  switch (p) {
    case 'MP4':
      return 'https://example.com/video.mp4'
    case 'YOUTUBE':
      return 'https://youtube.com/watch?v=…'
    case 'VIMEO':
      return 'https://vimeo.com/123456789'
    case 'BUNNY':
      return 'https://iframe.mediadelivery.net/embed/…'
    case 'DRIVE':
      return 'https://drive.google.com/file/d/…/view'
  }
}

/* ── Small components ── */

function AccessDenied() {
  const { tx } = useUI()
  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldX className="h-7 w-7" />
        </span>
        <h2 className="text-lg font-semibold">{tx('প্রবেশাধিকার নেই', 'Access denied')}</h2>
        <p className="text-sm text-muted-foreground">
          {tx('এই পেজটি শুধুমাত্র অ্যাডমিনদের জন্য।', 'This page is for administrators only.')}
        </p>
        <Button className="mt-2" onClick={() => go('#/login')}>
          {tx('লগইন করুন', 'Go to login')}
        </Button>
      </CardContent>
    </Card>
  )
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold">{digitsBn(value)}</span>
    </span>
  )
}

/**
 * MP4 preview — the SAME protected player students get (no native menus,
 * no download/PiP, colorful custom controls, clear error state).
 */
function PreviewVideo({ src }: { src: string }) {
  return <ProtectedMp4Player src={src} />
}

/**
 * Admin embed preview — renders through the SAME protected players students
 * get, so the admin previews exactly the student experience: no YouTube
 * title/channel/logo/timeline, no Vimeo/Drive chrome, no provider identity.
 */
function AdminEmbedPreview({ url, title }: { url: string; title: string }) {
  const resolved = resolveVideoUrl(url)
  if (resolved?.provider === 'YOUTUBE' && resolved.videoId) {
    return <ProtectedYouTubePlayer videoId={resolved.videoId} title={title} />
  }
  if (resolved?.provider === 'VIMEO' && resolved.videoId) {
    return <ProtectedVimeoPlayer videoId={resolved.videoId} title={title} />
  }
  if (resolved?.kind === 'iframe') {
    return (
      <ProtectedIframePlayer
        src={resolved.src}
        provider={resolved.provider as 'DRIVE' | 'EMBED'}
        title={title}
      />
    )
  }
  // Fallback: try it as a direct media file (same error UI as MP4 preview)
  return <PreviewVideo src={url} />
}

function PreviewPlayer({
  preview,
  onClose,
}: {
  preview: PreviewState | null
  onClose: () => void
}) {
  const { tx } = useUI()
  return (
    <Dialog open={!!preview} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6">{preview?.title}</DialogTitle>
          <DialogDescription>
            {tx('লেসন ভিডিও প্রিভিউ — যা শিক্ষার্থী দেখে', 'Lesson video preview — exactly what students see')}
          </DialogDescription>
        </DialogHeader>
        {preview && (
          <div className="overflow-hidden rounded-xl border bg-black">
            {preview.provider === 'MP4' ? (
              <PreviewVideo src={preview.url} />
            ) : (
              <AdminEmbedPreview url={preview.url} title={preview.title} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ── Main view ── */

/**
 * Subjects multi-select dropdown — SAME dropdown UX as the Category select:
 * a trigger button (placeholder/selection summary + chevron) opening a
 * scrollable checkbox list. Multiple selection persists while browsing,
 * with a clear action. Data model unchanged (subjectIds: string[]).
 */
function SubjectMultiSelect({
  subjects,
  value,
  onChange,
}: {
  subjects: Subject[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const { tx } = useUI()
  const scrollRef = useRef<HTMLDivElement>(null)
  const selected = subjects.filter((s) => value.includes(s.id))
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  /*
   * Mouse-wheel scrolling fix.
   * When this popover opens inside the course dialog, Radix Dialog's body
   * scroll-lock (react-remove-scroll) swallows wheel events whose target sits
   * in this PORTALED popover (outside the dialog wrapper) — the list would
   * only scroll by dragging its scrollbar. We register a window-level capture
   * listener at mount time (before the scroll-lock installs its own) and, for
   * wheels inside the list bounds, stop the lock from swallowing the event and
   * scroll the list ourselves. Registered at MOUNT (not per-open) so this
   * listener stays ahead of the scroll-lock's in the capture queue.
   */
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = scrollRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        return
      e.stopImmediatePropagation()
      e.preventDefault()
      const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY
      el.scrollTop += dy
    }
    window.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => window.removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={tx('সাবজেক্ট নির্বাচন করুন', 'Select subjects')}
          className="h-9 w-full justify-between px-3 py-2 text-sm font-normal"
        >
          <span className="truncate">
            {selected.length === 0 ? (
              <span className="font-normal text-muted-foreground">
                {tx('সাবজেক্ট নির্বাচন করুন', 'Select subjects')}
              </span>
            ) : (
              <span className="font-normal">
                {selected
                  .slice(0, 2)
                  .map((s) => s.nameEn || s.name)
                  .join(', ')}
                {selected.length > 2 && (
                  <span className="text-muted-foreground">
                    {' '}
                    {tx(`+আরও ${selected.length - 2}`, `+${selected.length - 2} more`)}
                  </span>
                )}
              </span>
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-(--radix-popover-trigger-width) p-1">
        <div ref={scrollRef} className="max-h-64 overflow-y-auto" role="listbox" aria-multiselectable>
          {subjects.map((s) => {
            const active = value.includes(s.id)
            return (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => toggle(s.id)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
              >
                {/* Pure-visual checkbox square (NOT a Radix <Checkbox>, which renders a nested <button> → invalid HTML/hydration error) */}
                <span
                  aria-hidden
                  className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs transition-colors ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-transparent dark:bg-input/30'
                  }`}
                >
                  {active && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="truncate">{s.nameEn || s.name}</span>
              </button>
            )
          })}
        </div>
        {selected.length > 0 && (
          <>
            <div className="pointer-events-none -mx-1 my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
            >
              <X className="size-4" />
              {tx('নির্বাচন মুছুন', 'Clear selection')}
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

export default function AdminCoursesView() {
  const { user, status, initialized } = useAuth()
  const { t, tx, lang } = useUI()
  const route = useHashRoute()

  const [courses, setCourses] = useState<AdminCourseRow[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  // Instructor dropdown source — created/managed in Admin → Instructors.
  const [instructors, setInstructors] = useState<InstructorLite[]>([])
  const [loading, setLoading] = useState(true)

  // Toolbar
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all')
  const [searchText, setSearchText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [catFilter, setCatFilter] = useState('all')

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tab, setTab] = useState<DialogTab>('basic')
  const [form, setForm] = useState<CourseFormState>(BLANK_FORM)
  const [chapters, setChapters] = useState<ChapterDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminCourseRow | null>(null)
  const bulk = useBulkSelection()
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Builder internals
  const [pendingDeleteChapter, setPendingDeleteChapter] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [pdfUploadingKey, setPdfUploadingKey] = useState<string | null>(null)
  const [pdfTarget, setPdfTarget] = useState<{ ci: number; li: number } | null>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  // Local VIDEO upload (lesson): uploads via /api/admin/upload → sets videoUrl
  const [videoUploadingKey, setVideoUploadingKey] = useState<string | null>(null)
  const [videoPct, setVideoPct] = useState(0)
  const [videoTarget, setVideoTarget] = useState<{ ci: number; li: number } | null>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  // Media Library picker (videos / pdfs) for lessons
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryAccept, setLibraryAccept] = useState<'VIDEO' | 'IMAGE' | 'PDF' | 'ALL'>('VIDEO')
  const [libraryTarget, setLibraryTarget] = useState<{ ci: number; li: number } | null>(null)

  const setField = <K extends keyof CourseFormState>(key: K, value: CourseFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  /* ── Data ── */

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cs, cats, subs, ins] = await Promise.all([
        apiGet<AdminCourseRow[]>('/api/courses?all=1'),
        apiGet<Category[]>('/api/courses/categories'),
        apiGet<Subject[]>('/api/subjects').catch(() => []),
        apiGet<InstructorLite[]>('/api/admin/instructors').catch(() => []),
      ])
      setCourses(Array.isArray(cs) ? cs : [])
      setCategories(Array.isArray(cats) ? cats : [])
      setSubjects(Array.isArray(subs) ? subs : [])
      setInstructors(Array.isArray(ins) ? ins : [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [tx])

  useEffect(() => {
    void load()
  }, [load])

  // Debounced search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchText), 300)
    return () => clearTimeout(timer)
  }, [searchText])

  // #/admin/courses?new=1 → open the create dialog once on mount, then clean the URL
  useEffect(() => {
    if (route.query.get('new') !== '1') return
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      setEditingId(null)
      setForm(BLANK_FORM)
      setChapters([])
      setTab('basic')
      setDialogOpen(true)
      go('#/admin/courses')
    }, 60)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // run once on mount only; deps intentionally omitted
  }, [])

  /* ── Derived ── */

  const totals = useMemo(() => {
    const published = courses.filter((c) => c.isPublished).length
    return {
      total: courses.length,
      published,
      drafts: courses.length - published,
      students: courses.reduce((sum, c) => sum + (c._count?.enrollments ?? 0), 0),
      lessons: courses.reduce((sum, c) => sum + (c.lessonsTotal ?? 0), 0),
    }
  }, [courses])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return courses.filter((c) => {
      if (filter === 'published' && !c.isPublished) return false
      if (filter === 'draft' && c.isPublished) return false
      if (catFilter !== 'all' && c.categoryId !== catFilter) return false
      if (q) {
        const hay = `${c.title} ${c.instructorName ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [courses, filter, catFilter, searchQuery])

  const curriculumStats = useMemo(() => {
    const lessonCount = chapters.reduce((sum, ch) => sum + ch.lessons.length, 0)
    const totalSeconds = chapters.reduce(
      (sum, ch) => sum + ch.lessons.reduce((s, ls) => s + Math.max(0, Number(ls.durationMin || 0)) * 60, 0),
      0
    )
    const totalMinutes = Math.round(totalSeconds / 60)
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    const parts: string[] = []
    if (h > 0) parts.push(`${digitsBn(h)} ${tx('ঘণ্টা', 'h')}`)
    if (m > 0 || h === 0) parts.push(`${digitsBn(m)} ${tx('মিনিট', 'min')}`)
    return { lessonCount, totalMinutes, durationLabel: parts.join(' ') }
  }, [chapters, tx])

  /* ── Dialog flows ── */

  function openCreate() {
    setEditingId(null)
    setForm(BLANK_FORM)
    setChapters([])
    setTab('basic')
    setDialogOpen(true)
  }

  function openEdit(id: string) {
    setBusyId(id)
    apiGet<unknown>(`/api/courses/${id}`)
      .then((data) => {
        const c = toDetail(data)
        setForm({
          title: c.title,
          titleEn: c.titleEn ?? '',
          subtitle: c.subtitle ?? '',
          description: c.description ?? '',
          price: String(c.price ?? ''),
          discountPrice: c.discountPrice == null ? '' : String(c.discountPrice),
          categoryId: c.categoryId ?? '',
          language: c.language === 'en' ? 'en' : 'bn',
          isFeatured: c.isFeatured,
          isPublished: c.isPublished,
          thumbnail: c.thumbnail ?? '',
          // Legacy courses may have no instructorId → try to match the stored
          // snapshot name against the Instructor section, else stay legacy ('').
          instructorId:
            c.instructorId ??
            instructors.find((i) => i.name === (c.instructorName ?? ''))?.id ??
            '',
          instructorName: c.instructorName ?? '',
          instructorTitle: c.instructorTitle ?? '',
          instructorBio: c.instructorBio ?? '',
          instructorImage: c.instructorImage ?? '',
          benefits: parseArr(c.benefits),
          requirements: parseArr(c.requirements),
          validity:
            c.isLifetime || !c.validityMonths
              ? 'lifetime'
              : String(c.validityMonths),
          subjectIds: (c.subjects ?? []).map((s) => s.subject.id),
        })
        setChapters(detailToChapters(c.chapters ?? []))
        setPendingDeleteChapter(null)
        setEditingId(id)
        setTab('basic')
        setDialogOpen(true)
      })
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
      )
      .finally(() => setBusyId(null))
  }

  function validate(): { message: string; tab: DialogTab } | null {
    if (!form.title.trim()) {
      return {
        message: tx('কোর্সের শিরোনাম আবশ্যক', 'Course title is required'),
        tab: 'basic',
      }
    }
    if (!form.description.trim()) {
      return {
        message: tx('কোর্সের বিবরণ আবশ্যক', 'Course description is required'),
        tab: 'basic',
      }
    }
    if (form.price === '' || Number.isNaN(Number(form.price)) || Number(form.price) < 0) {
      return {
        message: tx('সঠিক মূল্য দিন — ০ বা তার বেশি', 'Enter a valid price — 0 or more'),
        tab: 'basic',
      }
    }
    if (form.discountPrice !== '' && Number(form.discountPrice) < 0) {
      return {
        message: tx('ডিসকাউন্ট মূল্য ০ বা তার বেশি হতে হবে', 'Discount price must be 0 or more'),
        tab: 'basic',
      }
    }
    // Instructor: MUST be selected from the Instructor section (dropdown).
    // Legacy edits (course created before the section existed, with no
    // matching instructor) keep their stored snapshot via the legacy fields.
    if (form.instructorId) {
      // selected — valid
    } else if (instructors.length === 0) {
      return {
        message: tx(
          'কোনো ইন্সট্রাক্টর নেই — প্রথমে "ইন্সট্রাক্টর" সেকশনে যোগ করুন',
          'No instructors yet — add one in the Instructors section first'
        ),
        tab: 'media',
      }
    } else if (!form.instructorName.trim()) {
      return {
        message: tx(
          'ইন্সট্রাক্টর নির্বাচন করুন (ইন্সট্রাক্টর সেকশন থেকে)',
          'Select an instructor (from the Instructors section)'
        ),
        tab: 'media',
      }
    }
    if (chapters.length === 0) {
      return {
        message: tx('অন্তত একটি অধ্যায় যোগ করুন', 'Add at least one chapter'),
        tab: 'curriculum',
      }
    }
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i]
      const chLabel = ch.title.trim() || `${tx('অধ্যায়', 'Chapter')} ${i + 1}`
      if (ch.lessons.length === 0) {
        return {
          message: tx(
            `"${chLabel}"-এ অন্তত একটি লেসন যোগ করুন`,
            `Add at least one lesson to "${chLabel}"`
          ),
          tab: 'curriculum',
        }
      }
      for (let j = 0; j < ch.lessons.length; j++) {
        if (!ch.lessons[j].title.trim()) {
          return {
            message: tx(
              `${i + 1}.${j + 1} নম্বর লেসনের শিরোনাম দিন`,
              `Lesson ${i + 1}.${j + 1} needs a title`
            ),
            tab: 'curriculum',
          }
        }
      }
    }
    return null
  }

  async function handleSave() {
    const problem = validate()
    if (problem) {
      setTab(problem.tab)
      toast.error(tx('ফর্ম সম্পূর্ণ করুন', 'Please complete the form'), {
        description: problem.message,
      })
      return
    }
    setSaving(true)
    try {
      const body = buildBody(form, chapters)
      if (editingId) {
        await apiPut(`/api/courses/${editingId}`, body)
        toast.success(tx('কোর্স আপডেট হয়েছে', 'Course updated'))
      } else {
        await apiPost('/api/courses', body)
        toast.success(tx('কোর্স তৈরি হয়েছে', 'Course created'))
      }
      setDialogOpen(false)
      setEditingId(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সংরক্ষণ ব্যর্থ', 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  async function togglePublish(c: AdminCourseRow, next: boolean) {
    setBusyId(c.id)
    try {
      await apiPatch(`/api/courses/${c.id}`, { isPublished: next })
      setCourses((prev) => prev.map((x) => (x.id === c.id ? { ...x, isPublished: next } : x)))
      toast.success(
        next
          ? tx('কোর্স প্রকাশিত হয়েছে', 'Course published')
          : tx('কোর্স খসড়ায় নেওয়া হয়েছে', 'Course moved to draft')
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপডেট ব্যর্থ', 'Update failed'))
    } finally {
      setBusyId(null)
    }
  }

  async function toggleFeatured(c: AdminCourseRow) {
    setBusyId(c.id)
    try {
      await apiPatch(`/api/courses/${c.id}`, { isFeatured: !c.isFeatured })
      setCourses((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, isFeatured: !c.isFeatured } : x))
      )
      toast.success(tx('ফিচার্ড স্ট্যাটাস আপডেট হয়েছে', 'Featured status updated'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপডেট ব্যর্থ', 'Update failed'))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDuplicate(c: AdminCourseRow) {
    setBusyId(c.id)
    try {
      const data = await apiGet<unknown>(`/api/courses/${c.id}`)
      const detail = toDetail(data)
      await apiPost(
        '/api/courses',
        detailToBody(detail, {
          title: `${c.title} (কপি)`,
          isPublished: false,
          isFeatured: false,
        })
      )
      toast.success(
        tx('কোর্সের কপি খসড়া হিসেবে তৈরি হয়েছে', 'Course duplicated as a draft')
      )
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('কপি করা যায়নি', 'Duplicate failed'))
    } finally {
      setBusyId(null)
    }
  }

  async function bulkDeleteCourses() {
    setBulkDeleting(true)
    try {
      const r = await apiPost<{ deleted: number }>('/api/admin/bulk-delete', {
        resource: 'courses',
        ids: bulk.selected,
      })
      toast.success(
        tx(`${r.deleted} টি কোর্স মুছে ফেলা হয়েছে`, `${r.deleted} course(s) deleted`)
      )
      bulk.clear()
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setBulkDeleting(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    try {
      await apiDelete(`/api/courses/${deleteTarget.id}`)
      toast.success(tx('কোর্স মুছে ফেলা হয়েছে', 'Course deleted'))
      setDeleteTarget(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setBusyId(null)
    }
  }

  /* ── Chapter / lesson draft helpers ── */

  function addChapter() {
    setChapters((prev) => [...prev, { key: newKey(), title: '', lessons: [] }])
  }

  function removeChapter(index: number) {
    setChapters((prev) => prev.filter((_, i) => i !== index))
    setPendingDeleteChapter(null)
  }

  function moveChapter(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= chapters.length) return
    setChapters((prev) => {
      const next = [...prev]
      const tmp = next[index]
      next[index] = next[target]
      next[target] = tmp
      return next
    })
  }

  function updateChapter(ci: number, patch: Partial<ChapterDraft>) {
    setChapters((prev) => prev.map((ch, i) => (i === ci ? { ...ch, ...patch } : ch)))
  }

  function addLesson(ci: number) {
    setChapters((prev) =>
      prev.map((ch, i) =>
        i === ci
          ? {
              ...ch,
              lessons: [
                ...ch.lessons,
                {
                  key: newKey(),
                  title: '',
                  type: 'VIDEO' as LessonType,
                  provider: 'MP4' as VideoProvider,
                  videoUrl: '',
                  content: '',
                  pdfName: '',
                  durationMin: '',
                  isPreview: false,
                },
              ],
            }
          : ch
      )
    )
  }

  function updateLesson(ci: number, li: number, patch: Partial<LessonDraft>) {
    setChapters((prev) =>
      prev.map((ch, i) =>
        i === ci
          ? { ...ch, lessons: ch.lessons.map((ls, j) => (j === li ? { ...ls, ...patch } : ls)) }
          : ch
      )
    )
  }

  function moveLesson(ci: number, li: number, dir: -1 | 1) {
    setChapters((prev) =>
      prev.map((ch, i) => {
        if (i !== ci) return ch
        const target = li + dir
        if (target < 0 || target >= ch.lessons.length) return ch
        const lessons = [...ch.lessons]
        const tmp = lessons[li]
        lessons[li] = lessons[target]
        lessons[target] = tmp
        return { ...ch, lessons }
      })
    )
  }

  function duplicateLesson(ci: number, li: number) {
    setChapters((prev) =>
      prev.map((ch, i) => {
        if (i !== ci) return ch
        const src = ch.lessons[li]
        const copy: LessonDraft = { ...src, key: newKey(), id: undefined }
        const lessons = [...ch.lessons]
        lessons.splice(li + 1, 0, copy)
        return { ...ch, lessons }
      })
    )
  }

  function removeLesson(ci: number, li: number) {
    setChapters((prev) =>
      prev.map((ch, i) =>
        i === ci ? { ...ch, lessons: ch.lessons.filter((_, j) => j !== li) } : ch
      )
    )
  }

  async function uploadPdf(ci: number, li: number, file: File) {
    const ls = chapters[ci]?.lessons[li]
    if (!ls) return
    if (file.type !== 'application/pdf') {
      toast.error(tx('শুধুমাত্র PDF ফাইল আপলোড করা যাবে', 'Only PDF files can be uploaded'))
      return
    }
    if (file.size > PDF_MAX_MB * 1024 * 1024) {
      toast.error(
        tx(
          `PDF সাইজ ${PDF_MAX_MB}MB এর কম হতে হবে`,
          `PDF must be smaller than ${PDF_MAX_MB}MB`
        )
      )
      return
    }
    setPdfUploadingKey(ls.key)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      const json = (await res.json()) as {
        ok: boolean
        data?: { url?: string }
        error?: string
      }
      if (!res.ok || !json.ok || !json.data?.url) {
        throw new Error(json.error || tx('আপলোড ব্যর্থ হয়েছে', 'Upload failed'))
      }
      updateLesson(ci, li, { content: json.data.url, pdfName: file.name })
      toast.success(tx('PDF আপলোড হয়েছে', 'PDF uploaded'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপলোড ব্যর্থ হয়েছে', 'Upload failed'))
    } finally {
      setPdfUploadingKey(null)
    }
  }

/** Upload a LOCAL video file (ANY format, ≤512MB) → /api/admin/upload → sets videoUrl. */
  async function uploadVideo(ci: number, li: number, file: File) {
    const ls = chapters[ci]?.lessons[li]
    if (!ls) return
    if (file.size > VIDEO_MAX_MB * 1024 * 1024) {
      toast.error(
        tx(`ভিডিও সাইজ ${VIDEO_MAX_MB}MB এর কম হতে হবে`, `Video must be smaller than ${VIDEO_MAX_MB}MB`)
      )
      return
    }
    setVideoUploadingKey(ls.key)
    setVideoPct(0)
    try {
      const json = await uploadFileXhr(file, { kind: 'video', onProgress: setVideoPct })
      updateLesson(ci, li, { provider: 'MP4', videoUrl: json.url })
      toast.success(tx('ভিডিও আপলোড হয়েছে ✓', 'Video uploaded ✓'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপলোড ব্যর্থ হয়েছে', 'Upload failed'))
    } finally {
      setVideoUploadingKey(null)
      setVideoPct(0)
    }
  }

  /* ── Guard ── */

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return <AccessDenied />
  }

  return (
    <div className="space-y-6">
      {/* A) Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{t('admin_courses')}</h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'কোর্স আপলোড, কারিকুলাম বিল্ডার, ভিডিও/PDF লেসন ও প্রকাশ নিয়ন্ত্রণ',
              'Course upload, curriculum builder, video/PDF lessons and publishing control'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" /> {t('add_course')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-28 rounded-full" />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-7 w-7" />}
          title={tx('কোনো কোর্স নেই', 'No courses yet')}
          description={tx(
            'প্রথম কোর্সটি তৈরি করে শিক্ষার্থীদের জন্য খুলে দিন।',
            'Create your first course and open it for students.'
          )}
          actionLabel={t('add_course')}
          onAction={openCreate}
        />
      ) : (
        <>
          {/* B) Summary chips */}
          <div className="flex flex-wrap gap-2">
            <StatChip label={tx('মোট কোর্স', 'Total courses')} value={totals.total} />
            <StatChip label={tx('প্রকাশিত', 'Published')} value={totals.published} />
            <StatChip label={tx('খসড়া', 'Drafts')} value={totals.drafts} />
            <StatChip label={tx('মোট শিক্ষার্থী', 'Total students')} value={totals.students} />
            <StatChip label={tx('মোট লেসন', 'Total lessons')} value={totals.lessons} />
          </div>

          {/* C) Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'published' | 'draft')}>
              <TabsList>
                <TabsTrigger value="all">
                  {tx('সব', 'All')} ({digitsBn(totals.total)})
                </TabsTrigger>
                <TabsTrigger value="published">
                  {tx('প্রকাশিত', 'Published')} ({digitsBn(totals.published)})
                </TabsTrigger>
                <TabsTrigger value="draft">
                  {tx('খসড়া', 'Draft')} ({digitsBn(totals.drafts)})
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-1 flex-wrap items-center justify-start gap-2 sm:justify-end">
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={tx('শিরোনাম বা ইন্সট্রাক্টর খুঁজুন', 'Search title or instructor')}
                className="w-full sm:w-56"
                aria-label={tx('কোর্স খুঁজুন', 'Search courses')}
              />
              <Select value={catFilter} onValueChange={setCatFilter}>
                <SelectTrigger className="w-full sm:w-44" aria-label={tx('ক্যাটাগরি ফিল্টার', 'Category filter')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tx('সব ক্যাটাগরি', 'All categories')}</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* D) Table */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-7 w-7" />}
              title={tx('কোনো কোর্স পাওয়া যায়নি', 'No courses found')}
              description={tx(
                'ফিল্টার বা সার্চ পরিবর্তন করে আবার চেষ্টা করুন।',
                'Try changing the filters or search.'
              )}
            />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardContent className="p-0">
                  <ScrollX>
                  <Table className="min-w-[1020px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <SelectAll
                            ids={filtered.map((c) => c.id)}
                            isSelected={bulk.isSelected}
                            onToggleAll={bulk.toggleAll}
                          />
                        </TableHead>
                        <TableHead className="min-w-[260px]">{tx('কোর্স', 'Course')}</TableHead>
                        <TableHead>{tx('ক্যাটাগরি', 'Category')}</TableHead>
                        <TableHead>{tx('মূল্য', 'Price')}</TableHead>
                        <TableHead>{tx('লেসন', 'Lessons')}</TableHead>
                        <TableHead>{tx('শিক্ষার্থী', 'Students')}</TableHead>
                        <TableHead>{tx('তারিখ', 'Date')}</TableHead>
                        <TableHead>{tx('ফিচার্ড', 'Featured')}</TableHead>
                        <TableHead>{t('publish')}</TableHead>
                        <TableHead>{tx('স্ট্যাটাস', 'Status')}</TableHead>
                        <TableHead className="text-right">{t('actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c) => {
                        const hasDiscount =
                          c.discountPrice != null && c.discountPrice < c.price
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="w-10">
                              <RowBox id={c.id} isSelected={bulk.isSelected} onToggle={bulk.toggle} />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <span className="relative block h-10 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
                                  {c.thumbnail ? (
                                    <Image
                                      src={c.thumbnail}
                                      alt={c.title}
                                      fill
                                      sizes="64px"
                                      unoptimized={c.thumbnail.startsWith('http')}
                                      className="object-cover"
                                    />
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                                      <BookOpen className="h-4 w-4" />
                                    </span>
                                  )}
                                </span>
                                <div className="min-w-0">
                                  <p className="line-clamp-1 text-sm font-semibold">{c.title}</p>
                                  <p className="line-clamp-1 text-xs text-muted-foreground">
                                    {c.subtitle || c.instructorName || '—'}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {c.categoryName || '—'}
                            </TableCell>
                            <TableCell>
                              <div className="font-semibold">
                                {fmtBDT(hasDiscount ? (c.discountPrice as number) : c.price)}
                              </div>
                              {hasDiscount && (
                                <div className="text-xs text-muted-foreground line-through">
                                  {fmtBDT(c.price)}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {digitsBn(c.lessonsTotal ?? 0)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {digitsBn(c._count?.enrollments ?? 0)}
                            </TableCell>
                            <TableCell>
                              <DateStamp iso={c.createdAt} label={tx('তৈরির তারিখ', 'Created at')} />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-8 w-8 ${
                                  c.isFeatured ? 'text-amber-500' : 'text-muted-foreground/50'
                                }`}
                                disabled={busyId === c.id}
                                onClick={() => void toggleFeatured(c)}
                                aria-label={tx('ফিচার্ড টগল করুন', 'Toggle featured')}
                              >
                                <Star
                                  className={`h-4 w-4 ${c.isFeatured ? 'fill-amber-400 text-amber-400' : ''}`}
                                />
                              </Button>
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={c.isPublished}
                                disabled={busyId === c.id}
                                onCheckedChange={(v) => void togglePublish(c, v)}
                                aria-label={t('publish')}
                              />
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                  c.isPublished
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {c.isPublished
                                  ? tx('প্রকাশিত', 'Published')
                                  : tx('খসড়া', 'Draft')}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={busyId === c.id}
                                    aria-label={t('actions')}
                                  >
                                    {busyId === c.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <MoreHorizontal className="h-4 w-4" />
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    className="gap-2"
                                    onClick={() => openEdit(c.id)}
                                  >
                                    <Pencil className="h-4 w-4" /> {t('edit')}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="gap-2"
                                    onClick={() => void handleDuplicate(c)}
                                  >
                                    <Copy className="h-4 w-4" /> {tx('কপি তৈরি', 'Duplicate')}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="gap-2 text-destructive focus:text-destructive"
                                    onClick={() => setDeleteTarget(c)}
                                  >
                                    <Trash2 className="h-4 w-4" /> {t('delete')}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  </ScrollX>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}

      {/* E) Create / Edit dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) setEditingId(null)
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? tx('কোর্স সম্পাদনা', 'Edit course')
                : tx('নতুন কোর্স তৈরি করুন', 'Create a new course')}
            </DialogTitle>
            <DialogDescription>
              {tx(
                'তারকাচিহ্নিত (*) ঘরগুলো আবশ্যক। সব ট্যাব পূরণ করে সেভ চাপুন।',
                'Fields marked (*) are required. Fill every tab, then save.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(85vh-9rem)] overflow-y-auto pr-1">
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as DialogTab)}
              className="flex flex-col gap-4"
            >
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="basic" className="gap-1.5">
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">{tx('মূল তথ্য', 'Basics')}</span>
                </TabsTrigger>
                <TabsTrigger value="curriculum" className="gap-1.5">
                  <Layers className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('curriculum')}</span>
                </TabsTrigger>
                <TabsTrigger value="media" className="gap-1.5">
                  <GraduationCap className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {tx('ইন্সট্রাক্টর ও ছবি', 'Instructor & Media')}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="extras" className="gap-1.5">
                  <Sparkles className="h-4 w-4" />
                  <span className="hidden sm:inline">{tx('সুবিধা ও শর্ত', 'Benefits')}</span>
                </TabsTrigger>
              </TabsList>

              {/* ── Tab 1: Basics ── */}
              <TabsContent value="basic" className="space-y-4">
                <div className="grid gap-2">
                  <Label>
                    {tx('শিরোনাম', 'Title')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setField('title', e.target.value)}
                    placeholder={tx('যেমন: এসএসসি পদার্থবিজ্ঞান ফুল কোর্স', 'e.g. SSC Physics Full Course')}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{tx('শিরোনাম (ইংরেজি)', 'Title (English)')}</Label>
                  <Input
                    value={form.titleEn}
                    onChange={(e) => setField('titleEn', e.target.value)}
                    placeholder={tx('English title', 'English title')}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{tx('সাবটাইটেল', 'Subtitle')}</Label>
                  <Input
                    value={form.subtitle}
                    onChange={(e) => setField('subtitle', e.target.value)}
                    placeholder={tx('সংক্ষিপ্ত বিবরণ', 'Short tagline')}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>
                    {t('description')} <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    rows={5}
                    value={form.description}
                    onChange={(e) => setField('description', e.target.value)}
                    placeholder={tx(
                      'কোর্সে যা যা থাকবে বিস্তারিত লিখুন',
                      'Describe what the course includes'
                    )}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>{tx('ক্যাটাগরি', 'Category')}</Label>
                    <Select
                      value={form.categoryId || 'none'}
                      onValueChange={(v) => setField('categoryId', v === 'none' ? '' : v)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={tx('নির্বাচন করুন', 'Select category')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tx('ক্যাটাগরি নেই', 'No category')}</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Subject assignment (multi-select dropdown, always English) — same dropdown UX as Category */}
                  <div className="grid gap-2">
                    <Label>{tx('সাবজেক্ট (English)', 'Subjects (English)')}</Label>
                    {subjects.length === 0 ? (
                      <p className="rounded-xl border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
                        {tx(
                          'এখনো কোনো সাবজেক্ট নেই — Admin → সাবজেক্ট থেকে তৈরি করুন।',
                          'No subjects yet — create them from Admin → Subjects.'
                        )}
                      </p>
                    ) : (
                      <SubjectMultiSelect
                        subjects={subjects}
                        value={form.subjectIds}
                        onChange={(ids) => setField('subjectIds', ids)}
                      />
                    )}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>{tx('ভাষা', 'Language')}</Label>
                    <Select
                      value={form.language}
                      onValueChange={(v) => setField('language', v === 'en' ? 'en' : 'bn')}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bn">{tx('বাংলা', 'Bangla')}</SelectItem>
                        <SelectItem value="en">{tx('ইংরেজি', 'English')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>{tx('মূল্য (৳)', 'Price (BDT)')} <span className="text-destructive">*</span></Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.price}
                      onChange={(e) => setField('price', e.target.value)}
                      placeholder="1490"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{tx('ডিসকাউন্ট মূল্য (৳)', 'Discount price (BDT)')}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.discountPrice}
                      onChange={(e) => setField('discountPrice', e.target.value)}
                      placeholder={tx('ঐচ্ছিক', 'Optional')}
                    />
                  </div>
                </div>

                {/* ── Course validity (access duration after enrollment) — colorful picker ── */}
                <div className="grid gap-2">
                  <Label id="course-validity-label">{tx('কোর্স ভ্যালিডিটি', 'Course validity')}</Label>
                  <div
                    role="radiogroup"
                    aria-labelledby="course-validity-label"
                    className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
                  >
                    {(
                      [
                        { value: '1', icon: Hourglass },
                        { value: '2', icon: Hourglass },
                        { value: '3', icon: Hourglass },
                        { value: '6', icon: Hourglass },
                        { value: '12', icon: Hourglass },
                        { value: 'lifetime', icon: InfinityIcon },
                      ] as { value: ValidityKey; icon: typeof Hourglass }[]
                    ).map(({ value, icon: Icon }) => {
                      const active = form.validity === value
                      const tone = VALIDITY_TONES[value]
                      const label = VALIDITY_LABELS[value]
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setField('validity', value)}
                          className={`relative flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all duration-200 ${
                            active
                              ? `${tone.selected} shadow-md`
                              : 'border-border bg-card hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-sm'
                          }`}
                        >
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${tone.circle} text-white shadow-sm`}
                            aria-hidden
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="text-sm font-bold leading-tight">{tx(label.bn, label.en)}</span>
                          <span className={`text-[11px] leading-tight ${active ? tone.text : 'text-muted-foreground'}`}>
                            {tx(label.subBn, label.subEn)}
                          </span>
                          {active && (
                            <span
                              className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br ${tone.circle} text-white`}
                              aria-hidden
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="h-3 w-3">
                                <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tx(
                      'ভর্তির তারিখ থেকে এই সময় পর্যন্ত শিক্ষার্থীর অ্যাক্সেস স্বয়ংক্রিয়ভাবে গণনা হবে।',
                      'The student’s access is computed automatically from their enrollment date.'
                    )}
                  </p>
                </div>

                {/* ── Subject assignment removed from here — now beside Category in the basic row ── */}

                <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
                  <label className="flex items-center justify-between gap-3 text-sm font-medium">
                    <span>
                      {t('publish')}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {tx(
                          'চালু করলে কোর্সটি সাইটে সবাই দেখতে পাবে',
                          'When on, the course is publicly visible'
                        )}
                      </span>
                    </span>
                    <Switch
                      checked={form.isPublished}
                      onCheckedChange={(v) => setField('isPublished', v)}
                      aria-label={t('publish')}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 text-sm font-medium">
                    <span>
                      {tx('ফিচার্ড', 'Featured')}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {tx(
                          'হোম পেজের ফিচার্ড সেকশনে দেখাবে',
                          'Shown in the featured section on the homepage'
                        )}
                      </span>
                    </span>
                    <Switch
                      checked={form.isFeatured}
                      onCheckedChange={(v) => setField('isFeatured', v)}
                      aria-label={tx('ফিচার্ড', 'Featured')}
                    />
                  </label>
                </div>
              </TabsContent>

              {/* ── Tab 2: Curriculum builder ── */}
              <TabsContent value="curriculum" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label className="text-sm font-semibold">{t('curriculum')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {tx(
                        'অধ্যায় ও লেসন সাজিয়ে কারিকুলাম তৈরি করুন',
                        'Build the curriculum with chapters and lessons'
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={addChapter}
                  >
                    <Plus className="h-4 w-4" /> {t('add_chapter')}
                  </Button>
                </div>

                {chapters.length === 0 && (
                  <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    {tx(
                      'এখনো কোনো অধ্যায় নেই — "অধ্যায় যোগ করুন" চাপুন।',
                      'No chapters yet — press "Add Chapter".'
                    )}
                  </p>
                )}

                {chapters.map((ch, ci) => (
                  <Card key={ch.key} className="gap-3 rounded-2xl p-4">
                    {/* Chapter header */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                        {digitsBn(ci + 1)}
                      </span>
                      <Input
                        value={ch.title}
                        onChange={(e) => updateChapter(ci, { title: e.target.value })}
                        placeholder={tx('অধ্যায়ের শিরোনাম', 'Chapter title')}
                        className="min-w-[140px] flex-1"
                        aria-label={tx('অধ্যায়ের শিরোনাম', 'Chapter title')}
                      />
                      <Badge variant="outline" className="shrink-0">
                        {digitsBn(ch.lessons.length)} {tx('লেসন', 'lessons')}
                      </Badge>
                      <div className="flex items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={ci === 0}
                          onClick={() => moveChapter(ci, -1)}
                          aria-label={tx('অধ্যায় উপরে সরান', 'Move chapter up')}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={ci === chapters.length - 1}
                          onClick={() => moveChapter(ci, 1)}
                          aria-label={tx('অধ্যায় নিচে সরান', 'Move chapter down')}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        {pendingDeleteChapter === ch.key ? (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              onClick={() => removeChapter(ci)}
                            >
                              {tx('নিশ্চিত?', 'Confirm?')}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setPendingDeleteChapter(null)}
                              aria-label={t('cancel')}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setPendingDeleteChapter(ch.key)}
                            aria-label={tx('অধ্যায় মুছুন', 'Delete chapter')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Lesson rows */}
                    {ch.lessons.map((ls, li) => (
                      <div key={ls.key} className="space-y-2 rounded-xl border bg-muted/20 p-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold">
                            {digitsBn(ci + 1)}.{digitsBn(li + 1)}
                          </span>
                          <Input
                            value={ls.title}
                            onChange={(e) => updateLesson(ci, li, { title: e.target.value })}
                            placeholder={tx('লেসনের শিরোনাম', 'Lesson title')}
                            aria-label={tx('লেসনের শিরোনাম', 'Lesson title')}
                          />
                          <Select
                            value={ls.type}
                            onValueChange={(v) =>
                              updateLesson(ci, li, { type: v as LessonType })
                            }
                          >
                            <SelectTrigger className="w-[100px] shrink-0" aria-label={tx('লেসনের ধরন', 'Lesson type')}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LESSON_TYPES.map((lt) => (
                                <SelectItem key={lt} value={lt}>
                                  {lt === 'VIDEO'
                                    ? tx('ভিডিও', 'Video')
                                    : lt === 'PDF'
                                      ? 'PDF'
                                      : tx('টেক্সট', 'Text')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Conditional content block */}
                        {ls.type === 'VIDEO' && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Select
                              value={ls.provider}
                              onValueChange={(v) =>
                                updateLesson(ci, li, { provider: v as VideoProvider })
                              }
                            >
                              <SelectTrigger className="h-8 w-[120px] shrink-0" aria-label={tx('ভিডিও প্রোভাইডার', 'Video provider')}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {VIDEO_PROVIDERS.map((p) => (
                                  <SelectItem key={p} value={p}>
                                    {providerLabel(p, lang === 'bn')}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              value={ls.videoUrl}
                              onChange={(e) => {
                                const v = e.target.value
                                // Auto-detect provider from pasted link (only upgrades MP4 → known provider)
                                const det = deriveProvider(v)
                                if (v.trim() && det !== 'MP4' && ls.provider !== det) {
                                  updateLesson(ci, li, { videoUrl: v, provider: det })
                                } else {
                                  updateLesson(ci, li, { videoUrl: v })
                                }
                              }}
                              placeholder={providerPlaceholder(ls.provider)}
                              className="h-8 min-w-[160px] flex-1"
                              aria-label={tx('ভিডিও URL', 'Video URL')}
                            />
                            {/* Local video upload (MP4/WebM/MOV ≤128MB) */}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5"
                              disabled={videoUploadingKey === ls.key}
                              onClick={() => {
                                setVideoTarget({ ci, li })
                                videoInputRef.current?.click()
                              }}
                              aria-label={tx('লোকাল ভিডিও আপলোড', 'Upload local video')}
                            >
                              {videoUploadingKey === ls.key ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <UploadCloud className="h-4 w-4" />
                              )}
                              {videoUploadingKey === ls.key
                                ? `${tx('আপলোড', 'Uploading')} ${digitsBn(videoPct)}%`
                                : tx('লোকাল ভিডিও', 'Local video')}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5"
                              onClick={() => {
                                setLibraryAccept('VIDEO')
                                setLibraryTarget({ ci, li })
                                setLibraryOpen(true)
                              }}
                              aria-label={tx('মিডিয়া লাইব্রেরি থেকে ভিডিও', 'Pick video from library')}
                            >
                              <Layers className="h-4 w-4" /> {tx('লাইব্রেরি', 'Library')}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5"
                              disabled={!ls.videoUrl.trim()}
                              onClick={() =>
                                setPreview({
                                  title: ls.title.trim() || tx('ভিডিও প্রিভিউ', 'Video preview'),
                                  provider: ls.provider,
                                  url: ls.videoUrl.trim(),
                                })
                              }
                            >
                              <Eye className="h-4 w-4" /> {tx('প্রিভিউ', 'Preview')}
                            </Button>
                          </div>
                        )}

                        {ls.type === 'PDF' && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5"
                              disabled={pdfUploadingKey === ls.key}
                              onClick={() => {
                                setPdfTarget({ ci, li })
                                pdfInputRef.current?.click()
                              }}
                            >
                              {pdfUploadingKey === ls.key ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <UploadCloud className="h-4 w-4" />
                              )}
                              {ls.pdfName
                                ? tx('ফাইল পরিবর্তন', 'Change file')
                                : tx('PDF আপলোড', 'Upload PDF')}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5"
                              onClick={() => {
                                setLibraryAccept('PDF')
                                setLibraryTarget({ ci, li })
                                setLibraryOpen(true)
                              }}
                            >
                              <Layers className="h-4 w-4" /> {tx('লাইব্রেরি', 'Library')}
                            </Button>
                            {ls.pdfName && (
                              <span className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">
                                <PdfFileIcon className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{ls.pdfName}</span>
                                <button
                                  type="button"
                                  onClick={() => updateLesson(ci, li, { pdfName: '' })}
                                  aria-label={tx('ফাইল সরান', 'Remove file')}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {tx('অথবা', 'or')}
                            </span>
                            <Input
                              value={ls.content}
                              onChange={(e) => updateLesson(ci, li, { content: e.target.value })}
                              placeholder={tx('PDF লিংক (URL)', 'PDF link (URL)')}
                              className="h-8 min-w-[140px] flex-1"
                              aria-label={tx('PDF লিংক', 'PDF link')}
                            />
                          </div>
                        )}

                        {ls.type === 'TEXT' && (
                          <Textarea
                            rows={3}
                            value={ls.content}
                            onChange={(e) => updateLesson(ci, li, { content: e.target.value })}
                            placeholder={tx('টেক্সট কনটেন্ট লিখুন', 'Write the text content')}
                            aria-label={tx('টেক্সট কনটেন্ট', 'Text content')}
                          />
                        )}

                        {/* Meta + row controls */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {tx('সময় (মিনিট)', 'Duration (min)')}
                            <Input
                              type="number"
                              min={0}
                              className="h-8 w-20"
                              value={ls.durationMin}
                              onChange={(e) =>
                                updateLesson(ci, li, { durationMin: e.target.value })
                              }
                              aria-label={tx('সময় (মিনিট)', 'Duration (min)')}
                            />
                          </label>
                          <label className="flex items-center gap-2 text-xs font-medium">
                            <Checkbox
                              checked={ls.isPreview}
                              onCheckedChange={(v) =>
                                updateLesson(ci, li, { isPreview: v === true })
                              }
                              aria-label={tx('ফ্রি প্রিভিউ', 'Free preview')}
                            />
                            {tx('ফ্রি প্রিভিউ', 'Free preview')}
                          </label>
                          <div className="ml-auto flex items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={li === 0}
                              onClick={() => moveLesson(ci, li, -1)}
                              aria-label={tx('লেসন উপরে সরান', 'Move lesson up')}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={li === ch.lessons.length - 1}
                              onClick={() => moveLesson(ci, li, 1)}
                              aria-label={tx('লেসন নিচে সরান', 'Move lesson down')}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => duplicateLesson(ci, li)}
                              aria-label={tx('লেসন কপি করুন', 'Duplicate lesson')}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => removeLesson(ci, li)}
                              aria-label={tx('লেসন মুছুন', 'Delete lesson')}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 self-start text-primary"
                      onClick={() => addLesson(ci)}
                    >
                      <Plus className="h-4 w-4" /> {t('add_lesson')}
                    </Button>
                  </Card>
                ))}

                {/* Sticky summary */}
                {chapters.length > 0 && (
                  <div className="sticky bottom-0 mt-2 flex items-center gap-2 rounded-xl border bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
                    <Layers className="h-4 w-4 text-primary" />
                    <p className="text-xs font-medium text-muted-foreground">
                      {digitsBn(chapters.length)} {tx('অধ্যায়', 'chapters')} ·{' '}
                      {digitsBn(curriculumStats.lessonCount)} {tx('লেসন', 'lessons')} ·{' '}
                      {curriculumStats.durationLabel}
                    </p>
                  </div>
                )}

                {/* Shared PDF file input (one hidden input, target tracked by state) */}
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f && pdfTarget) void uploadPdf(pdfTarget.ci, pdfTarget.li, f)
                    setPdfTarget(null)
                    e.target.value = ''
                  }}
                />

                {/* Shared LOCAL VIDEO file input (one hidden input, target tracked by state) */}
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*,.mp4,.mkv,.avi,.wmv,.flv,.3gp,.3g2,.mpg,.mpeg,.mpe,.m2ts,.mts,.ts,.vob,.mxf,.rm,.rmvb,.asf,.divx,.f4v,.mov,.m4v,.webm,.ogv,.ogg,.qt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f && videoTarget) void uploadVideo(videoTarget.ci, videoTarget.li, f)
                    setVideoTarget(null)
                    e.target.value = ''
                  }}
                />
              </TabsContent>

              {/* ── Tab 3: Instructor & media ── */}
              <TabsContent value="media" className="space-y-4">
                <div className="grid gap-2">
                  <Label>{tx('কোর্স থাম্বনেইল', 'Course thumbnail')}</Label>
                  <ImageUpload
                    value={form.thumbnail}
                    onChange={(v) => setField('thumbnail', v)}
                    presets={PRESET_THUMBS}
                  />
                </div>

                {/* ── Instructor: SELECT from the Instructors section ── */}
                <div className="rounded-2xl border bg-muted/25 p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold">
                        {tx('ইন্সট্রাক্টর নির্বাচন করুন', 'Select the instructor')}
                      </p>
                      <span className="text-destructive">*</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => go('#/admin/instructors')}
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      {tx('ইন্সট্রাক্টর সেকশন', 'Instructors section')}
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    {instructors.length === 0 ? (
                      <div className="rounded-xl border border-dashed bg-card p-4 text-center">
                        <p className="text-sm font-medium">
                          {tx('কোনো ইন্সট্রাক্টর তৈরি হয়নি', 'No instructors created yet')}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {tx(
                            'ইন্সট্রাক্টর এখন "ইন্সট্রাক্টর" সেকশনে তৈরি হয় — সেখানে প্রোফাইল যোগ করলেই এখানে ড্রপডাউনে চলে আসবে এবং About পেজের "আমাদের টিম"-এ দেখাবে।',
                            'Instructors are now created in the "Instructors" section — profiles added there appear in this dropdown and in "Our Team" on the About page.'
                          )}
                        </p>
                        <Button
                          size="sm"
                          className="mt-2 gap-2"
                          onClick={() => go('#/admin/instructors')}
                        >
                          <Plus className="h-4 w-4" />
                          {tx('ইন্সট্রাক্টর যোগ করুন', 'Add an instructor')}
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Select
                          value={form.instructorId}
                          onValueChange={(v) => {
                            const ins = instructors.find((i) => i.id === v)
                            setField('instructorId', v)
                            if (ins) {
                              // Preview name mirrors the selection; the server
                              // syncs the full snapshot from the record.
                              setField('instructorName', ins.name)
                            }
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue
                              placeholder={tx(
                                'ইন্সট্রাক্টর সেকশন থেকে বাছুন',
                                'Pick from the Instructors section'
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            {instructors.map((ins) => (
                              <SelectItem key={ins.id} value={ins.id}>
                                {ins.name}
                                {ins.designation ? ` — ${ins.designation}` : ''}
                                {!ins.isActive ? tx(' (লুকানো)', ' (hidden)') : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(() => {
                          const sel = instructors.find((i) => i.id === form.instructorId)
                          if (!sel) {
                            // Legacy edit: a stored snapshot exists but nothing
                            // selected yet — saving keeps the legacy profile.
                            return form.instructorName.trim() ? (
                              <p className="text-xs text-muted-foreground">
                                {tx(
                                  `বর্তমানে সংরক্ষিত: "${form.instructorName.trim()}" (লিগ্যাসি) — নতুন করে নির্বাচন না করলে এটিই থাকবে।`,
                                  `Currently stored: "${form.instructorName.trim()}" (legacy) — kept unless you select a new instructor.`
                                )}
                              </p>
                            ) : null
                          }
                          return (
                            <div className="flex items-start gap-3 rounded-xl border bg-card p-3">
                              {sel.photoUrl ? (
                                <img
                                  src={sel.photoUrl}
                                  alt={sel.name}
                                  className="h-12 w-12 shrink-0 rounded-full border-2 border-primary/25 object-cover"
                                />
                              ) : (
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                                  {sel.name.charAt(0)}
                                </span>
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-bold">{sel.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {sel.designation || tx('পদবি নেই', 'No designation')}
                                </p>
                                {sel.bio ? (
                                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                    {sel.bio}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          )
                        })()}
                        <p className="text-xs text-muted-foreground">
                          {tx(
                            'ইন্সট্রাক্টরের নাম, পদবি, ছবি ও বায়ো ইন্সট্রাক্টর সেকশন থেকেই আসবে — সেখানে আপডেট করলে কোর্স ও About পেজেও হালনাগাদ হয়।',
                            'Name, designation, photo and bio come from the Instructors section — updating them there refreshes courses and the About page too.'
                          )}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* ── Tab 4: Benefits & requirements ── */}
              <TabsContent value="extras" className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    {tx('যা যা শিখবেন', 'What you will learn')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {tx(
                      'প্রতিটি সুবিধা একটি করে লাইনে লিখুন — কোর্স পেজে তালিকা হিসেবে দেখাবে।',
                      'One benefit per line — shown as a list on the course page.'
                    )}
                  </p>
                  <ListEditor
                    items={form.benefits}
                    onChange={(items) => setField('benefits', items)}
                    placeholder={tx('যেমন: লাইভ ক্লাস ও রেকর্ডিং', 'e.g. Live classes and recordings')}
                    addLabel={tx('একটি সুবিধা যোগ করুন', 'Add a benefit')}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    {tx('প্রয়োজনীয়তা', 'Requirements')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {tx(
                      'ভর্তির আগে শিক্ষার্থীর কী কী প্রয়োজন হবে।',
                      'What students need before enrolling.'
                    )}
                  </p>
                  <ListEditor
                    items={form.requirements}
                    onChange={(items) => setField('requirements', items)}
                    placeholder={tx('যেমন: ইন্টারনেট সংযোগ ও স্মার্টফোন', 'e.g. Internet connection and a smartphone')}
                    addLabel={tx('একটি শর্ত যোগ করুন', 'Add a requirement')}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Media Library picker (video / pdf reuse) */}
      <MediaLibraryPicker
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        accept={libraryAccept}
        onPick={(url) => {
          if (!libraryTarget) return
          if (libraryAccept === 'PDF') {
            updateLesson(libraryTarget.ci, libraryTarget.li, { content: url, pdfName: url.split('/').pop() ?? 'PDF' })
          } else {
            updateLesson(libraryTarget.ci, libraryTarget.li, { provider: 'MP4', videoUrl: url })
          }
          setLibraryTarget(null)
        }}
      />

      {/* Video preview dialog */}
      <PreviewPlayer preview={preview} onClose={() => setPreview(null)} />

      {/* Bulk delete bar */}
      <BulkBar
        count={bulk.count}
        deleting={bulkDeleting}
        onDelete={() => void bulkDeleteCourses()}
        onClear={bulk.clear}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tx('কোর্স মুছে ফেলবেন?', 'Delete this course?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `"${deleteTarget?.title ?? ''}" স্থায়ীভাবে মুছে যাবে — এনরোলমেন্ট, অধ্যায় ও লেসনসহ। এটি ফেরানো যাবে না।`,
                `"${deleteTarget?.title ?? ''}" will be permanently deleted, including enrollments, chapters and lessons. This cannot be undone.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

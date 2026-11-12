'use client'

/**
 * AdminLiveClassesView — schedule and manage live classes (Zoom / Google Meet /
 * custom links). Upcoming classes first (soonest at top), past classes dimmed
 * after them. Includes course linkage, publish toggle and join-link helpers.
 * API: /api/live-classes (GET ?scope=all, POST) · /api/live-classes/[id] (PUT, DELETE)
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  CalendarClock,
  Clock,
  ExternalLink,
  GraduationCap,
  Globe,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldX,
  Trash2,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/empty-state'
import {
  BulkBar,
  DetailsDialog,
  RowBox,
  useBulkSelection,
  type DetailField,
} from '@/components/admin/data-tools'
import { apiDelete, apiGet, apiPost, apiPut, apiSend } from '@/lib/api-client'
import { digitsBn, fmtDateTime, fmtStampText } from '@/lib/format'
import { DateStamp } from '@/components/admin/date-stamp'
import { useAuth } from '@/store/auth-store'
import { go, useUI } from '@/store/ui-store'
import { isPanelRole, isOwner } from '@/lib/roles'

interface LiveClassRow {
  id: string
  title: string
  provider: 'ZOOM' | 'MEET' | 'CUSTOM'
  joinUrl: string
  scheduledAt: string
  durationMin: number
  notes: string | null
  isPublished: boolean
  createdAt: string
  course: { id: string; title: string; slug: string } | null
}

interface CourseOption {
  id: string
  title: string
}

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

function providerLabel(p: string, tx: (bn: string, en: string) => string): string {
  if (p === 'ZOOM') return 'Zoom'
  if (p === 'MEET') return tx('গুগল মিট', 'Google Meet')
  return tx('কাস্টম লিংক', 'Custom link')
}

function providerStyle(p: string): string {
  switch (p) {
    case 'ZOOM':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300'
    case 'MEET':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
    default:
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
  }
}

/** ISO string → value usable by <input type="datetime-local"> in the local zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AdminLiveClassesView() {
  const { user, status, initialized } = useAuth()
  const { tx, lang } = useUI()

  const [classes, setClasses] = useState<LiveClassRow[]>([])
  const [courses, setCourses] = useState<CourseOption[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<LiveClassRow | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formProvider, setFormProvider] = useState<'ZOOM' | 'MEET' | 'CUSTOM'>('ZOOM')
  const [formJoinUrl, setFormJoinUrl] = useState('')
  const [formScheduled, setFormScheduled] = useState('')
  const [formDuration, setFormDuration] = useState('60')
  const [formNotes, setFormNotes] = useState('')
  const [formCourseId, setFormCourseId] = useState('none')
  const [formPublished, setFormPublished] = useState(true)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<LiveClassRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const bulk = useBulkSelection()
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [details, setDetails] = useState<LiveClassRow | null>(null)
  const [nowTs, setNowTs] = useState(() => Date.now())

  const num = (n: number | string) => (lang === 'bn' ? digitsBn(n) : String(n))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cls, crs] = await Promise.all([
        apiGet<LiveClassRow[]>('/api/live-classes?scope=all'),
        apiGet<CourseOption[]>('/api/courses?limit=100').catch(() => [] as CourseOption[]),
      ])
      setClasses(cls)
      setCourses(crs)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [tx])

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [load])

  // Keep the upcoming/past split fresh while the panel stays open.
  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const sorted = useMemo(() => {
    const upcoming: LiveClassRow[] = []
    const past: LiveClassRow[] = []
    for (const c of classes) {
      (new Date(c.scheduledAt).getTime() + c.durationMin * 60_000 >= nowTs ? upcoming : past).push(c)
    }
    upcoming.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    past.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
    return { upcoming, past }
  }, [classes, nowTs])

  function openCreate() {
    setEditing(null)
    setFormTitle('')
    setFormProvider('ZOOM')
    setFormJoinUrl('')
    setFormScheduled('')
    setFormDuration('60')
    setFormNotes('')
    setFormCourseId('none')
    setFormPublished(true)
    setDialogOpen(true)
  }

  function openEdit(c: LiveClassRow) {
    setEditing(c)
    setFormTitle(c.title)
    setFormProvider(c.provider)
    setFormJoinUrl(c.joinUrl)
    setFormScheduled(toLocalInput(c.scheduledAt))
    setFormDuration(String(c.durationMin))
    setFormNotes(c.notes ?? '')
    setFormCourseId(c.course?.id ?? 'none')
    setFormPublished(c.isPublished)
    setDialogOpen(true)
  }

  async function handleSave() {
    const title = formTitle.trim()
    const joinUrl = formJoinUrl.trim()

    if (title.length < 2) {
      toast.error(tx('ক্লাসের শিরোনাম দিন', 'Class title is required'))
      return
    }
    let urlOk = false
    try {
      urlOk = /^https?:\/\//i.test(joinUrl) && Boolean(new URL(joinUrl))
    } catch {
      urlOk = false
    }
    if (!urlOk) {
      toast.error(tx('সঠিক http(s) লিংক দিন', 'Enter a valid http(s) URL'))
      return
    }
    if (!formScheduled) {
      toast.error(tx('সময় নির্বাচন করুন', 'Schedule is required'))
      return
    }
    const duration = Number(formDuration)
    if (!Number.isFinite(duration) || duration < 5 || duration > 600) {
      toast.error(tx('সময়কাল ৫–৬০০ মিনিটের মধ্যে দিন', 'Duration must be 5–600 minutes'))
      return
    }
    const scheduledIso = new Date(formScheduled).toISOString()

    setSaving(true)
    try {
      const body = {
        title,
        provider: formProvider,
        joinUrl,
        scheduledAt: scheduledIso,
        durationMin: Math.round(duration),
        notes: formNotes.trim() || null,
        courseId: formCourseId === 'none' ? null : formCourseId,
        isPublished: formPublished,
      }
      if (editing) {
        await apiPut(`/api/live-classes/${editing.id}`, body)
        toast.success(tx('লাইভ ক্লাস আপডেট হয়েছে', 'Live class updated'))
      } else {
        await apiPost('/api/live-classes', body)
        toast.success(tx('লাইভ ক্লাস তৈরি হয়েছে', 'Live class created'))
      }
      setDialogOpen(false)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সংরক্ষণ ব্যর্থ', 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  async function togglePublished(c: LiveClassRow, next: boolean) {
    setClasses((list) => list.map((x) => (x.id === c.id ? { ...x, isPublished: next } : x)))
    try {
      await apiPut(`/api/live-classes/${c.id}`, { isPublished: next })
      toast.success(
        next
          ? tx('শিক্ষার্থীদের জন্য প্রকাশিত হয়েছে', 'Published for students')
          : tx('আনপাবলিশ করা হয়েছে', 'Unpublished')
      )
    } catch (e) {
      setClasses((list) => list.map((x) => (x.id === c.id ? { ...x, isPublished: !next } : x)))
      toast.error(e instanceof Error ? e.message : tx('পরিবর্তন ব্যর্থ', 'Update failed'))
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiDelete(`/api/live-classes/${deleteTarget.id}`)
      toast.success(tx('লাইভ ক্লাস মুছে ফেলা হয়েছে', 'Live class deleted'))
      setDeleteTarget(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setDeleting(false)
    }
  }

  async function bulkDelete() {
    setBulkDeleting(true)
    try {
      const res = await apiSend<{ deleted: number }>('/api/admin/bulk-delete', 'POST', {
        resource: 'live',
        ids: bulk.selected,
      })
      toast.success(
        tx(
          `${num(res.deleted)} টি লাইভ ক্লাস মুছে ফেলা হয়েছে`,
          `${res.deleted} live class(es) deleted`
        )
      )
      bulk.clear()
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setBulkDeleting(false)
    }
  }

  function copyJoinUrl(url: string) {
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(tx('লিংক কপি হয়েছে', 'Link copied')))
      .catch(() => toast.error(tx('কপি করা যায়নি', 'Copy failed')))
  }

  const renderRow = (c: LiveClassRow, isPast: boolean) => (
    <Card
      key={c.id}
      className={`transition-shadow hover:shadow-md ${isPast ? 'opacity-60' : ''}`}
    >
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <RowBox id={c.id} isSelected={bulk.isSelected} onToggle={bulk.toggle} />
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            isPast ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
          }`}
        >
          <Video className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="cursor-pointer truncate font-semibold" onClick={() => setDetails(c)}>
              {c.title}
            </h3>
            {!c.isPublished && (
              <Badge variant="outline" className="bg-muted text-[10px] text-muted-foreground">
                {tx('খসড়া', 'Draft')}
              </Badge>
            )}
            {isPast && (
              <Badge variant="outline" className="bg-muted text-[10px] text-muted-foreground">
                {tx('শেষ হয়েছে', 'Ended')}
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Badge variant="secondary" className={providerStyle(c.provider)}>
              {providerLabel(c.provider, tx)}
            </Badge>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              {fmtDateTime(c.scheduledAt, lang)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {num(c.durationMin)} {tx('মিনিট', 'min')}
            </span>
            <DateStamp
              iso={(c as { createdAt?: string }).createdAt}
              label={tx('তৈরির তারিখ', 'Created at')}
            />
            {c.course && (
              <span className="inline-flex max-w-[220px] items-center gap-1 truncate">
                <GraduationCap className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{c.course.title}</span>
              </span>
            )}
          </div>
          {c.notes && <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{c.notes}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isPast && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => copyJoinUrl(c.joinUrl)}>
                {tx('লিংক কপি', 'Copy link')}
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => window.open(c.joinUrl, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {tx('জয়েন', 'Join')}
              </Button>
            </>
          )}
          <Switch
            checked={c.isPublished}
            onCheckedChange={(v) => void togglePublished(c, v)}
            aria-label={tx(`${c.title} প্রকাশ`, `Publish ${c.title}`)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={tx('অ্যাকশন', 'Actions')}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => openEdit(c)}>
                <Pencil className="h-4 w-4" />
                {tx('সম্পাদনা', 'Edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => copyJoinUrl(c.joinUrl)}>
                <Globe className="h-4 w-4" />
                {tx('লিংক কপি', 'Copy link')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteTarget(c)}
              >
                <Trash2 className="h-4 w-4" />
                {tx('মুছুন', 'Delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  )

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return <AccessDenied />
  }

  const detailsFields: DetailField[] = details
    ? [
        { label: tx('শিরোনাম', 'Title'), value: details.title },
        {
          label: tx('প্ল্যাটফর্ম', 'Platform'),
          value: providerLabel(details.provider, tx),
        },
        {
          label: tx('জয়েন লিংক', 'Join URL'),
          value: <span className="break-all">{details.joinUrl}</span>,
        },
        {
          label: tx('সময়', 'Scheduled at'),
          value: fmtDateTime(details.scheduledAt, lang),
        },
        {
          label: tx('তৈরির সময়', 'Created at'),
          value: fmtStampText((details as { createdAt?: string }).createdAt),
        },
        {
          label: tx('সময়কাল (মিনিট)', 'Duration (min)'),
          value: `${num(details.durationMin)} ${tx('মিনিট', 'min')}`,
        },
        ...(details.course?.title
          ? [{ label: tx('কোর্স', 'Course'), value: details.course.title }]
          : []),
        {
          label: tx('প্রকাশিত', 'Published'),
          value: details.isPublished ? tx('হ্যাঁ', 'Yes') : tx('না', 'No'),
        },
        ...(details.notes ? [{ label: tx('নোট', 'Notes'), value: details.notes }] : []),
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{tx('লাইভ ক্লাস ম্যানেজার', 'Live Class Manager')}</h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'জুম/মিট ক্লাস শিডিউল করুন ও শিক্ষার্থীদের সাথে শেয়ার করুন',
              'Schedule Zoom/Meet classes and share them with students'
            )}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          {tx('নতুন লাইভ ক্লাস', 'New live class')}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={<Video className="h-7 w-7" />}
          title={tx('কোনো লাইভ ক্লাস নেই', 'No live classes yet')}
          description={tx(
            'প্রথম লাইভ ক্লাস শিডিউল করে লিংক শেয়ার করুন।',
            'Schedule your first live class and share the link.'
          )}
          actionLabel={tx('নতুন লাইভ ক্লাস', 'New live class')}
          onAction={openCreate}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {sorted.upcoming.length > 0 && (
            <section className="space-y-3" aria-label={tx('আসন্ন ক্লাস', 'Upcoming classes')}>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
                {tx('আসন্ন', 'Upcoming')}
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  {num(sorted.upcoming.length)}
                </Badge>
              </h2>
              {sorted.upcoming.map((c) => renderRow(c, false))}
            </section>
          )}
          {sorted.past.length > 0 && (
            <section className="space-y-3" aria-label={tx('হয়ে গেছে', 'Past classes')}>
              <h2 className="text-sm font-semibold text-muted-foreground">
                {tx('হয়ে গেছে', 'Past')}
                <Badge variant="secondary" className="ml-2">
                  {num(sorted.past.length)}
                </Badge>
              </h2>
              {sorted.past.map((c) => renderRow(c, true))}
            </section>
          )}
        </motion.div>
      )}

      {/* ── Create / Edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? tx('লাইভ ক্লাস সম্পাদনা', 'Edit live class') : tx('নতুন লাইভ ক্লাস', 'New live class')}
            </DialogTitle>
            <DialogDescription>
              {tx(
                'প্ল্যাটফর্ম, লিংক ও সময় দিন — শিক্ষার্থীরা ড্যাশবোর্ডে দেখতে পাবে।',
                'Set the platform, link and time — students see it on their dashboard.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="lc-title">
                {tx('শিরোনাম', 'Title')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lc-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={tx('যেমন: ফিজিক্স উইকলি লাইভ সলভ', 'e.g. Physics weekly live solve')}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{tx('প্ল্যাটফর্ম', 'Platform')}</Label>
              <Select
                value={formProvider}
                onValueChange={(v) => setFormProvider(v as 'ZOOM' | 'MEET' | 'CUSTOM')}
              >
                <SelectTrigger className="w-full" aria-label={tx('প্ল্যাটফর্ম', 'Platform')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZOOM">Zoom</SelectItem>
                  <SelectItem value="MEET">{tx('গুগল মিট', 'Google Meet')}</SelectItem>
                  <SelectItem value="CUSTOM">{tx('কাস্টম লিংক', 'Custom link')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lc-url">
                {tx('জয়েন লিংক', 'Join URL')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lc-url"
                value={formJoinUrl}
                onChange={(e) => setFormJoinUrl(e.target.value)}
                placeholder="https://zoom.us/j/..."
                type="url"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="lc-at">
                  {tx('সময়', 'Scheduled at')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="lc-at"
                  type="datetime-local"
                  value={formScheduled}
                  onChange={(e) => setFormScheduled(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lc-dur">{tx('সময়কাল (মিনিট)', 'Duration (min)')}</Label>
                <Input
                  id="lc-dur"
                  type="number"
                  min="5"
                  max="600"
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>{tx('কোর্স (ঐচ্ছিক)', 'Course (optional)')}</Label>
              <Select value={formCourseId} onValueChange={setFormCourseId}>
                <SelectTrigger className="w-full" aria-label={tx('কোর্স', 'Course')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tx('কোনো কোর্স নয়', 'No course')}</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lc-notes">{tx('নোট', 'Notes')}</Label>
              <Textarea
                id="lc-notes"
                rows={2}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder={tx('যেমন: ৪ অধ্যায়ের অসাধিত প্রশ্ন আলোচনা', 'e.g. discussion on chapter 4 exercises')}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">{tx('প্রকাশিত', 'Published')}</p>
                <p className="text-xs text-muted-foreground">
                  {tx('প্রকাশ করলে শিক্ষার্থীরা দেখতে পাবে', 'Students only see published classes')}
                </p>
              </div>
              <Switch
                checked={formPublished}
                onCheckedChange={setFormPublished}
                aria-label={tx('প্রকাশিত', 'Published')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {tx('বাতিল', 'Cancel')}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? tx('আপডেট করুন', 'Update') : tx('তৈরি করুন', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('লাইভ ক্লাস মুছে ফেলবেন?', 'Delete this live class?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `"${deleteTarget?.title ?? ''}" স্থায়ীভাবে মুছে যাবে — এটি আর শিক্ষার্থীদের ড্যাশবোর্ডে দেখা যাবে না।`,
                `"${deleteTarget?.title ?? ''}" will be permanently removed — students will no longer see it.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{tx('বাতিল', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {tx('মুছুন', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Live class details dialog ── */}
      <DetailsDialog
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        title={details?.title ?? ''}
        subtitle={tx('লাইভ ক্লাস বিবরণ', 'Live class details')}
        fields={detailsFields}
      />

      {/* ── Bulk selection bar ── */}
      <BulkBar
        count={bulk.count}
        deleting={bulkDeleting}
        onDelete={() => void bulkDelete()}
        onClear={bulk.clear}
      />
    </div>
  )
}

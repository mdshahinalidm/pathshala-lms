'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  BellPlus,
  Loader2,
  Megaphone,
  Pencil,
  ShieldX,
  Trash2,
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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
  BulkBar,
  DetailsDialog,
  RowBox,
  SelectAll,
  useBulkSelection,
} from '@/components/admin/data-tools'
import { EmptyState } from '@/components/shared/empty-state'
import { ImageUpload } from '@/components/admin/image-upload'
import { apiDelete, apiGet, apiPost, apiPut, apiSend } from '@/lib/api-client'
import { uploadFileXhr } from '@/lib/upload-client'
import { DateStamp } from '@/components/admin/date-stamp'
import { fmtStampText, noticeTypeStyle } from '@/lib/format'
import { useAuth } from '@/store/auth-store'
import { isPanelRole } from '@/lib/roles'
import { go, useUI } from '@/store/ui-store'
import { useHashRoute } from '@/hooks/use-hash-route'

interface Notice {
  id: string
  title: string
  body: string
  type: string
  isBanner: boolean
  imageUrl?: string | null
  pdfUrl?: string | null
  pdfName?: string | null
  createdAt: string
}

const NOTICE_TYPES = ['URGENT', 'GENERAL', 'EVENT'] as const
type NoticeType = (typeof NOTICE_TYPES)[number]

function typeLabel(type: string, t: (k: string) => string): string {
  if (type === 'URGENT') return t('urgent')
  if (type === 'EVENT') return t('event')
  return t('general')
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

export default function AdminNoticesView() {
  const { user, status, initialized } = useAuth()
  const { t, tx, lang } = useUI()

  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState<NoticeType>('GENERAL')
  const [isBanner, setIsBanner] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfName, setPdfName] = useState('')
  const [pdfUploading, setPdfUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Notice | null>(null)

  // Bulk selection + row details (shared admin data-tools)
  const bulk = useBulkSelection()
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [details, setDetails] = useState<Notice | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<Notice[]>('/api/notices')
      setNotices(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setEditingId(null)
    setTitle('')
    setBody('')
    setType('GENERAL')
    setIsBanner(false)
    setImageUrl('')
    setPdfUrl('')
    setPdfName('')
    setDialogOpen(true)
  }

  const route = useHashRoute()
  // /admin/notices?new=1 (header quick action) → open the create dialog once, then clean the URL
  useEffect(() => {
    if (route.query.get('new') !== '1') return
    const timer = setTimeout(() => {
      openCreate()
      go('#/admin/notices')
    }, 60)
    return () => clearTimeout(timer)
     
  }, [route.query])

  function openEdit(n: Notice) {
    setEditingId(n.id)
    setTitle(n.title)
    setBody(n.body)
    setType((NOTICE_TYPES.includes(n.type as NoticeType) ? n.type : 'GENERAL') as NoticeType)
    setIsBanner(n.isBanner)
    setImageUrl(n.imageUrl ?? '')
    setPdfUrl(n.pdfUrl ?? '')
    setPdfName(n.pdfName ?? '')
    setDialogOpen(true)
  }

  /** Upload the notice PDF through the official streaming pipeline. */
  async function handlePdfUpload(file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error(tx('শুধুমাত্র PDF ফাইল আপলোড করা যাবে।', 'Only PDF files can be uploaded.'))
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error(tx('PDF সাইজ ১০০MB-এর কম হতে হবে।', 'PDF must be under 100MB.'))
      return
    }
    setPdfUploading(true)
    try {
      const res = await uploadFileXhr(file, { kind: 'pdf' })
      setPdfUrl(res.url)
      setPdfName(res.originalName || res.filename)
      toast.success(tx('PDF আপলোড হয়েছে ✓', 'PDF uploaded ✓'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপলোড ব্যর্থ', 'Upload failed'))
    } finally {
      setPdfUploading(false)
    }
  }

  async function handleSave() {
    if (!title.trim() || !body.trim()) {
      toast.error(tx('শিরোনাম ও বিবরণ আবশ্যক', 'Title and body are required'))
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        type,
        isBanner,
        imageUrl: imageUrl.trim() || null,
        pdfUrl: pdfUrl.trim() || null,
        pdfName: pdfName.trim() || null,
      }
      if (editingId) {
        await apiPut(`/api/notices/${editingId}`, payload)
        toast.success(tx('নোটিশ আপডেট হয়েছে', 'Notice updated'))
      } else {
        await apiPost('/api/notices', payload)
        toast.success(
          tx(
            'নোটিশ প্রকাশিত হয়েছে — সব শিক্ষার্থীকে নোটিফিকেশন পাঠানো হয়েছে',
            'Notice published — notifications sent to all students'
          )
        )
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

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await apiDelete(`/api/notices/${deleteTarget.id}`)
      toast.success(tx('নোটিশ মুছে ফেলা হয়েছে', 'Notice deleted'))
      setDeleteTarget(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    }
  }

  async function bulkDelete() {
    if (bulk.selected.length === 0) return
    setBulkDeleting(true)
    try {
      const r = await apiSend<{ deleted: number }>('/api/admin/bulk-delete', 'POST', {
        resource: 'notices',
        ids: bulk.selected,
      })
      toast.success(tx(`${r.deleted} টি নোটিশ মুছে ফেলা হয়েছে`, `${r.deleted} notice(s) deleted`))
      bulk.clear()
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setBulkDeleting(false)
    }
  }

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return <AccessDenied />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{t('admin_notices')}</h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'নোটিশ প্রকাশ করলে সব শিক্ষার্থী নোটিফিকেশন পাবে',
              'Publishing a notice notifies all students'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {notices.length > 0 && (
            <span className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium">
              <SelectAll
                ids={notices.map((n) => n.id)}
                isSelected={bulk.isSelected}
                onToggleAll={bulk.toggleAll}
              />
              {tx('সব নির্বাচন', 'Select all')}
            </span>
          )}
          <Button className="gap-2" onClick={openCreate}>
            <BellPlus className="h-4 w-4" /> {tx('নতুন নোটিশ', 'New notice')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : notices.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-7 w-7" />}
          title={tx('কোনো নোটিশ নেই', 'No notices yet')}
          description={tx(
            'শিক্ষার্থীদের জন্য প্রথম নোটিশটি প্রকাশ করুন।',
            'Publish your first notice for students.'
          )}
          actionLabel={tx('নতুন নোটিশ', 'New notice')}
          onAction={openCreate}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid gap-4 md:grid-cols-2"
        >
          {notices.map((n) => (
            <Card key={n.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <RowBox id={n.id} isSelected={bulk.isSelected} onToggle={bulk.toggle} />
                  <Badge className={noticeTypeStyle(n.type)}>{typeLabel(n.type, t)}</Badge>
                  {n.isBanner && (
                    <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      <Megaphone className="h-3 w-3" /> {tx('ব্যানার', 'Banner')}
                    </span>
                  )}
                  <DateStamp iso={n.createdAt} className="ml-auto text-right" />
                </div>
                <div className="flex items-start gap-3">
                  {n.imageUrl && (
                    <img
                      src={n.imageUrl}
                      alt={n.title}
                      className="h-12 w-12 shrink-0 rounded-lg border object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <h3
                      className="cursor-pointer truncate text-sm font-semibold"
                      onClick={() => setDetails(n)}
                    >
                      {n.title}
                    </h3>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(n)}
                    aria-label={t('edit')}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(n)}
                    aria-label={t('delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {/* ── Create/Edit dialog ── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) setEditingId(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? tx('নোটিশ সম্পাদনা', 'Edit notice') : tx('নতুন নোটিশ', 'New notice')}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? tx('নোটিশের তথ্য হালনাগাদ করুন।', 'Update the notice details.')
                : tx(
                    'প্রকাশের সাথে সাথে সব শিক্ষার্থী নোটিফিকেশন পাবে।',
                    'All students will be notified immediately on publish.'
                  )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>
                {tx('শিরোনাম', 'Title')} <span className="text-destructive">*</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tx('যেমন: ঈদ উপলক্ষে ছুটির নোটিশ', 'e.g. Holiday notice for Eid')}
              />
            </div>
            <div className="grid gap-2">
              <Label>
                {tx('বিবরণ', 'Body')} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={tx('নোটিশের বিস্তারিত লিখুন', 'Write the notice details')}
              />
            </div>
            <div className="grid gap-2">
              <Label>{tx('ধরন', 'Type')}</Label>
              <Select value={type} onValueChange={(v) => setType(v as NoticeType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTICE_TYPES.map((nt) => (
                    <SelectItem key={nt} value={nt}>
                      {typeLabel(nt, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{tx('সংযুক্ত ছবি (ঐচ্ছিক)', 'Attached image (optional)')}</Label>
              <ImageUpload value={imageUrl} onChange={setImageUrl} />
            </div>
            {/* PDF attachment (upload through the secure pipeline) */}
            <div className="grid gap-2">
              <Label>{tx('সংযুক্ত PDF (ঐচ্ছিক)', 'Attached PDF (optional)')}</Label>
              {pdfUrl ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <PdfFileIcon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{pdfName || pdfUrl}</span>
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => {
                      setPdfUrl('')
                      setPdfName('')
                    }}
                    aria-label={tx('সরান', 'Remove')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div>
                  <Input
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={pdfUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void handlePdfUpload(f)
                      e.target.value = ''
                    }}
                  />
                  {pdfUploading && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {tx('আপলোড হচ্ছে…', 'Uploading…')}
                    </p>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {tx(
                  'নোটিশ পেজে PDF ভিউয়ার ও ডাউনলোড বাটন দেখানো হবে।',
                  'The notice page will show a PDF viewer and download button.'
                )}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Switch checked={isBanner} onCheckedChange={setIsBanner} />
                <Megaphone className="h-4 w-4 text-primary" />
                {tx('ব্যানার নোটিশ', 'Banner notice')}
              </label>
              <p className="mt-1 pl-10 text-xs text-muted-foreground">
                {tx('হোম পেজ মার্কিতে দেখাবে', 'Will appear in the homepage marquee')}
              </p>
            </div>
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

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('নোটিশ মুছে ফেলবেন?', 'Delete this notice?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `"${deleteTarget?.title ?? ''}" স্থায়ীভাবে মুছে যাবে।`,
                `"${deleteTarget?.title ?? ''}" will be permanently deleted.`
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

      {/* ── Row details dialog ── */}
      <DetailsDialog
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        title={details?.title ?? ''}
        fields={
          details
            ? [
                { label: tx('শিরোনাম', 'Title'), value: details.title },
                {
                  label: tx('বিবরণ', 'Body'),
                  value:
                    details.body.length > 200
                      ? `${details.body.slice(0, 200)}…`
                      : details.body,
                },
                { label: tx('ধরন', 'Type'), value: typeLabel(details.type, t) },
                {
                  label: tx('ব্যানার', 'Banner'),
                  value: details.isBanner ? tx('হ্যাঁ', 'Yes') : tx('না', 'No'),
                },
                {
                  label: tx('তৈরির সময়', 'Created at'),
                  value: fmtStampText(details.createdAt),
                },
              ]
            : []
        }
        actions={
          details ? (
            <>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  if (!details) return
                  const n = details
                  setDetails(null)
                  openEdit(n)
                }}
              >
                <Pencil className="h-4 w-4" />
                {tx('সম্পাদনা', 'Edit')}
              </Button>
              <Button
                variant="destructive"
                className="gap-1.5"
                onClick={() => {
                  if (!details) return
                  const n = details
                  setDetails(null)
                  setDeleteTarget(n)
                }}
              >
                <Trash2 className="h-4 w-4" />
                {tx('মুছুন', 'Delete')}
              </Button>
            </>
          ) : undefined
        }
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

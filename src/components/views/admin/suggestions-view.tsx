'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Info,
  Loader2,
  Paperclip,
  Pencil,
  ShieldX,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { PdfFileIcon } from '@/components/shared/pdf-file-icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { EmptyState } from '@/components/shared/empty-state'
import {
  BulkBar,
  DetailsDialog,
  RowBox,
  ScrollX,
  SelectAll,
  useBulkSelection,
  type DetailField,
} from '@/components/admin/data-tools'
import { apiDelete, apiGet, apiPost, apiPut, apiSend } from '@/lib/api-client'
import { digitsBn, fmtBDT, fmtDate, fmtStampText } from '@/lib/format'
import { DateStamp } from '@/components/admin/date-stamp'
import { useAuth } from '@/store/auth-store'
import { go, useUI } from '@/store/ui-store'
import { isPanelRole, isOwner } from '@/lib/roles'

interface Suggestion {
  id: string
  title: string
  description?: string | null
  category: string
  isFree: boolean
  price?: number | null
  fileName?: string | null
  fileType?: string | null
  fileSize?: number | null
  downloads: number
  hasFile: boolean
  createdAt: string
}

interface FileMeta {
  name: string
  type: string
  size: number
  data: string
}

const CATEGORIES: { value: string; bn: string; en: string }[] = [
  { value: 'SSC', bn: 'এসএসসি', en: 'SSC' },
  { value: 'HSC', bn: 'এইচএসসি', en: 'HSC' },
  { value: 'ADMISSION', bn: 'ভর্তি পরীক্ষা', en: 'Admission' },
  { value: 'BCS', bn: 'বিসিএস', en: 'BCS' },
  { value: 'IELTS', bn: 'IELTS', en: 'IELTS' },
  { value: 'SKILL', bn: 'স্কিল ডেভেলপমেন্ট', en: 'Skill' },
]

interface SuggestionCategoryOpt {
  id: string
  name: string
  nameBn: string | null
}

const MAX_FILE_BYTES = 4 * 1024 * 1024

function categoryLabel(value: string, lang: 'bn' | 'en', extra?: SuggestionCategoryOpt[]): string {
  const fromDb = extra?.find((c) => c.name === value)
  if (fromDb) return (lang === 'bn' && fromDb.nameBn?.trim()) || fromDb.name
  const cat = CATEGORIES.find((c) => c.value === value)
  if (!cat) return value
  return lang === 'bn' ? cat.bn : cat.en
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

function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return '—'
  return `${digitsBn(Math.max(1, Math.round(bytes / 1024)))} KB`
}

export default function AdminSuggestionsView() {
  const { user, status, initialized } = useAuth()
  const { t, tx, lang } = useUI()

  const [items, setItems] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  // Categories created in Admin → সাজেশনস → ক্যাটাগরি (fallback: built-in list)
  const [categoryOptions, setCategoryOptions] = useState<SuggestionCategoryOpt[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('SSC')
  const [isFree, setIsFree] = useState(true)
  const [price, setPrice] = useState('')
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null)
  const [fileUrl, setFileUrl] = useState('')
  // File already stored on the server for the material being edited
  // (edit keeps it unless a new file/URL replaces it).
  const [existingFile, setExistingFile] = useState<{ name: string; size: number | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Suggestion | null>(null)
  const bulk = useBulkSelection()
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [details, setDetails] = useState<Suggestion | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<Suggestion[]>('/api/suggestions')
      setItems(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    apiGet<SuggestionCategoryOpt[]>('/api/admin/suggestion-categories')
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          setCategoryOptions(list)
          setCategory((prev) => (list.some((c) => c.name === prev) ? prev : list[0].name))
        }
      })
      .catch(() => {
        /* built-in fallback list stays */
      })
  }, [load])

  function resetForm() {
    setTitle('')
    setDescription('')
    setCategory('SSC')
    setIsFree(true)
    setPrice('')
    setFileMeta(null)
    setFileUrl('')
    setExistingFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function openCreate() {
    resetForm()
    setEditingId(null)
    setDialogOpen(true)
  }

  /** Edit prefill — list row first, then authoritative detail (fileUrl). */
  async function openEdit(s: Suggestion) {
    setEditingId(s.id)
    setTitle(s.title)
    setDescription(s.description ?? '')
    setCategory(s.category)
    setIsFree(s.isFree)
    setPrice(s.isFree || s.price == null ? '' : String(s.price))
    setFileMeta(null)
    setFileUrl('')
    setExistingFile(s.hasFile || s.fileName ? { name: s.fileName ?? '', size: s.fileSize ?? null } : null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setDialogOpen(true)
    try {
      const d = await apiGet<{
        title: string
        description: string | null
        category: string
        isFree: boolean
        price: number | null
        fileName: string | null
        fileSize: number | null
        fileUrl: string | null
        hasFile: boolean
      }>(`/api/suggestions/${s.id}`)
      setTitle(d.title)
      setDescription(d.description ?? '')
      setCategory(d.category)
      setIsFree(d.isFree)
      setPrice(d.isFree || d.price == null ? '' : String(d.price))
      setFileUrl(d.fileUrl ?? '')
      setExistingFile(d.hasFile ? { name: d.fileName ?? '', size: d.fileSize ?? null } : null)
    } catch {
      /* list-row prefill is good enough — save still works */
    }
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_FILE_BYTES) {
      toast.error(tx('ফাইল সাইজ ৪MB এর কম হতে হবে', 'File must be smaller than 4MB'))
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const base64 = result.includes(',') ? result.split(',')[1] : result
      setFileMeta({
        name: f.name,
        type: f.type || f.name.split('.').pop() || 'application/octet-stream',
        size: f.size,
        data: base64,
      })
    }
    reader.onerror = () => {
      toast.error(tx('ফাইল পড়া যায়নি', 'Could not read file'))
    }
    reader.readAsDataURL(f)
  }

  function clearFile() {
    setFileMeta(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error(tx('শিরোনাম আবশ্যক', 'Title is required'))
      return
    }
    // New materials need a file (upload or URL). Edits may keep the stored one.
    if (!editingId && !fileMeta && !fileUrl.trim()) {
      toast.error(
        tx('ফাইল আপলোড করুন অথবা URL দিন', 'Upload a file or provide a URL')
      )
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await apiPut(`/api/suggestions/${editingId}`, {
          title: title.trim(),
          description: description.trim() || null,
          category,
          isFree,
          price: isFree ? null : price === '' ? null : Number(price),
          fileName: fileMeta?.name ?? null,
          fileType: fileMeta?.type ?? null,
          fileSize: fileMeta?.size ?? null,
          fileData: fileMeta?.data ?? null,
          fileUrl: fileUrl.trim() || null,
        })
        toast.success(tx('সাজেশন আপডেট হয়েছে', 'Suggestion updated'))
      } else {
        await apiPost('/api/suggestions', {
          title: title.trim(),
          description: description.trim() || null,
          category,
          isFree,
          price: isFree ? null : price === '' ? null : Number(price),
          fileName: fileMeta?.name ?? null,
          fileType: fileMeta?.type ?? null,
          fileSize: fileMeta?.size ?? null,
          fileData: fileMeta?.data ?? null,
          fileUrl: fileUrl.trim() || null,
        })
        toast.success(tx('সাজেশন আপলোড হয়েছে', 'Suggestion uploaded'))
      }
      setDialogOpen(false)
      setEditingId(null)
      resetForm()
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
      await apiDelete(`/api/suggestions/${deleteTarget.id}`)
      toast.success(tx('মুছে ফেলা হয়েছে', 'Deleted'))
      setDeleteTarget(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    }
  }

  async function bulkDelete() {
    setBulkDeleting(true)
    try {
      const res = await apiSend<{ deleted: number }>('/api/admin/bulk-delete', 'POST', {
        resource: 'suggestions',
        ids: bulk.selected,
      })
      toast.success(
        tx(`${digitsBn(res.deleted)} টি সাজেশন মুছে ফেলা হয়েছে`, `${res.deleted} suggestion(s) deleted`)
      )
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

  const detailsFields: DetailField[] = details
    ? [
        { label: t('description'), value: details.description || undefined },
        { label: t('filter_category'), value: categoryLabel(details.category, lang, categoryOptions) },
        {
          label: tx('ধরন', 'Type'),
          value: details.isFree ? t('free') : t('paid'),
        },
        ...(details.isFree
          ? []
          : [{ label: tx('মূল্য', 'Price'), value: fmtBDT(details.price ?? 0) }]),
        ...(details.fileName
          ? [{ label: tx('ফাইলের নাম', 'File name'), value: details.fileName }]
          : []),
        ...(details.fileType
          ? [{ label: tx('ফাইলের ধরন', 'File type'), value: details.fileType }]
          : []),
        ...(details.fileSize
          ? [{ label: tx('ফাইল সাইজ', 'File size'), value: fmtSize(details.fileSize) }]
          : []),
        { label: t('download'), value: digitsBn(details.downloads) },
        { label: t('date'), value: fmtStampText(details.createdAt) },
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{t('admin_suggestions')}</h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'সাজেশন PDF ও স্টাডি রিসোর্স আপলোড ও ব্যবস্থাপনা',
              'Upload and manage suggestion PDFs and study suggestions'
            )}
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Upload className="h-4 w-4" /> {t('upload')}
        </Button>
      </div>

      <Alert className="border-primary/20 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          {tx(
            '৪MB পর্যন্ত ফাইল সরাসরি আপলোড হয়; বড় ফাইলের জন্য URL দিন।',
            'Files up to 4MB are uploaded directly; provide a URL for larger files.'
          )}
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<PdfFileIcon className="h-8 w-8" />}
          title={tx('কোনো সাজেশন নেই', 'No suggestions yet')}
          description={tx(
            'সাজেশন বা রিসোর্স আপলোড করে শিক্ষার্থীদের সাথে শেয়ার করুন।',
            'Upload suggestions or resources and share them with students.'
          )}
          actionLabel={t('upload')}
          onAction={openCreate}
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <SelectAll
                        ids={items.map((s) => s.id)}
                        isSelected={bulk.isSelected}
                        onToggleAll={bulk.toggleAll}
                      />
                    </TableHead>
                    <TableHead className="min-w-[220px]">{tx('শিরোনাম', 'Title')}</TableHead>
                    <TableHead>{t('filter_category')}</TableHead>
                    <TableHead>{tx('ধরন', 'Type')}</TableHead>
                    <TableHead>{tx('ফাইল', 'File')}</TableHead>
                    <TableHead>{t('download')}</TableHead>
                    <TableHead>{t('date')}</TableHead>
                    <TableHead className="text-right">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      onClick={() => setDetails(s)}
                    >
                      <TableCell>
                        <RowBox id={s.id} isSelected={bulk.isSelected} onToggle={bulk.toggle} />
                      </TableCell>
                      <TableCell>
                        <p
                          className="max-w-[260px] cursor-pointer truncate text-sm font-semibold"
                          onClick={() => setDetails(s)}
                        >
                          {s.title}
                        </p>
                        {s.description && (
                          <p className="max-w-[260px] truncate text-xs text-muted-foreground">
                            {s.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{categoryLabel(s.category, lang, categoryOptions)}</Badge>
                      </TableCell>
                      <TableCell>
                        {s.isFree ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            {t('free')}
                          </Badge>
                        ) : (
                          <div>
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              {t('paid')}
                            </Badge>
                            <div className="mt-1 text-xs font-semibold">
                              {fmtBDT(s.price ?? 0)}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {s.hasFile || s.fileName ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            <PdfFileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="max-w-[160px] truncate">{s.fileName || '—'}</span>
                            <span className="text-muted-foreground">· {fmtSize(s.fileSize)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">URL</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{digitsBn(s.downloads)}</TableCell>
                      <TableCell>
                        <DateStamp iso={s.createdAt} label={tx('তৈরির তারিখ', 'Created at')} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation()
                              void openEdit(s)
                            }}
                            aria-label={t('edit')}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteTarget(s)
                            }}
                            aria-label={t('delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </ScrollX>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Create/Edit dialog ── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) {
            setEditingId(null)
            resetForm()
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? tx('সাজেশন সম্পাদনা', 'Edit suggestion')
                : tx('সাজেশন আপলোড', 'Upload suggestion')}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? tx(
                    'তথ্য পরিবর্তন করুন — চাইলে ফাইলও নতুন করে দিতে পারেন।',
                    'Update the details — optionally replace the file too.'
                  )
                : tx(
                    'সাজেশন/রিসোর্স ফাইল বা লিংক যোগ করুন।',
                    'Add a suggestion/resource file or link.'
                  )}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-2">
            <div className="grid gap-2">
              <Label>
                {tx('শিরোনাম', 'Title')} <span className="text-destructive">*</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tx('যেমন: এসএসসি পদার্থবিজ্ঞান সাজেশন ২০২৫', 'e.g. SSC Physics Suggestion 2025')}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('description')}</Label>
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tx('সংক্ষিপ্ত বিবরণ', 'Short description')}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t('filter_category')}</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      // Built-in or admin-created categories; legacy values
                      // already on a material (GENERAL/JOB/…) stay visible
                      // while editing even when missing from the list.
                      const opts =
                        categoryOptions.length > 0
                          ? categoryOptions.map((c) => ({
                              value: c.name,
                              label: (lang === 'bn' && c.nameBn?.trim()) || c.name,
                            }))
                          : CATEGORIES.map((c) => ({
                              value: c.value,
                              label: lang === 'bn' ? c.bn : c.en,
                            }))
                      return opts.some((o) => o.value === category)
                        ? opts
                        : [{ value: category, label: category }, ...opts]
                    })().map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{tx('মূল্য (৳)', 'Price (BDT)')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={price}
                  disabled={isFree}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={isFree ? t('free') : '100'}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch checked={isFree} onCheckedChange={setIsFree} />
              {tx('ফ্রি ডাউনলোড', 'Free download')}
            </label>

            <div className="grid gap-2">
              <Label>
                {editingId
                  ? tx('নতুন ফাইল দিয়ে বদলান (ঐচ্ছিক)', 'Replace with a new file (optional)')
                  : tx('ফাইল (সর্বোচ্চ ৪MB)', 'File (max 4MB)')}
              </Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.png"
                onChange={onFilePicked}
              />
              {/* Stored file while editing — kept unless replaced below */}
              {editingId && existingFile && !fileMeta && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
                  <PdfFileIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate font-medium">{existingFile.name || tx('সংরক্ষিত ফাইল', 'Stored file')}</span>
                  {existingFile.size ? <span className="text-muted-foreground">· {fmtSize(existingFile.size)}</span> : null}
                  <span className="ml-auto shrink-0 text-emerald-700 dark:text-emerald-400">{tx('রাখা হবে', 'kept')}</span>
                </div>
              )}
              {fileMeta && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
                  {/\.pdf$/i.test(fileMeta.name) || fileMeta.type === 'application/pdf' ? (
                    <PdfFileIcon className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate font-medium">{fileMeta.name}</span>
                  <span className="text-muted-foreground">· {fmtSize(fileMeta.size)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-6 w-6"
                    onClick={clearFile}
                    aria-label={t('cancel')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label>{tx('অথবা ফাইল URL', 'Or file URL')}</Label>
              <Input
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                placeholder="https://..."
              />
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
            <AlertDialogTitle>{tx('মুছে ফেলবেন?', 'Delete this?')}</AlertDialogTitle>
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

      {/* ── Material details dialog ── */}
      <DetailsDialog
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        title={details?.title ?? ''}
        subtitle={tx('সাজেশন বিবরণ', 'Suggestion details')}
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

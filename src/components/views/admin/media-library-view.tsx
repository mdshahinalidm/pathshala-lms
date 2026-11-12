'use client'

/**
 * AdminMediaLibraryView — Media Library 2.0 (strong DB-backed).
 * Every upload (thumbnail / lesson video / PDF / notice image) is stored on
 * disk AND registered in the MediaAsset table. Features:
 *  - multi-file upload (ANY format) with live progress
 *  - kind filter (All/Images/Videos/PDF) + search
 *  - usage: copy URL, open, pick (standalone management page)
 *  - select-many → bulk delete (files + DB rows), or delete one
 *  - storage stats per kind
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  Check,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Film,
  HardDrive,
  ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  ShieldX,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { PdfFileIcon } from '@/components/shared/pdf-file-icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { useBulkSelection, BulkBar } from '@/components/admin/data-tools'
import { go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { useUI } from '@/store/ui-store'
import { apiGet, apiSend } from '@/lib/api-client'
import { fmtBytes, uploadFileXhr } from '@/lib/upload-client'
import { digitsBn } from '@/lib/format'
import type { MediaAssetRow } from '@/components/admin/media-library-picker'
import { isPanelRole } from '@/lib/roles'

interface MediaResponse {
  assets: MediaAssetRow[]
  total: number
  page: number
  pages: number
  byKind: Record<string, { count: number; bytes: number }>
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
        <Button className="mt-2" onClick={() => go('#/login')}>
          {tx('লগইন করুন', 'Go to login')}
        </Button>
      </CardContent>
    </Card>
  )
}

export default function AdminMediaLibraryView() {
  const { tx, lang } = useUI()
  const { user, initialized, status } = useAuth()
  const [data, setData] = useState<MediaResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'ALL' | 'IMAGE' | 'VIDEO' | 'PDF'>('ALL')
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pct, setPct] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const bulk = useBulkSelection()

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '60' })
      if (filter !== 'ALL') params.set('kind', filter)
      if (qDebounced) params.set('q', qDebounced)
      const res = await apiGet<MediaResponse>(`/api/admin/media?${params}`)
      setData(res)
    } catch {
      toast.error(tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [filter, qDebounced, tx])

  useEffect(() => {
    void load()
  }, [load])

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setPct(0)
    try {
      let done = 0
      for (const f of Array.from(files)) {
        await uploadFileXhr(f, {
          kind: filter === 'ALL' ? undefined : filter.toLowerCase(),
          onProgress: (p) => setPct(Math.round(((done + p / 100) / files.length) * 100)),
        })
        done += 1
      }
      toast.success(tx(`${done} টি ফাইল আপলোড হয়েছে ✓`, `${done} file(s) uploaded ✓`))
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপলোড ব্যর্থ', 'Upload failed'))
    } finally {
      setUploading(false)
      setPct(0)
    }
  }

  async function removeMany(ids: string[]) {
    setDeleting(true)
    try {
      const res = await apiSend<{ deleted: number }>('/api/admin/media', 'DELETE', { ids })
      toast.success(tx(`${res.deleted} টি মুছে ফেলা হয়েছে`, `${res.deleted} deleted`))
      bulk.clear()
      await load()
    } catch {
      toast.error(tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setDeleting(false)
      setConfirmIds(null)
    }
  }

  function copyUrl(a: MediaAssetRow) {
    void navigator.clipboard.writeText(a.url).then(() => {
      setCopiedId(a.id)
      toast.success(tx('লিংক কপি হয়েছে', 'URL copied'))
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return <AccessDenied />
  }

  const assets = data?.assets ?? []
  const totalBytes = data ? Object.values(data.byKind).reduce((s, k) => s + k.bytes, 0) : 0
  const bn = lang === 'bn'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{tx('মিডিয়া লাইব্রেরি', 'Media Library')}</h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'সব ছবি, ভিডিও ও PDF — ডিস্ক + ডেটাবেজ দুই জায়গায় নিরাপদে সংরক্ষিত।',
              'All images, videos and PDFs — safely persisted on disk + database.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> {tx('রিফ্রেশ', 'Refresh')}
          </Button>
          <Button size="sm" className="gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {uploading ? `${tx('আপলোড হচ্ছে', 'Uploading')} ${pct}%` : tx('আপলোড করুন', 'Upload')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,video/*,.mkv,.avi,.wmv,.flv,.3gp,.mpg,.mpeg,.ts,.vob,.mxf,.rm,.rmvb,.asf,.divx,.f4v,application/pdf"
            onChange={(e) => {
              void upload(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center gap-3 rounded-2xl border bg-gradient-to-r from-emerald-500/12 to-transparent p-4">
          <span className="grad-emerald flex h-10 w-10 items-center justify-center rounded-xl text-white"><Database className="h-5 w-5" /></span>
          <div>
            <p className="text-xs text-muted-foreground">{tx('মোট ফাইল', 'Total files')}</p>
            <p className="text-lg font-bold">{digitsBn(data?.total ?? 0)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border bg-gradient-to-r from-violet-500/12 to-transparent p-4">
          <span className="grad-violet flex h-10 w-10 items-center justify-center rounded-xl text-white"><ImageIcon className="h-5 w-5" /></span>
          <div>
            <p className="text-xs text-muted-foreground">{tx('ছবি', 'Images')}</p>
            <p className="text-lg font-bold">{digitsBn(data?.byKind.IMAGE?.count ?? 0)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border bg-gradient-to-r from-rose-500/12 to-transparent p-4">
          <span className="grad-rose flex h-10 w-10 items-center justify-center rounded-xl text-white"><Film className="h-5 w-5" /></span>
          <div>
            <p className="text-xs text-muted-foreground">{tx('ভিডিও', 'Videos')}</p>
            <p className="text-lg font-bold">{digitsBn(data?.byKind.VIDEO?.count ?? 0)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border bg-gradient-to-r from-amber-500/12 to-transparent p-4">
          <span className="grad-amber flex h-10 w-10 items-center justify-center rounded-xl text-white"><HardDrive className="h-5 w-5" /></span>
          <div>
            <p className="text-xs text-muted-foreground">{tx('স্টোরেজ ব্যবহৃত', 'Storage used')}</p>
            <p className="text-lg font-bold">{fmtBytes(totalBytes)}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="ALL">{tx('সব', 'All')}</TabsTrigger>
            <TabsTrigger value="IMAGE">{tx('ছবি', 'Images')}</TabsTrigger>
            <TabsTrigger value="VIDEO">{tx('ভিডিও', 'Videos')}</TabsTrigger>
            <TabsTrigger value="PDF">PDF</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tx('ফাইলের নাম খুঁজুন…', 'Search by filename…')}
            className="pl-8"
            aria-label={tx('ফাইল খুঁজুন', 'Search files')}
          />
        </div>
        {assets.length > 0 && (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium">
            <input
              type="checkbox"
              className="accent-primary"
              checked={assets.every((a) => bulk.isSelected(a.id))}
              onChange={() => bulk.toggleAll(assets.map((a) => a.id))}
              aria-label={tx('সব নির্বাচন', 'Select all')}
            />
            {tx('সব নির্বাচন', 'Select all')}
          </label>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border bg-card">
              <div className="aspect-video animate-pulse bg-muted" />
              <div className="space-y-2 p-3">
                <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
          <UploadCloud className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">{tx('কোনো ফাইল নেই', 'No files yet')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tx('উপরের আপলোড বাটন থেকে ছবি/ভিডিও/PDF যোগ করুন।', 'Add images/videos/PDFs using the upload button above.')}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {assets.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.3 }}
              className={`group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:shadow-md ${
                bulk.isSelected(a.id) ? 'ring-2 ring-primary' : ''
              }`}
            >
              <div className="relative aspect-video overflow-hidden bg-muted">
                {a.kind === 'IMAGE' ? (
                  <Image
                    src={a.url}
                    alt={a.originalName}
                    fill
                    sizes="300px"
                    unoptimized={a.url.startsWith('http')}
                    /* first grid row is the LCP element — priority avoids the
                       dev-console "add loading=eager" warning */
                    priority={i < 4}
                    className="object-cover"
                  />
                ) : a.kind === 'VIDEO' ? (
                  <video src={a.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                ) : a.kind === 'PDF' ? (
                  <span className="flex h-full items-center justify-center">
                    <PdfFileIcon className="h-10 w-10" />
                  </span>
                ) : (
                  <span className="flex h-full items-center justify-center text-muted-foreground">
                    <FileText className="h-10 w-10" />
                  </span>
                )}
                <span className="absolute top-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {a.kind === 'IMAGE' ? 'IMG' : a.kind === 'VIDEO' ? 'VID' : a.kind}
                </span>
                <span
                  className="absolute top-2 right-2 rounded-md bg-background/85 p-1 backdrop-blur"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={bulk.isSelected(a.id)}
                    onChange={() => bulk.toggle(a.id)}
                    aria-label={tx('নির্বাচন', 'Select')}
                  />
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <p className="truncate text-sm font-semibold" title={a.originalName}>{a.originalName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {fmtBytes(a.size)} · {new Date(a.createdAt).toLocaleDateString(bn ? 'bn-BD' : 'en-GB')}
                </p>
                <div className="mt-auto flex items-center gap-1 pt-1.5">
                  <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => copyUrl(a)}>
                    {copiedId === a.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {tx('লিংক', 'URL')}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => window.open(a.url, '_blank')}>
                    <ExternalLink className="h-3.5 w-3.5" /> {tx('দেখুন', 'Open')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmIds([a.id])}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Bulk bar */}
      <BulkBar
        count={bulk.count}
        deleting={deleting}
        onDelete={() => setConfirmIds(bulk.selected)}
        onClear={bulk.clear}
      />

      {/* Confirm delete */}
      <AlertDialog open={!!confirmIds} onOpenChange={(o) => !o && setConfirmIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tx('ফাইল মুছে ফেলবেন?', 'Delete file(s)?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `${confirmIds?.length ?? 0} টি ফাইল ডিস্ক ও ডেটাবেজ থেকে স্থায়ীভাবে মুছে যাবে। কোর্সে আগে থেকে যুক্ত লেসনগুলো প্রভাবিত হবে না।`,
                `${confirmIds?.length ?? 0} file(s) will be permanently removed from disk and database. Lessons already referencing them are not affected.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tx('বাতিল', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void removeMany(confirmIds ?? [])}
            >
              {tx('মুছে ফেলুন', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

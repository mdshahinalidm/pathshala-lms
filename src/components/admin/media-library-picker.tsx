'use client'

/**
 * MediaLibraryPicker — reuse ANY previously uploaded media.
 * Dialog grid backed by GET /api/admin/media with inline multi-upload,
 * kind filter, search, and a "use" action. Also used as the in-lesson
 * video picker and inside ImageUpload ("মিডিয়া লাইব্রেরি" tab).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import {
  Check,
  Copy,
  FileText,
  Film,
  ImageIcon,
  Loader2,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUI } from '@/store/ui-store'
import { apiGet, apiSend } from '@/lib/api-client'
import { fmtBytes, uploadFileXhr, type UploadResult } from '@/lib/upload-client'

export interface MediaAssetRow {
  id: string
  kind: string // IMAGE | VIDEO | PDF | FILE
  url: string
  filename: string
  originalName: string
  mime: string
  size: number
  title: string
  createdAt: string
}

type KindFilter = 'ALL' | 'IMAGE' | 'VIDEO' | 'PDF'

export function MediaLibraryPicker({
  open,
  onOpenChange,
  accept,
  onPick,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  accept: 'VIDEO' | 'IMAGE' | 'PDF' | 'ALL'
  onPick: (url: string, asset: MediaAssetRow) => void
}) {
  const { tx, lang } = useUI()
  const [items, setItems] = useState<MediaAssetRow[] | null>(null)
  const [filter, setFilter] = useState<KindFilter>(accept === 'ALL' ? 'ALL' : accept)
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pct, setPct] = useState(0)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '36' })
      if (filter !== 'ALL') params.set('kind', filter)
      if (qDebounced) params.set('q', qDebounced)
      const data = await apiGet<{ assets: MediaAssetRow[] }>(`/api/admin/media?${params}`)
      setItems(data.assets ?? [])
    } catch {
      setItems([])
    }
  }, [filter, qDebounced])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setPct(0)
    try {
      for (const f of Array.from(files)) {
        await uploadFileXhr(f, {
          kind: filter === 'ALL' ? undefined : filter.toLowerCase(),
          onProgress: setPct,
        })
        toast.success(tx(`আপলোড হয়েছে: ${f.name}`, `Uploaded: ${f.name}`))
      }
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপলোড ব্যর্থ', 'Upload failed'))
    } finally {
      setUploading(false)
      setPct(0)
    }
  }

  async function removeOne(id: string) {
    try {
      await apiSend<{ deleted: number }>('/api/admin/media', 'DELETE', { ids: [id] })
      toast.success(tx('মুছে ফেলা হয়েছে', 'Deleted'))
      setItems((prev) => prev?.filter((a) => a.id !== id) ?? prev)
    } catch {
      toast.error(tx('মুছে ফেলা যায়নি', 'Delete failed'))
    }
  }

  function copyUrl(asset: MediaAssetRow) {
    void navigator.clipboard.writeText(asset.url).then(() => {
      setCopiedId(asset.id)
      toast.success(tx('লিংক কপি হয়েছে', 'URL copied'))
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  const bn = lang === 'bn'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{tx('মিডিয়া লাইব্রেরি', 'Media Library')}</DialogTitle>
          <DialogDescription>
            {tx(
              'আগে আপলোড করা ফাইল ব্যবহার করুন, অথবা নতুন ফাইল আপলোড করুন — সব ডেটাবেজে সংরক্ষিত থাকে।',
              'Reuse previously uploaded files or upload new ones — everything is persisted in the database.'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as KindFilter)}>
            <TabsList className="h-9">
              <TabsTrigger value="ALL" className="px-3 text-xs">
                {tx('সব', 'All')}
              </TabsTrigger>
              <TabsTrigger value="IMAGE" className="px-3 text-xs">
                <ImageIcon className="mr-1 h-3.5 w-3.5" /> {tx('ছবি', 'Images')}
              </TabsTrigger>
              <TabsTrigger value="VIDEO" className="px-3 text-xs">
                <Film className="mr-1 h-3.5 w-3.5" /> {tx('ভিডিও', 'Videos')}
              </TabsTrigger>
              <TabsTrigger value="PDF" className="px-3 text-xs">
                <FileText className="mr-1 h-3.5 w-3.5" /> PDF
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative min-w-[140px] flex-1">
            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tx('নাম খুঁজুন…', 'Search by name…')}
              className="h-9 pl-8 text-sm"
              aria-label={tx('মিডিয়া খুঁজুন', 'Search media')}
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {uploading ? `${tx('আপলোড', 'Uploading')} ${pct}%` : tx('নতুন আপলোড', 'Upload new')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            accept={
              accept === 'IMAGE'
                ? 'image/*'
                : accept === 'VIDEO'
                  ? 'video/*,.mkv,.avi,.wmv,.flv,.3gp,.mpg,.mpeg,.ts,.vob,.mxf,.rm,.rmvb,.asf,.divx,.f4v'
                  : accept === 'PDF'
                    ? 'application/pdf'
                    : undefined
            }
            onChange={(e) => {
              void upload(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {/* Grid */}
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto pr-1 pt-1 sm:grid-cols-3">
          {items === null ? (
            <div className="col-span-full flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              {tx(
                'লাইব্রেরিতে কিছু নেই — উপরের "নতুন আপলোড" দিন থেকে ফাইল দিন।',
                'Library is empty — upload a file using the button above.'
              )}
            </div>
          ) : (
            items.map((a) => (
              <div key={a.id} className="group flex flex-col overflow-hidden rounded-xl border bg-card">
                <button
                  type="button"
                  className="relative block aspect-video w-full cursor-pointer overflow-hidden bg-muted"
                  onClick={() => {
                    onPick(a.url, a)
                    onOpenChange(false)
                  }}
                  aria-label={`${tx('ব্যবহার করুন', 'Use')} ${a.originalName}`}
                >
                  {a.kind === 'IMAGE' ? (
                    <Image
                      src={a.url}
                      alt={a.originalName}
                      fill
                      sizes="240px"
                      unoptimized={a.url.startsWith('http')}
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  ) : a.kind === 'VIDEO' ? (
                    <video src={a.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-muted-foreground">
                      {a.kind === 'PDF' ? <FileText className="h-9 w-9" /> : <Film className="h-9 w-9" />}
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/45">
                    <span className="flex translate-y-1 items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                      <Check className="h-3.5 w-3.5" /> {tx('ব্যবহার করুন', 'Use')}
                    </span>
                  </span>
                  <span className="absolute top-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {a.kind === 'IMAGE' ? 'IMG' : a.kind === 'VIDEO' ? 'VID' : a.kind}
                  </span>
                </button>
                <div className="flex items-center gap-1 p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium" title={a.originalName}>
                      {a.originalName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {fmtBytes(a.size)} · {new Date(a.createdAt).toLocaleDateString(bn ? 'bn-BD' : 'en-GB')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={tx('লিংক কপি', 'Copy URL')}
                    onClick={() => copyUrl(a)}
                  >
                    {copiedId === a.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    aria-label={tx('মুছে ফেলুন', 'Delete')}
                    onClick={() => void removeOne(a.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

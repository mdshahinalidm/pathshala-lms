'use client'

/**
 * ImageUpload — reusable image picker for the admin panel.
 * Tabs: upload (drag-drop / browse ≤3MB) · gallery (preset covers) · URL.
 * Uploads to POST /api/admin/upload (multipart) → { ok, data: { url } }.
 */
import { useRef, useState } from 'react'
import Image from 'next/image'
import { ImageIcon, Layers, Loader2, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUI } from '@/store/ui-store'
import { MediaLibraryPicker } from '@/components/admin/media-library-picker'
import { ThumbnailPreview, type ThumbMeta } from '@/components/admin/thumbnail-preview'

const MAX_SIZE_MB = 25

/** Extensions browsers cannot render inline (e.g. iPhone HEIC photos). */
const NON_RENDERABLE_IMAGE_EXT = /\.(heic|heif|tif|tiff|avif)$/i

export function ImageUpload({
  value,
  onChange,
  presets = [],
}: {
  value: string
  onChange: (v: string) => void
  presets?: string[]
}) {
  const { tx } = useUI()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [libraryOpen, setLibraryOpen] = useState(false)
  /** meta (name/size) of the last picked file — shown in the big preview. */
  const [lastMeta, setLastMeta] = useState<ThumbMeta | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null)

  /** Client-side sanity check BEFORE the file leaves the device. */
  function guardFile(file: File): boolean {
    const looksImageByExt = /\.(jpe?g|png|webp|gif|bmp|svg|heic|heif|tif|tiff|avif)$/i.test(file.name)
    if (!file.type.startsWith('image/') && !looksImageByExt) {
      toast.error(tx('শুধুমাত্র ছবি ফাইল আপলোড করা যাবে', 'Only image files can be uploaded'))
      return false
    }
    if (NON_RENDERABLE_IMAGE_EXT.test(file.name) || /image\/hei[cf]/i.test(file.type)) {
      toast.error(
        tx(
          'এই ফরম্যাট (HEIC/TIFF) ব্রাউজারে দেখা যায় না — ছবিটি JPG/PNG করে নিয়ে আবার আপলোড করুন',
          'This format (HEIC/TIFF) cannot be shown in browsers — convert the image to JPG/PNG and upload again'
        )
      )
      return false
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(
        tx(
          'ছবির সাইজ ২৫MB এর কম হতে হবে (এই ফাইলটি খুব বড়)',
          'Image must be smaller than 25MB (this file is too large)'
        )
      )
      return false
    }
    return true
  }

  async function uploadFile(file: File) {
    if (!guardFile(file)) return
    setUploading(true)
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
      setLastMeta({ name: file.name, size: file.size })
      onChange(json.data.url)
      toast.success(tx('ছবি আপলোড হয়েছে — নিচে থাম্বনেইল দেখুন', 'Image uploaded — see the thumbnail below'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপলোড ব্যর্থ হয়েছে', 'Upload failed'))
    } finally {
      setUploading(false)
    }
  }

  function applyUrl() {
    const u = urlDraft.trim()
    if (!u) return
    if (!/^https?:\/\//i.test(u) && !u.startsWith('/')) {
      toast.error(
        tx(
          'সঠিক লিংক দিন — http(s) অথবা / দিয়ে শুরু হতে হবে',
          'Enter a valid link — must start with http(s) or /'
        )
      )
      return
    }
    setLastMeta(undefined)
    onChange(u)
    setUrlDraft('')
  }

  return (
    <div className="space-y-3">
      {value ? (
        <ThumbnailPreview
          value={value}
          meta={lastMeta}
          onRemove={() => {
            setLastMeta(undefined)
            onChange('')
          }}
        />
      ) : null}

      <Tabs defaultValue="upload">
        <TabsList className="w-full">
          <TabsTrigger value="upload" className="flex-1 gap-1.5">
            <UploadCloud className="h-4 w-4" /> {tx('আপলোড', 'Upload')}
          </TabsTrigger>
          <TabsTrigger value="gallery" className="flex-1 gap-1.5">
            <ImageIcon className="h-4 w-4" /> {tx('গ্যালারি', 'Gallery')}
          </TabsTrigger>
          <TabsTrigger value="library" className="flex-1 gap-1.5">
            <Layers className="h-4 w-4" /> {tx('লাইব্রেরি', 'Library')}
          </TabsTrigger>
          <TabsTrigger value="url" className="flex-1 gap-1.5">
            {tx('URL', 'URL')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="pt-3">
          <div
            role="button"
            tabIndex={0}
            aria-label={tx('ছবি আপলোড করুন', 'Upload an image')}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileRef.current?.click()
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files?.[0]
              if (f) void uploadFile(f)
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors ${
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/40'
            }`}
          >
            {uploading ? (
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <UploadCloud className="h-5 w-5" />
              </span>
            )}
            <p className="text-sm font-medium">
              {uploading
                ? tx('আপলোড হচ্ছে…', 'Uploading…')
                : tx('ছবি টেনে আনুন অথবা ক্লিক করে বাছুন', 'Drag an image here or click to browse')}
            </p>
            <p className="text-xs text-muted-foreground">
              {tx(
                'সর্বোচ্চ ২৫MB · JPG, PNG, WebP — আপলোড শেষ হলেই বড় করে থাম্বনেইল দেখতে পাবেন',
                'Max 25MB · JPG, PNG, WebP — see the large thumbnail as soon as the upload finishes'
              )}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void uploadFile(f)
              e.target.value = ''
            }}
          />
        </TabsContent>

        <TabsContent value="gallery" className="pt-3">
          {presets.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              {tx('কোনো প্রিসেট ছবি নেই', 'No preset images available')}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {presets.map((src) => (
                <button
                  key={src}
                  type="button"
                  aria-label={src.split('/').pop() || src}
                  onClick={() => {
                    setLastMeta(undefined)
                    onChange(src)
                  }}
                  className={`relative h-16 w-full overflow-hidden rounded-lg border transition-opacity hover:opacity-85 ${
                    value === src ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
                  }`}
                >
                  <Image src={src} alt="" fill sizes="120px" className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="library" className="pt-3">
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={() => setLibraryOpen(true)}
          >
            <Layers className="h-4 w-4" />
            {tx('মিডিয়া লাইব্রেরি থেকে ছবি বাছুন', 'Pick an image from the Media Library')}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            {tx(
              'আগে আপলোড করা সব ছবি ডেটাবেজে সংরক্ষিত থাকে — সেখান থেকেই দ্রুত বাছাই করুন।',
              'All previously uploaded images live in the database — pick one to reuse instantly.'
            )}
          </p>
        </TabsContent>

        <TabsContent value="url" className="pt-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              applyUrl()
            }}
          >
            <Input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder={tx('https://… অথবা /images/…', 'https://… or /images/…')}
              aria-label={tx('ছবির URL', 'Image URL')}
            />
            <Button type="submit" variant="secondary" className="shrink-0">
              {tx('প্রয়োগ করুন', 'Apply')}
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            {tx(
              'সরাসরি লিংক ব্যবহার করুন — http(s) অথবা সাইটের ভেতরের /path।',
              'Use a direct link — http(s) or an internal /path.'
            )}
          </p>
        </TabsContent>
      </Tabs>

      <MediaLibraryPicker
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        accept="IMAGE"
        onPick={(url, asset) => {
          setLastMeta(asset?.originalName ? { name: asset.originalName, size: asset.size } : undefined)
          onChange(url)
        }}
      />
    </div>
  )
}

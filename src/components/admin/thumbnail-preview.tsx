'use client'

/**
 * ThumbnailPreview — YouTube-style large thumbnail preview for the admin panel.
 *
 * After an image is uploaded/selected, the admin sees exactly how the
 * thumbnail will look: a big 16:9 frame (like YouTube's upload preview) with
 * a "ready" pill, the filename/size and natural dimensions, and — instead of
 * a silently broken <img> — a clear inline error when the browser cannot
 * render the file (e.g. HEIC photos straight from a phone).
 *
 * Pure presentational: takes the URL and optional file meta, renders nothing
 * when the URL is empty.
 */
import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUI } from '@/store/ui-store'
import { digitsBn } from '@/lib/format'
import { fmtBytes } from '@/lib/upload-client'

export interface ThumbMeta {
  /** original/uploaded filename, shown in the meta row */
  name?: string
  /** file size in bytes, shown in the meta row */
  size?: number
}

export function ThumbnailPreview({
  value,
  onRemove,
  meta,
  removeLabel,
}: {
  value: string
  onRemove?: () => void
  meta?: ThumbMeta
  /** optional override for the remove-button label */
  removeLabel?: string
}) {
  const { tx } = useUI()
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const [prevValue, setPrevValue] = useState(value)

  // Different image chosen → reset measured/error state (render-time adjustment,
  // the React-recommended alternative to a setState-in-effect reset).
  if (prevValue !== value) {
    setPrevValue(value)
    setDims(null)
    setFailed(false)
  }

  if (!value) return null

  return (
    <div className="overflow-hidden rounded-xl border bg-muted/40">
      <div className="relative aspect-video w-full bg-muted">
        {failed ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
            <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden />
            <p className="text-sm font-medium text-destructive">
              {tx(
                'ছবিটি ব্রাউজারে দেখা যাচ্ছে না',
                'The image cannot be displayed in the browser'
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {tx(
                'JPG, PNG বা WebP ফরম্যাটের ছবি ব্যবহার করুন এবং আবার আপলোড করুন।',
                'Use a JPG, PNG or WebP image and upload again.'
              )}
            </p>
          </div>
        ) : (
          <img
            src={value}
            alt={tx('থাম্বনেইল প্রিভিউ', 'Thumbnail preview')}
            className="h-full w-full object-cover"
            onLoad={(e) => {
              const el = e.currentTarget
              if (el.naturalWidth > 0) setDims({ w: el.naturalWidth, h: el.naturalHeight })
            }}
            onError={() => setFailed(true)}
          />
        )}

        {/* ready pill — only when the image actually renders */}
        {!failed && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-emerald-600/95 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {tx('থাম্বনেইল প্রস্তুত', 'Thumbnail ready')}
          </span>
        )}

        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 gap-1.5 bg-background/85 backdrop-blur hover:bg-background"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" /> {removeLabel ?? tx('সরান', 'Remove')}
          </Button>
        )}
      </div>

      {/* meta row — filename · size · dimensions */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-xs text-muted-foreground">
        {meta?.name && <span className="max-w-[16rem] truncate font-medium text-foreground">{meta.name}</span>}
        {typeof meta?.size === 'number' && meta.size > 0 && <span>{fmtBytes(meta.size)}</span>}
        {dims && (
          <span>
            {digitsBn(dims.w)} × {digitsBn(dims.h)} {tx('পিক্সেল', 'px')}
          </span>
        )}
        {!failed && dims && (
          <span className="text-emerald-600 dark:text-emerald-400">
            {tx('— এভাবেই থাম্বনেইল দেখাবে', '— this is how the thumbnail will appear')}
          </span>
        )}
      </div>
    </div>
  )
}

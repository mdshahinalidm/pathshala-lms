'use client'

/**
 * ImageViewer — full-screen answer-sheet viewer shared by the admin Result
 * Center and the student result/runner pages. Zoom in/out, fit, full screen,
 * prev/next, image counter, rotate, reset. Touch friendly (pinch ≈ wheel).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
  Expand,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUI } from '@/store/ui-store'
import { digitsBn } from '@/lib/format'

export interface ViewerImage {
  id: string
  /** Display URL (annotated variant when present). */
  url: string
  label?: string
}

interface Transform {
  zoom: number
  offsetX: number
  offsetY: number
  rotation: number
}

const FIT: Transform = { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 }

export function ImageViewer({
  images,
  index,
  onIndexChange,
  open,
  onClose,
}: {
  images: ViewerImage[]
  index: number
  onIndexChange: (i: number) => void
  open: boolean
  onClose: () => void
}) {
  const { tx } = useUI()
  const [t, setT] = useState<Transform>(FIT)
  const [fs, setFs] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragging = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const reset = useCallback(() => setT(FIT), [])
  // Derived-state reset (React-endorsed pattern: adjust state during render
  // when props change) — avoids setState-in-effect cascades.
  const [lastIndex, setLastIndex] = useState(index)
  if (lastIndex !== index) {
    setLastIndex(index)
    setT(FIT)
  }
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) setT(FIT)
  }

  // keyboard shortcuts
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') onIndexChange((index + 1) % images.length)
      else if (e.key === 'ArrowLeft') onIndexChange((index - 1 + images.length) % images.length)
      else if (e.key === '+' || e.key === '=') setT((p) => ({ ...p, zoom: Math.min(8, p.zoom * 1.2) }))
      else if (e.key === '-') setT((p) => ({ ...p, zoom: Math.max(0.2, p.zoom / 1.2) }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, index, images.length, onClose, onIndexChange])

  // full-screen API
  const toggleFs = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen().catch(() => {})
  }, [])
  useEffect(() => {
    const onFs = () => setFs(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  if (!open || images.length === 0) return null
  const img = images[index]

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[90] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={tx('উত্তরপত্র ভিউয়ার', 'Answer sheet viewer')}
    >
      {/* top bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-white">
        <p className="min-w-0 truncate text-sm font-medium">
          {img.label ?? `${tx('ছবি', 'Image')} ${digitsBn(index + 1)}`}
          <span className="ml-2 text-white/60">
            {digitsBn(index + 1)} / {digitsBn(images.length)}
          </span>
        </p>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/15" onClick={() => setT((p) => ({ ...p, zoom: Math.min(8, p.zoom * 1.25) }))} aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-white/80">{digitsBn(Math.round(t.zoom * 100))}%</span>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/15" onClick={() => setT((p) => ({ ...p, zoom: Math.max(0.2, p.zoom / 1.25) }))} aria-label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/15" onClick={() => setT((p) => ({ ...p, rotation: (p.rotation + 90) % 360 }))} aria-label="Rotate">
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/15" onClick={reset} aria-label="Fit to screen">
            <Expand className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/15" onClick={toggleFs} aria-label="Full screen">
            {fs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/15" onClick={onClose} aria-label="Close viewer">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* stage */}
      <div
        className="relative flex-1 overflow-hidden"
        onWheel={(e) => {
          e.preventDefault()
          setT((p) => ({ ...p, zoom: Math.min(8, Math.max(0.2, p.zoom * (e.deltaY < 0 ? 1.12 : 0.9))) }))
        }}
        onPointerDown={(e) => {
          dragging.current = { x: e.clientX, y: e.clientY, ox: t.offsetX, oy: t.offsetY }
          setIsDragging(true)
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = dragging.current
          if (!d) return
          setT((p) => ({ ...p, offsetX: d.ox + (e.clientX - d.x), offsetY: d.oy + (e.clientY - d.y) }))
        }}
        onPointerUp={() => { dragging.current = null; setIsDragging(false) }}
        onPointerLeave={() => { dragging.current = null; setIsDragging(false) }}
      >
        { }
        <img
          src={img.url}
          alt={img.label ?? `answer-sheet-${index + 1}`}
          draggable={false}
          className="absolute left-1/2 top-1/2 max-h-none max-w-none select-none"
          style={{
            transform: `translate(-50%, -50%) translate(${t.offsetX}px, ${t.offsetY}px) scale(${t.zoom}) rotate(${t.rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 120ms ease-out',
            transformOrigin: 'center',
          }}
        />

        {images.length > 1 && (
          <>
            <Button
              size="icon"
              onClick={() => onIndexChange((index - 1 + images.length) % images.length)}
              className="absolute left-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-white/15 text-white hover:bg-white/30"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              onClick={() => onIndexChange((index + 1) % images.length)}
              className="absolute right-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-white/15 text-white hover:bg-white/30"
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

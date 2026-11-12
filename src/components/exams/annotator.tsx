'use client'

/**
 * Annotator — canvas marking layer over an ORIGINAL answer-sheet image.
 * Non-destructive: the underlying image is never modified. Strokes are kept
 * as normalized coordinates (0..1 of the image box) so they survive any
 * zoom/resize; "Save" hands the stroke list + flattened PNG blob to the
 * parent, which uploads the flattened version as the annotated variant.
 *
 * Tools: Pen / Marker / Eraser (stroke-level) / Undo / Redo / Clear.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser, Highlighter, Pen, RotateCcw, RotateCw, Save, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUI } from '@/store/ui-store'
import { cn } from '@/lib/utils'

export interface Stroke {
  id: string
  tool: 'pen' | 'marker'
  color: string
  width: number // relative to image width (×1000)
  points: { x: number; y: number }[]
}

interface AnnotatorProps {
  imageUrl: string
  initialStrokes: Stroke[]
  onSave: (strokes: Stroke[], flattened: Blob) => void | Promise<void>
  onCancel: () => void
}

const COLORS = ['#dc2626', '#16a34a', '#2563eb', '#f59e0b', '#111827']

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number) {
  if (s.points.length === 0) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = s.color
  ctx.globalAlpha = s.tool === 'marker' ? 0.45 : 1
  ctx.lineWidth = (s.width / 1000) * w
  ctx.beginPath()
  ctx.moveTo(s.points[0].x * w, s.points[0].y * h)
  for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * w, s.points[i].y * h)
  if (s.points.length === 1) ctx.lineTo(s.points[0].x * w + 0.1, s.points[0].y * h)
  ctx.stroke()
  ctx.restore()
}

export function Annotator({ imageUrl, initialStrokes, onSave, onCancel }: AnnotatorProps) {
  const { tx } = useUI()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes)
  const [redoStack, setRedoStack] = useState<Stroke[]>([])
  const [tool, setTool] = useState<'pen' | 'marker' | 'eraser'>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(3)
  const [drawing, setDrawing] = useState<Stroke | null>(null)
  const [saving, setSaving] = useState(false)
  const [imgReady, setImgReady] = useState(false)

  // load the ORIGINAL image once
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imgRef.current = img
      setImgReady(true)
    }
    img.src = imageUrl
    return () => {
      imgRef.current = null
      setImgReady(false)
    }
  }, [imageUrl])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !canvas.width || !canvas.height) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const all = drawing ? [...strokes, drawing] : strokes
    for (const s of all) drawStroke(ctx, s, canvas.width, canvas.height)
  }, [strokes, drawing])

  // keep canvas sized to the container's width × image aspect
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !imgReady) return
    const parent = canvas.parentElement
    if (!parent) return
    const resize = () => {
      const w = parent.clientWidth
      const h = Math.round((w * img.naturalHeight) / img.naturalWidth)
      canvas.width = w
      canvas.height = h
      canvas.style.height = `${h}px`
      render()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [imgReady, render])

  useEffect(() => {
    if (imgReady) render()
  }, [imgReady, render])

  const norm = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  const hitTest = (p: { x: number; y: number }): Stroke | null => {
    // stroke-level eraser: remove the stroke whose points pass near the cursor
    const tol = 0.012 + width / 4000
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i]
      const tolS = tol + s.width / 4000
      for (const pt of s.points) {
        if (Math.hypot(pt.x - p.x, pt.y - p.y) <= tolS) return s
      }
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = norm(e)
    if (tool === 'eraser') {
      const hit = hitTest(p)
      if (hit) {
        setRedoStack([])
        setStrokes((prev) => prev.filter((s) => s.id !== hit.id))
      }
      return
    }
    setDrawing({ id: `s${Date.now()}`, tool, color, width, points: [p] })
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'eraser' || !drawing) return
    const p = norm(e)
    setDrawing((prev) => (prev ? { ...prev, points: [...prev.points, p] } : prev))
  }

  const onPointerUp = () => {
    if (!drawing) return
    setStrokes((prev) => [...prev, drawing])
    setDrawing(null)
    setRedoStack([])
  }

  const undo = () => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setRedoStack((r) => [...r, last])
      return prev.slice(0, -1)
    })
  }
  const redo = () => {
    setRedoStack((r) => {
      if (r.length === 0) return r
      const last = r[r.length - 1]
      setStrokes((prev) => [...prev, last])
      return r.slice(0, -1)
    })
  }

  const save = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setSaving(true)
    try {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'))
      if (!blob) throw new Error('flatten failed')
      await onSave(strokes, blob)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-2">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={tool === 'pen' ? 'default' : 'outline'}
            className="h-8 gap-1"
            onClick={() => setTool('pen')}
            aria-pressed={tool === 'pen'}
          >
            <Pen className="h-3.5 w-3.5" /> {tx('কলম', 'Pen')}
          </Button>
          <Button
            size="sm"
            variant={tool === 'marker' ? 'default' : 'outline'}
            className="h-8 gap-1"
            onClick={() => setTool('marker')}
            aria-pressed={tool === 'marker'}
          >
            <Highlighter className="h-3.5 w-3.5" /> {tx('মার্কার', 'Marker')}
          </Button>
          <Button
            size="sm"
            variant={tool === 'eraser' ? 'default' : 'outline'}
            className="h-8 gap-1"
            onClick={() => setTool('eraser')}
            aria-pressed={tool === 'eraser'}
          >
            <Eraser className="h-3.5 w-3.5" /> {tx('ইরেজার', 'Eraser')}
          </Button>
        </div>

        <div className="flex items-center gap-1" role="radiogroup" aria-label={tx('রঙ', 'Color')}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`color ${c}`}
              className={cn(
                'h-6 w-6 rounded-full border-2 transition-transform',
                color === c ? 'scale-110 border-foreground' : 'border-transparent'
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{tx('ব্রাশ', 'Width')}</span>
          <Input
            type="range"
            min={1}
            max={12}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            className="h-8 w-20 px-0"
            aria-label={tx('ব্রাশ প্রস্থ', 'Brush width')}
          />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={undo} disabled={strokes.length === 0 && !drawing} aria-label="Undo">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={redo} disabled={redoStack.length === 0} aria-label="Redo">
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-destructive hover:text-destructive"
            onClick={() => { setStrokes([]); setRedoStack([]) }}
            disabled={strokes.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5" /> {tx('মুছুন', 'Clear')}
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={onCancel}>
            <X className="h-3.5 w-3.5" /> {tx('বাতিল', 'Cancel')}
          </Button>
          <Button size="sm" className="h-8 gap-1" onClick={() => void save()} disabled={saving}>
            {saving ? <Save className="h-3.5 w-3.5 animate-pulse" /> : <Check className="h-3.5 w-3.5" />}
            {tx('সংরক্ষণ', 'Save')}
          </Button>
        </div>
      </div>

      {/* canvas stage */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <canvas
          ref={canvasRef}
          className="block w-full touch-none"
          style={{ cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {tx(
          'মূল ছবি অপরিবর্তিত থাকে — মার্কিং আলাদা লেয়ারে সংরক্ষিত হয়।',
          'The original image stays untouched — marking is stored as a separate layer.'
        )}
      </p>
    </div>
  )
}

'use client'

/**
 * AnswerSheetViewer — full-screen answer-sheet viewer + non-destructive
 * annotation editor (admin marking) / read-only evaluated view (student).
 *
 * Viewer: zoom (buttons/wheel/pinch), pan (drag), rotate, fit/reset,
 * fullscreen, prev/next, counter, thumbnail rail.
 * Annotator (when onSaveStrokes provided): pen, marker, eraser, tick ✓,
 * cross ✗, circle, underline, arrow, text note, undo/redo, clear — all as a
 * normalized SVG overlay; the original image file is NEVER touched.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Circle, Eraser, Hand, Highlighter,
  Loader2, Maximize, Minus, Minimize, Pencil, Plus, RotateCw, Type as TypeIcon,
  Undo2, Redo2, Trash2, X, Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DEFAULT_WIDTHS, STROKE_COLORS, defaultColorFor, newStrokeId,
  type Stroke, type StrokeTool,
} from '@/lib/exam-annotations'

export interface ViewerImage {
  id: string
  url: string
  strokes: Stroke[]
  annotatedAt?: string | null
  originalName?: string
}

interface Props {
  images: ViewerImage[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
  /** When provided, the annotation toolbar is available (admin). */
  onSaveStrokes?: (imageId: string, strokes: Stroke[]) => Promise<void>
  title?: string
}

type XForm = { scale: number; tx: number; ty: number; rotation: number }

const MIN_SCALE = 0.4
const MAX_SCALE = 6

export function AnswerSheetViewer({ images, index, onIndexChange, onClose, onSaveStrokes, title }: Props) {
  const img = images[index]
  const canAnnotate = Boolean(onSaveStrokes)

  const [annotating, setAnnotating] = useState(false)
  const [tool, setTool] = useState<StrokeTool>('pen')
  const [color, setColor] = useState<string>(STROKE_COLORS[0])
  const [thick, setThick] = useState(1) // 0.6 | 1 | 1.8 multiplier
  const [xform, setXform] = useState<XForm>({ scale: 1, tx: 0, ty: 0, rotation: 0 })
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // per-image stroke state (only current image kept here; others re-read)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const undoStack = useRef<Stroke[][]>([])
  const redoStack = useRef<Stroke[][]>([])
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const textPrompt = useRef<{ x: number; y: number } | null>(null)
  const [textBox, setTextBox] = useState<{ x: number; y: number; value: string } | null>(null)

  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchStart = useRef<{ dist: number; scale: number; tx: number; ty: number } | null>(null)
  const dragState = useRef<{ sx: number; sy: number; tx: number; ty: number; mode: 'pan' | 'draw' | 'shape' } | null>(null)
  const [liveStroke, setLiveStroke] = useState<Stroke | null>(null)
  // mirror of liveStroke for event handlers (avoids stale closure on pointerup)
  const liveRef = useRef<Stroke | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  useEffect(() => {
    strokesRef.current = strokes
  }, [strokes])

  // load strokes for the current image
  useEffect(() => {
    setStrokes(img ? img.strokes : [])
    undoStack.current = []
    redoStack.current = []
    setDirty(false)
    setNatural(null)
    setXform({ scale: 1, tx: 0, ty: 0, rotation: 0 })
    setAnnotating(false)
    setTextBox(null)
  }, [img?.id])  

  const commit = useCallback((next: Stroke[]) => {
    undoStack.current.push(strokesRef.current)
    redoStack.current = []
    strokesRef.current = next
    setStrokes(next)
    setDirty(true)
  }, [])

  const undo = useCallback(() => {
    const prev = undoStack.current.pop()
    if (!prev) return
    redoStack.current.push(strokesRef.current)
    strokesRef.current = prev
    setStrokes(prev)
    setDirty(true)
  }, [])

  const redo = useCallback(() => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(strokesRef.current)
    strokesRef.current = next
    setStrokes(next)
    setDirty(true)
  }, [])

  const save = useCallback(async () => {
    if (!onSaveStrokes || !img) return
    setSaving(true)
    try {
      await onSaveStrokes(img.id, strokes)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }, [onSaveStrokes, img, strokes])

  const saveAndClose = useCallback(async () => {
    if (dirty && onSaveStrokes && img) {
      await save()
    }
    onClose()
  }, [dirty, onSaveStrokes, img, save, onClose])

  // keyboard: arrows / escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textBox) return
      if (e.key === 'Escape') {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
        else void saveAndClose()
      } else if (e.key === 'ArrowRight' && index < images.length - 1) onIndexChange(index + 1)
      else if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, onIndexChange, saveAndClose, textBox])

  const zoomBy = (factor: number) => {
    setXform((x) => ({ ...x, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, x.scale * factor)) }))
  }
  const fit = () => setXform({ scale: 1, tx: 0, ty: 0, rotation: 0 })
  const rotate = () => setXform((x) => ({ ...x, rotation: (x.rotation + 90) % 360 }))
  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen()
      else void stageRef.current?.parentElement?.requestFullscreen?.()
    } catch {
      /* unsupported — overlay is already fullscreen-like */
    }
  }

  // ── coordinate conversion: screen → normalized (0..1 of the image box) ──
  const toNorm = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height }
  }

  // ── pointer handling (pan / pinch / draw / shapes) ──
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && !annotating) {
      const [a, b] = [...pointers.current.values()]
      pinchStart.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: xform.scale, tx: xform.tx, ty: xform.ty,
      }
      dragState.current = null
      return
    }
    if (annotating && onSaveStrokes) {
      const p = toNorm(e.clientX, e.clientY)
      if (!p) return
      if (tool === 'text') {
        textPrompt.current = p
        setTextBox({ x: e.clientX, y: e.clientY, value: '' })
        return
      }
      if (tool === 'eraser') {
        eraseAt(p)
        dragState.current = { sx: e.clientX, sy: e.clientY, tx: 0, ty: 0, mode: 'draw' }
        return
      }
      const base: Stroke = {
        id: newStrokeId(),
        tool,
        color: tool === 'pen' || tool === 'marker' ? color : defaultColorFor(tool),
        width: (DEFAULT_WIDTHS[tool] ?? 0.006) * thick,
        opacity: tool === 'marker' ? 0.4 : 1,
        points: [p],
      }
      dragState.current = { sx: e.clientX, sy: e.clientY, tx: 0, ty: 0, mode: tool === 'pen' || tool === 'marker' ? 'draw' : 'shape' }
      liveRef.current = base
      setLiveStroke(base)
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    } else {
      dragState.current = { sx: e.clientX, sy: e.clientY, tx: xform.tx, ty: xform.ty, mode: 'pan' }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // pinch zoom
    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStart.current.scale * (dist / Math.max(1, pinchStart.current.dist))))
      setXform((x) => ({ ...x, scale: s }))
      return
    }
    const ds = dragState.current
    if (!ds) return
    if (ds.mode === 'pan') {
      setXform((x) => ({ ...x, tx: ds.tx + (e.clientX - ds.sx), ty: ds.ty + (e.clientY - ds.sy) }))
      return
    }
    const p = toNorm(e.clientX, e.clientY)
    if (!p) return
    if (ds.mode === 'draw') {
      if (tool === 'eraser') {
        eraseAt(p)
        return
      }
      const cur = liveRef.current
      if (!cur) return
      const last = cur.points[cur.points.length - 1]
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.002) return
      const next = { ...cur, points: [...cur.points, p] }
      liveRef.current = next
      setLiveStroke(next)
    } else {
      // shapes keep exactly [start, current]
      const cur = liveRef.current
      if (!cur) return
      const next = { ...cur, points: [cur.points[0], p] }
      liveRef.current = next
      setLiveStroke(next)
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchStart.current = null
    const ds = dragState.current
    dragState.current = null
    const current = liveRef.current
    liveRef.current = null
    if (current && ds && ds.mode !== 'pan') {
      const finished: Stroke = { ...current }
      const minDim = Math.min(natural?.w ?? 1000, natural?.h ?? 1000)
      if (finished.tool === 'tick' || finished.tool === 'cross' || finished.tool === 'text') {
        finished.points = [finished.points[0]]
      } else if (finished.tool === 'circle' || finished.tool === 'underline' || finished.tool === 'arrow') {
        if (finished.points.length < 2 || dist(finished.points[0], finished.points[1]) * minDim < 8) {
          setLiveStroke(null)
          return
        }
      } else if (finished.points.length < 2) {
        setLiveStroke(null)
        return
      }
      commit([...strokesRef.current, finished])
    }
    setLiveStroke(null)
  }

  const eraseAt = (p: { x: number; y: number }) => {
    const w = natural?.w ?? 1000
    const h = natural?.h ?? 1000
    const minDim = Math.min(w, h)
    const threshold = 0.014 * Math.max(w, h)
    const px = p.x * w
    const py = p.y * h
    const hit = strokes.find((s) =>
      s.points.some((pt) => Math.hypot(pt.x * w - px, pt.y * h - py) < threshold) ||
      (s.tool === 'circle' && pointNearEllipse(px, py, s, w, h, threshold)) ||
      segHit(s, w, h, px, py, threshold)
    )
    if (hit) {
      commit(strokes.filter((s) => s.id !== hit.id))
    }
  }

  const submitTextBox = () => {
    if (textBox && textBox.value.trim() && textPrompt.current) {
      const p = textPrompt.current
      const s: Stroke = {
        id: newStrokeId(),
        tool: 'text',
        color,
        width: (DEFAULT_WIDTHS.text ?? 0.028) * thick,
        opacity: 1,
        points: [p],
        text: textBox.value.trim().slice(0, 120),
      }
      commit([...strokes, s])
    }
    setTextBox(null)
    textPrompt.current = null
  }

  // wheel zoom
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setXform((x) => ({ ...x, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, x.scale * (e.deltaY < 0 ? 1.12 : 0.89))) }))
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [])

  const minDim = Math.min(natural?.w ?? 1000, natural?.h ?? 1000)
  const vbW = natural?.w ?? 1000
  const vbH = natural?.h ?? 1000

  const renderStroke = (s: Stroke, live = false): React.ReactNode => {
    const key = s.id + (live ? '-live' : '')
    const sw = Math.max(1, s.width * minDim)
    const common = { stroke: s.color, strokeWidth: sw, opacity: s.opacity, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
    const pts = s.points.map((p) => ({ x: p.x * vbW, y: p.y * vbH }))
    if (s.tool === 'pen' || s.tool === 'marker' || s.tool === 'underline') {
      if (pts.length < 2) return null
      return <polyline key={key} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} {...common} />
    }
    if (s.tool === 'circle') {
      if (pts.length < 2) return null
      const [a, b] = pts
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const rx = Math.max(sw, Math.abs(a.x - b.x) / 2)
      const ry = Math.max(sw, Math.abs(a.y - b.y) / 2)
      return <ellipse key={key} cx={cx} cy={cy} rx={rx} ry={ry} {...common} />
    }
    if (s.tool === 'arrow') {
      if (pts.length < 2) return null
      const [a, b] = pts
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      const head = Math.max(sw * 3, 10)
      const p1 = { x: b.x - head * Math.cos(ang - 0.5), y: b.y - head * Math.sin(ang - 0.5) }
      const p2 = { x: b.x - head * Math.cos(ang + 0.5), y: b.y - head * Math.sin(ang + 0.5) }
      return (
        <g key={key} opacity={s.opacity}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...common} />
          <polyline points={`${p1.x},${p1.y} ${b.x},${b.y} ${p2.x},${p2.y}`} {...common} />
        </g>
      )
    }
    if (s.tool === 'tick' || s.tool === 'cross') {
      if (!pts[0]) return null
      const size = s.width * minDim * 2.4
      const [c] = pts
      if (s.tool === 'tick') {
        const p1 = { x: c.x - size * 0.5, y: c.y }
        const p2 = { x: c.x - size * 0.1, y: c.y + size * 0.4 }
        const p3 = { x: c.x + size * 0.6, y: c.y - size * 0.45 }
        return <polyline key={key} points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`} {...common} />
      }
      const d = size * 0.42
      return (
        <g key={key} opacity={s.opacity}>
          <line x1={c.x - d} y1={c.y - d} x2={c.x + d} y2={c.y + d} {...common} />
          <line x1={c.x - d} y1={c.y + d} x2={c.x + d} y2={c.y - d} {...common} />
        </g>
      )
    }
    if (s.tool === 'text' && s.text) {
      if (!pts[0]) return null
      return (
        <text
          key={key}
          x={pts[0].x}
          y={pts[0].y}
          fontSize={Math.max(12, s.width * minDim)}
          fill={s.color}
          opacity={s.opacity}
          fontFamily="ui-sans-serif, system-ui"
          fontWeight={700}
        >
          {s.text}
        </text>
      )
    }
    return null
  }

  if (!img) return null

  return createPortal(
    // pointer-events-auto: Radix sets body{pointer-events:none} while a parent
    // Dialog is open — the portal would otherwise be click-through.
    <div className="pointer-events-auto fixed inset-0 z-[90] flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label={title ?? 'Answer sheet viewer'}>
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 bg-black/60 px-2 py-1.5 text-white sm:px-3">
        <span className="mr-1 hidden text-xs font-semibold text-white/80 sm:block">
          {title ?? (img.originalName || `পৃষ্ঠা ${index + 1}`)}
        </span>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold tabular-nums">
          {index + 1} / {images.length}
        </span>
        <div className="mx-1 flex items-center gap-0.5">
          <VBtn onClick={() => zoomBy(1.25)} label="Zoom in"><Plus className="h-4 w-4" /></VBtn>
          <VBtn onClick={() => zoomBy(0.8)} label="Zoom out"><Minus className="h-4 w-4" /></VBtn>
          <VBtn onClick={fit} label="Fit to screen"><Maximize className="h-4 w-4" /></VBtn>
          <VBtn onClick={rotate} label="Rotate"><RotateCw className="h-4 w-4" /></VBtn>
          <VBtn onClick={toggleFullscreen} label="Fullscreen"><Minimize className="h-4 w-4" /></VBtn>
        </div>

        {canAnnotate && (
          <Button
            size="sm"
            variant={annotating ? 'default' : 'outline'}
            className={`ml-auto h-8 gap-1.5 rounded-xl ${annotating ? '' : 'border-white/25 bg-transparent text-white hover:bg-white/10'}`}
            onClick={() => setAnnotating((a) => !a)}
          >
            <Pencil className="h-3.5 w-3.5" />
            {annotating ? 'মার্কিং বন্ধ' : 'মার্কিং করুন'}
          </Button>
        )}
        {canAnnotate && dirty && (
          <Button size="sm" className="h-8 gap-1.5 rounded-xl" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            সংরক্ষণ
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className={`ml-auto h-8 rounded-xl border-white/25 bg-transparent text-white hover:bg-white/10 ${canAnnotate ? '' : 'ml-auto'}`}
          onClick={() => void saveAndClose()}
          aria-label="Close viewer"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* annotation toolbar */}
      {canAnnotate && annotating && (
        <div className="flex flex-wrap items-center gap-1 border-b border-white/10 bg-zinc-900/90 px-2 py-1.5 text-white">
          <ToolBtn active={tool === 'pen'} onClick={() => setTool('pen')} label="কলম"><Pencil className="h-4 w-4" /></ToolBtn>
          <ToolBtn active={tool === 'marker'} onClick={() => setTool('marker')} label="মার্কার"><Highlighter className="h-4 w-4" /></ToolBtn>
          <ToolBtn active={tool === 'tick'} onClick={() => setTool('tick')} label="সঠিক ✓"><Check className="h-4 w-4 text-emerald-400" /></ToolBtn>
          <ToolBtn active={tool === 'cross'} onClick={() => setTool('cross')} label="ভুল ✗"><X className="h-4 w-4 text-rose-400" /></ToolBtn>
          <ToolBtn active={tool === 'circle'} onClick={() => setTool('circle')} label="বৃত্ত"><Circle className="h-4 w-4" /></ToolBtn>
          <ToolBtn active={tool === 'underline'} onClick={() => setTool('underline')} label="আন্ডারলাইন"><Minus className="h-4 w-4" /></ToolBtn>
          <ToolBtn active={tool === 'arrow'} onClick={() => setTool('arrow')} label="তীর"><ArrowUpRight className="h-4 w-4" /></ToolBtn>
          <ToolBtn active={tool === 'text'} onClick={() => setTool('text')} label="নোট"><TypeIcon className="h-4 w-4" /></ToolBtn>
          <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} label="ইরেজার"><Eraser className="h-4 w-4" /></ToolBtn>
          <span className="mx-1 h-5 w-px bg-white/20" />
          <ToolBtn onClick={undo} label="আন্ডু" disabled={!strokes.length}><Undo2 className="h-4 w-4" /></ToolBtn>
          <ToolBtn onClick={redo} label="রিডু" disabled={!redoStack.current.length}><Redo2 className="h-4 w-4" /></ToolBtn>
          <ToolBtn onClick={() => commit([])} label="সব মুছুন" disabled={!strokes.length}><Trash2 className="h-4 w-4 text-rose-400" /></ToolBtn>
          <span className="mx-1 h-5 w-px bg-white/20" />
          <ToolBtn active={!annotating && false} onClick={() => setAnnotating(false)} label="প্যান (সরান)"><Hand className="h-4 w-4" /></ToolBtn>
          <span className="mx-1 h-5 w-px bg-white/20" />
          {STROKE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`color ${c}`}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full border-2 transition-transform ${color === c ? 'scale-110 border-white' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <span className="mx-1 h-5 w-px bg-white/20" />
          {([
            [0.6, 'সরু'],
            [1, 'মাঝারি'],
            [1.8, 'মোটা'],
          ] as const).map(([v, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setThick(v)}
              className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold ${thick === v ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <span className="inline-block rounded-full bg-current" style={{ width: 4 + v * 5, height: 4 + v * 5 }} />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* stage */}
      <div
        ref={stageRef}
        className={`relative flex flex-1 items-center justify-center overflow-hidden ${annotating && tool !== 'eraser' ? 'cursor-crosshair' : annotating ? 'cursor-cell' : 'cursor-grab active:cursor-grabbing'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: 'none' }}
      >
        <div
          className="relative select-none"
          style={{
            transform: `translate(${xform.tx}px, ${xform.ty}px) scale(${xform.scale}) rotate(${xform.rotation}deg)`,
            transition: dragState.current ? 'none' : 'transform 0.12s ease-out',
            maxWidth: '92%',
            maxHeight: '92%',
          }}
        >
          { }
          <img
            src={img.url}
            alt={img.originalName || `Answer sheet ${index + 1}`}
            className="max-h-[78vh] max-w-full object-contain"
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget
              if (el.naturalWidth) setNatural({ w: el.naturalWidth, h: el.naturalHeight })
            }}
          />
          <svg
            ref={svgRef}
            viewBox={`0 0 ${vbW} ${vbH}`}
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            {strokes.map((s) => renderStroke(s))}
            {liveStroke ? renderStroke(liveStroke, true) : null}
          </svg>
        </div>

        {/* text input bubble */}
        {textBox && (
          <div
            className="fixed z-[95] flex items-center gap-1.5 rounded-xl border bg-background p-1.5 shadow-xl"
            style={{ left: Math.max(8, textBox.x - 120), top: Math.max(8, textBox.y - 24) }}
          >
            <input
              autoFocus
              value={textBox.value}
              onChange={(e) => setTextBox((b) => (b ? { ...b, value: e.target.value } : b))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitTextBox()
                if (e.key === 'Escape') setTextBox(null)
              }}
              placeholder="সংক্ষিপ্ত নোট লিখুন…"
              className="w-44 rounded-lg border bg-transparent px-2 py-1 text-sm outline-none"
            />
            <Button size="sm" className="h-7 rounded-lg" onClick={submitTextBox}>যোগ করুন</Button>
          </div>
        )}

        {/* prev / next */}
        {index > 0 && (
          <button
            type="button"
            aria-label="আগের ছবি"
            onClick={(e) => { e.stopPropagation(); onIndexChange(index - 1) }}
            className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        {index < images.length - 1 && (
          <button
            type="button"
            aria-label="পরের ছবি"
            onClick={(e) => { e.stopPropagation(); onIndexChange(index + 1) }}
            className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* thumbnail rail */}
      {images.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-white/10 bg-black/60 p-2">
          {images.map((im, i) => (
             
            <img
              key={im.id}
              src={im.url}
              alt={`পৃষ্ঠা ${i + 1}`}
              onClick={() => onIndexChange(i)}
              className={`h-14 w-11 shrink-0 cursor-pointer rounded-md border-2 object-cover transition ${i === index ? 'border-emerald-400' : 'border-transparent opacity-60 hover:opacity-100'}`}
            />
          ))}
        </div>
      )}
    </div>,
    document.body
  )
}

function VBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-white/85 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  )
}

function ToolBtn({ children, onClick, label, active, disabled }: { children: React.ReactNode; onClick: () => void; label: string; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition disabled:opacity-30 ${active ? 'bg-white text-black' : 'text-white/85 hover:bg-white/10'}`}
    >
      {children}
    </button>
  )
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function segHit(s: Stroke, w: number, h: number, px: number, py: number, threshold: number): boolean {
  const pts = s.points.map((p) => ({ x: p.x * w, y: p.y * h }))
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSeg(px, py, pts[i], pts[i + 1])
    if (d < threshold) return true
  }
  return false
}

function distToSeg(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - a.x, py - a.y)
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

function pointNearEllipse(px: number, py: number, s: Stroke, w: number, h: number, threshold: number) {
  if (s.points.length < 2) return false
  const [a, b] = s.points
  const cx = ((a.x + b.x) / 2) * w
  const cy = ((a.y + b.y) / 2) * h
  const rx = Math.abs((a.x - b.x) / 2) * w
  const ry = Math.abs((a.y - b.y) / 2) * h
  if (rx <= 0 || ry <= 0) return false
  const v = Math.hypot((px - cx) / rx, (py - cy) / ry)
  const rMean = (rx + ry) / 2
  return Math.abs(v - 1) * rMean < threshold
}

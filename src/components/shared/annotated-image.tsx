'use client'

/**
 * AnnotatedImage — an image with the admin's red-pen strokes overlaid.
 *
 * • Strokes are polylines in NORMALIZED 0..1 coordinates, rendered as SVG with
 *   non-scaling strokes — they stay glued to the paper at any display size,
 *   identical for the admin grader and the student's result view.
 * • editable mode adds a transparent pointer surface (pen tool: color+width);
 *   every finished stroke is reported upward via onChange (undo/clear live in
 *   the parent so both toolbar and canvas stay in sync).
 * • Read-only mode renders strokes only (student results gallery).
 */
import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface PenStroke {
  color: string
  width: number
  points: [number, number][] // normalized 0..1
}

interface AnnotatedImageProps {
  src: string
  alt: string
  strokes: PenStroke[]
  editable?: boolean
  color?: string
  width?: number
  onChange?: (next: PenStroke[]) => void
  className?: string
  imgClassName?: string
}

const toPointsAttr = (pts: [number, number][]) => pts.map((p) => `${p[0]},${p[1]}`).join(' ')

export default function AnnotatedImage({
  src,
  alt,
  strokes,
  editable = false,
  color = '#ef4444',
  width = 4,
  onChange,
  className,
  imgClassName,
}: AnnotatedImageProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef(false)
  const [live, setLive] = useState<PenStroke | null>(null)

  const toPoint = (e: React.PointerEvent): [number, number] => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return [0, 0]
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editable || e.button !== 0) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    drawingRef.current = true
    setLive({ color, width, points: [toPoint(e)] })
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const p = toPoint(e)
    setLive((prev) => (prev ? { ...prev, points: [...prev.points, p] } : prev))
  }
  const finishStroke = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    setLive((prev) => {
      if (prev && prev.points.length >= 2) onChange?.([...strokes, prev])
      return null
    })
  }

  return (
    <div className={cn('relative select-none', className)}>
      { }
      <img src={src} alt={alt} draggable={false} className={cn('block w-full rounded-lg bg-muted', imgClassName)} />
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        {strokes.map((s, i) => (
          <polyline
            key={i}
            points={toPointsAttr(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {live && (
          <polyline
            points={toPointsAttr(live.points)}
            fill="none"
            stroke={live.color}
            strokeWidth={live.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {editable && (
        <div
          ref={surfaceRef}
          role="img"
          aria-label={`${alt} — pen marking surface`}
          className="absolute inset-0 cursor-crosshair"
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishStroke}
          onPointerLeave={finishStroke}
        />
      )}
    </div>
  )
}

'use client'

import { useId } from 'react'

/** Circular progress ring (SVG, gradient stroke) — course progress & exam scores. */
export function CircularProgress({
  value,
  size = 64,
  strokeWidth = 6,
  label,
}: {
  value: number // 0..100
  size?: number
  strokeWidth?: number
  label?: string
}) {
  const gid = useId()
  const clamped = Math.max(0, Math.min(100, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="55%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute text-center text-xs font-bold leading-none">
        {/* Rounded label: DB progress can be a raw float (e.g. 16.666…) —
            an unrounded label overflows the ring and the viewport. */}
        <span className="grad-text-brand">{Math.round(clamped)}%</span>
        {label && <span className="mt-0.5 block text-[9px] font-medium text-muted-foreground">{label}</span>}
      </span>
    </div>
  )
}

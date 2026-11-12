'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'
import { useUI } from '@/store/ui-store'
import { digitsBn } from '@/lib/format'

type Tone = 'emerald' | 'violet' | 'amber' | 'rose' | 'cyan' | 'orange' | 'lime'

const TONE_CLS: Record<Tone, { bar: string; chip: string; text: string }> = {
  emerald: { bar: 'grad-emerald', chip: 'grad-emerald text-white shadow-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400' },
  violet:  { bar: 'grad-violet',  chip: 'grad-violet text-white shadow-violet-500/30',   text: 'text-violet-600 dark:text-violet-400' },
  amber:   { bar: 'grad-amber',   chip: 'grad-amber text-white shadow-amber-500/30',    text: 'text-amber-600 dark:text-amber-400' },
  rose:    { bar: 'grad-rose',    chip: 'grad-rose text-white shadow-rose-500/30',      text: 'text-rose-600 dark:text-rose-400' },
  cyan:    { bar: 'grad-cyan',    chip: 'grad-cyan text-white shadow-cyan-500/30',      text: 'text-cyan-600 dark:text-cyan-400' },
  orange:  { bar: 'grad-orange',  chip: 'grad-orange text-white shadow-orange-500/30',  text: 'text-orange-600 dark:text-orange-400' },
  lime:    { bar: 'grad-lime',    chip: 'grad-lime text-white shadow-lime-500/30',      text: 'text-lime-600 dark:text-lime-400' },
}

/** Animated stat counter — counts up when scrolled into view. Colorful gradient chip + tone bar. */
export function StatCounter({
  value,
  suffix = '',
  label,
  icon,
  tone = 'emerald',
}: {
  value: number
  suffix?: string
  label: string
  icon?: React.ReactNode
  tone?: Tone
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const [display, setDisplay] = useState(0)
  const t = TONE_CLS[tone]
  const { lang } = useUI()

  useEffect(() => {
    if (!inView) return
    const duration = 1400
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(value * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, value])

  return (
    <div
      ref={ref}
      className="pop-hover relative flex flex-col items-center gap-1.5 overflow-hidden rounded-2xl border bg-card p-6 pt-7 text-center shadow-sm"
    >
      {/* tone top bar */}
      <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${t.bar}`} />
      {icon && (
        <span
          className={`mb-1 flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-md ${t.chip}`}
        >
          {icon}
        </span>
      )}
      <span className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${t.text}`}>
        {lang === 'bn' ? digitsBn(display.toLocaleString('en-IN')) : display.toLocaleString('en-IN')}
        {suffix}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}

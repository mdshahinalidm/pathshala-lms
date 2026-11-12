'use client'

/**
 * Percentage ↔ GPA converter (SSC/HSC 5.00 scale).
 * Two-way: marks % → GPA via the official table; GPA → approximate marks
 * via anchor interpolation.
 */

import { useMemo, useState } from 'react'
import { ArrowRightLeft, Percent, Sigma } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SectionHeading } from '@/components/shared/section-heading'
import { useUI } from '@/store/ui-store'

type Mode = 'toGpa' | 'toPercent'

/** grade table (same as GPA calculator) */
function gpaOf(marks: number): number {
  if (marks >= 80) return 5.0
  if (marks >= 70) return 4.0
  if (marks >= 60) return 3.5
  if (marks >= 50) return 3.0
  if (marks >= 40) return 2.0
  if (marks >= 33) return 1.0
  return 0.0
}

/** anchors [gpa, approxMarks] for the inverse direction */
const ANCHORS: Array<[number, number]> = [
  [0, 0],
  [1, 36],
  [2, 45],
  [3, 55],
  [3.5, 65],
  [4, 75],
  [5, 90],
]

function marksOf(gpa: number): number {
  const g = Math.min(Math.max(gpa, 0), 5)
  for (let i = 1; i < ANCHORS.length; i++) {
    const [g1, m1] = ANCHORS[i]
    const [g0, m0] = ANCHORS[i - 1]
    if (g <= g1) {
      const t = g1 === g0 ? 0 : (g - g0) / (g1 - g0)
      return m0 + t * (m1 - m0)
    }
  }
  return 90
}

export default function PercentageGpaView() {
  const { tx } = useUI()
  const [mode, setMode] = useState<Mode>('toGpa')
  const [value, setValue] = useState('')

  const result = useMemo(() => {
    const n = parseFloat(value)
    if (!Number.isFinite(n)) return null
    if (mode === 'toGpa') {
      if (n < 0 || n > 100) return null
      return { label: 'GPA', out: gpaOf(n).toFixed(2), hint: n < 33 ? tx('ফেল করেছেন (৩৩-এর নিচে)', 'Failed (below 33)') : undefined }
    }
    if (n < 0 || n > 5) return null
    return { label: tx('শতকরা (আনুমানিক)', 'Percentage (approx)'), out: `${marksOf(n).toFixed(1)}%`, hint: undefined }
  }, [value, mode, tx])

  return (
    <div className="mx-auto w-full max-w-2xl px-3.5 py-8 sm:py-12">
      <SectionHeading
        title={tx('শতকরা ↔ GPA কনভার্টার', 'Percentage ↔ GPA Converter')}
        subtitle={tx('শতকরা নম্বর থেকে GPA, অথবা GPA থেকে আনুমানিক শতকরা — দুই দিকেই কনভার্ট করুন।', 'Convert marks percentage to GPA, or GPA to approximate percentage — both directions.')}
      />

      <div className="mt-8 rounded-2xl border bg-card p-5 shadow-sm">
        {/* Mode switch */}
        <div className="flex justify-center">
          <div className="inline-flex rounded-full border bg-muted p-1" role="tablist" aria-label={tx('কনভার্সন দিক', 'Conversion direction')}>
            <Button
              role="tab"
              aria-selected={mode === 'toGpa'}
              variant={mode === 'toGpa' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('toGpa')}
              className="h-8 gap-1.5 rounded-full text-xs"
            >
              <Percent className="h-3.5 w-3.5" aria-hidden />
              {tx('শতকরা → GPA', '% → GPA')}
            </Button>
            <Button
              role="tab"
              aria-selected={mode === 'toPercent'}
              variant={mode === 'toPercent' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('toPercent')}
              className="h-8 gap-1.5 rounded-full text-xs"
            >
              <Sigma className="h-3.5 w-3.5" aria-hidden />
              {tx('GPA → শতকরা', 'GPA → %')}
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <Label htmlFor="conv-input" className="text-sm font-semibold">
            {mode === 'toGpa' ? tx('শতকরা নম্বর (০-১০০)', 'Percentage (0-100)') : tx('GPA (০-৫.০০)', 'GPA (0-5.00)')}
          </Label>
          <Input
            id="conv-input"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))}
            placeholder={mode === 'toGpa' ? 'যেমন: 73' : 'যেমন: 4.50'}
            className="mt-1.5 h-12 text-lg"
          />
        </div>

        {/* Result */}
        <div
          className={`mt-6 rounded-2xl p-5 text-white shadow-lg transition-colors ${
            mode === 'toGpa' ? 'grad-amber shadow-amber-500/25' : 'grad-cyan shadow-cyan-500/25'
          }`}
          aria-live="polite"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{tx('ফলাফল', 'Result')}</p>
          <p className="mt-1 text-4xl font-black tabular-nums">
            {result ? `${result.out} ${mode === 'toGpa' ? '' : ''}` : '—'}
            {result && mode === 'toGpa' && <span className="ml-2 text-lg font-bold">{result.label}</span>}
          </p>
          {result?.hint && <p className="mt-2 text-xs font-medium text-white/85">⚠️ {result.hint}</p>}
          {!result && value !== '' && (
            <p className="mt-2 text-xs font-medium text-white/85">
              {mode === 'toGpa' ? tx('০ থেকে ১০০-এর মধ্যে লিখুন', 'Enter a value between 0 and 100') : tx('০ থেকে ৫.০০-এর মধ্যে লিখুন', 'Enter a value between 0 and 5.00')}
            </p>
          )}
        </div>

        {/* Reference table */}
        <div className="mt-6 overflow-hidden rounded-xl border text-xs">
          <table className="w-full">
            <caption className="sr-only">{tx('রেফারেন্স তালিকা', 'Reference table')}</caption>
            <thead>
              <tr className="bg-muted/60 text-left">
                <th className="px-3 py-2 font-semibold">{tx('নম্বর', 'Marks')}</th>
                <th className="px-3 py-2 font-semibold">GPA</th>
                <th className="px-3 py-2 font-semibold">{tx('গ্রেড', 'Grade')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                ['80-100', '5.00', 'A+'],
                ['70-79', '4.00', 'A'],
                ['60-69', '3.50', 'A-'],
                ['50-59', '3.00', 'B'],
                ['40-49', '2.00', 'C'],
                ['33-39', '1.00', 'D'],
                ['0-32', '0.00', 'F'],
              ].map(([m, p, g]) => (
                <tr key={m}>
                  <td className="px-3 py-1.5 tabular-nums">{m}</td>
                  <td className="px-3 py-1.5 tabular-nums font-bold text-primary">{p}</td>
                  <td className="px-3 py-1.5 font-semibold">{g}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <ArrowRightLeft className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          {tx(
            'GPA → শতকরা রূপান্তরটি আনুমানিক (গ্রেড ব্যাপ্তির মধ্যমা অনুযায়ী)। বোর্ডের অফিসিয়াল ফলাফলই চূড়ান্ত।',
            'GPA → percentage is approximate (midpoint of grade bands). Official board results always prevail.'
          )}
        </p>
      </div>
    </div>
  )
}

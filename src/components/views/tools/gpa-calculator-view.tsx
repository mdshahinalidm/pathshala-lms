'use client'

/**
 * GPA Calculator (SSC/HSC Bangladeshi grading)
 * Enter marks per subject → instant grade point + letter + final GPA.
 */

import { useMemo, useState } from 'react'
import { Calculator, Plus, Trash2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SectionHeading } from '@/components/shared/section-heading'
import { useUI } from '@/store/ui-store'

interface Row {
  id: number
  marks: string
}

/** Bangladesh SSC/HSC grade table */
function gradeOf(marks: number): { point: number; letter: string } {
  if (marks >= 80) return { point: 5.0, letter: 'A+' }
  if (marks >= 70) return { point: 4.0, letter: 'A' }
  if (marks >= 60) return { point: 3.5, letter: 'A-' }
  if (marks >= 50) return { point: 3.0, letter: 'B' }
  if (marks >= 40) return { point: 2.0, letter: 'C' }
  if (marks >= 33) return { point: 1.0, letter: 'D' }
  return { point: 0.0, letter: 'F' }
}

function overallLetter(gpa: number): string {
  if (gpa >= 5) return 'A+'
  if (gpa >= 4) return 'A'
  if (gpa >= 3.5) return 'A-'
  if (gpa >= 3) return 'B'
  if (gpa >= 2) return 'C'
  if (gpa >= 1) return 'D'
  return 'F'
}

const ROW_TONES = ['border-emerald-500/30', 'border-violet-500/30', 'border-amber-500/30', 'border-rose-500/30', 'border-cyan-500/30', 'border-orange-500/30']

let nextId = 7

export default function GpaCalculatorView() {
  const { tx } = useUI()
  const [rows, setRows] = useState<Row[]>([
    { id: 1, marks: '' },
    { id: 2, marks: '' },
    { id: 3, marks: '' },
    { id: 4, marks: '' },
    { id: 5, marks: '' },
    { id: 6, marks: '' },
  ])

  const parsed = useMemo(
    () =>
      rows.map((r) => {
        const n = parseFloat(r.marks)
        return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null
      }),
    [rows]
  )
  const filled = parsed.filter((n): n is number => n !== null)
  const hasFail = filled.some((n) => n < 33)
  // Board rule: any F (below 33) fails the exam → GPA 0.00
  const gpa = filled.length === 0 ? null : hasFail ? 0 : filled.reduce((s, n) => s + gradeOf(n).point, 0) / filled.length

  const update = (id: number, marks: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, marks: marks.replace(/[^\d.]/g, '').slice(0, 5) } : r)))
  const addRow = () => setRows((rs) => [...rs, { id: nextId++, marks: '' }])
  const removeRow = (id: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs))
  const reset = () => setRows((rs) => rs.map((r) => ({ ...r, marks: '' })))

  return (
    <div className="mx-auto w-full max-w-4xl px-3.5 py-8 sm:py-12">
      <SectionHeading
        title={tx('GPA ক্যালকুলেটর', 'GPA Calculator')}
        subtitle={tx('প্রতিটি বিষয়ের নম্বর লিখুন — GPA সাথে সাথে হিসাব হবে (SSC/HSC গ্রেডিং সিস্টেম)।', 'Enter each subject marks — GPA updates instantly (SSC/HSC grading).')}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Subject rows */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Calculator className="h-4 w-4 text-primary" aria-hidden />
              {tx('বিষয়সমূহ', 'Subjects')}
            </h2>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={addRow} className="h-8 gap-1 rounded-lg text-xs">
                <Plus className="h-3.5 w-3.5" aria-hidden /> {tx('বিষয়', 'Subject')}
              </Button>
              <Button variant="ghost" size="sm" onClick={reset} className="h-8 gap-1 rounded-lg text-xs">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {tx('রিসেট', 'Reset')}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {rows.map((r, i) => {
              const n = parsed[i]
              const g = n !== null ? gradeOf(n) : null
              return (
                <div key={r.id} className={`flex items-center gap-2.5 rounded-xl border bg-muted/30 p-2.5 ${ROW_TONES[i % ROW_TONES.length]}`}>
                  <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`marks-${r.id}`} className="sr-only">
                      {tx('নম্বর', 'Marks')} {i + 1}
                    </Label>
                    <Input
                      id={`marks-${r.id}`}
                      inputMode="decimal"
                      value={r.marks}
                      onChange={(e) => update(r.id, e.target.value)}
                      placeholder={tx('নম্বর (০-১০০)', 'Marks (0-100)')}
                      className="h-9 border-none bg-transparent shadow-none focus-visible:ring-1"
                    />
                  </div>
                  {g && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                      {g.letter} · {g.point.toFixed(2)}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(r.id)}
                    disabled={rows.length <= 1}
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`${tx('মুছুন', 'Remove')} ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Result */}
        <div className="lg:sticky lg:top-24">
          <div className="grad-brand rounded-2xl p-5 text-white shadow-lg shadow-emerald-500/25">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{tx('আপনার GPA', 'Your GPA')}</p>
            <p className="mt-1 text-5xl font-black tabular-nums">{gpa !== null ? gpa.toFixed(2) : '—'}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold backdrop-blur">
                {gpa !== null ? `${tx('গ্রেড', 'Grade')}: ${overallLetter(hasFail ? 0 : gpa)}` : tx('নম্বর লিখুন', 'Enter marks')}
              </span>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-white/75">
              {filled.length} {tx('টি বিষয় গণনায় আছে', 'subjects counted')}
              {hasFail && ` · ${tx('⚠️ একটি বিষয়ে F — বোর্ড নিয়মে GPA 0.00', '⚠️ An F grade makes GPA 0.00 (board rule)')}`}
            </p>
          </div>

          {/* Grade table */}
          <div className="mt-4 overflow-hidden rounded-2xl border bg-card text-xs shadow-sm">
            <table className="w-full">
              <caption className="sr-only">{tx('গ্রেড তালিকা', 'Grade table')}</caption>
              <thead>
                <tr className="bg-muted/60 text-left">
                  <th className="px-3 py-2 font-semibold">{tx('নম্বর', 'Marks')}</th>
                  <th className="px-3 py-2 font-semibold">{tx('গ্রেড', 'Grade')}</th>
                  <th className="px-3 py-2 font-semibold">{tx('পয়েন্ট', 'Point')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  ['80-100', 'A+', '5.00'],
                  ['70-79', 'A', '4.00'],
                  ['60-69', 'A-', '3.50'],
                  ['50-59', 'B', '3.00'],
                  ['40-49', 'C', '2.00'],
                  ['33-39', 'D', '1.00'],
                  ['0-32', 'F', '0.00'],
                ].map(([m, g, p]) => (
                  <tr key={m}>
                    <td className="px-3 py-1.5 tabular-nums">{m}</td>
                    <td className="px-3 py-1.5 font-bold text-primary">{g}</td>
                    <td className="px-3 py-1.5 tabular-nums">{p}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

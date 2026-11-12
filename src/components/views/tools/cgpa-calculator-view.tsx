'use client'

/**
 * CGPA ক্যালকুলেটর — জাতীয় বিশ্ববিদ্যালয় (NU) ফরম্যাট।
 *
 * দুটি মোড:
 *  1) "জাতীয় বিশ্ববিদ্যালয়" (ডিফল্ট) — প্রোগ্রাম → বিভাগ → বর্ষ ক্যাসকেডিং
 *     সিলেক্টের মাধ্যমে কোর্স তালিকা লোড হয়; প্রতি কোর্সে গ্রেড বসিয়ে
 *     "CGPA ক্যালকুলেট করুন" চাপলে ফলাফল মডালে দেখা যায়।
 *  2) "কাস্টম" — নিজের কোর্স/ক্রেডিট/পয়েন্ট যোগ করে হিসাব (আগের টুল)।
 */

import { Fragment, useMemo, useState } from 'react'
import { Calculator, Plus, Trash2, RotateCcw, GraduationCap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUI } from '@/store/ui-store'
import { digitsBn } from '@/lib/format'
import {
  NU_PROGRAMS,
  NU_GRADING,
  pointOf,
  type NuCourse,
  type NuYearData,
} from '@/lib/nu-cgpa-data'

/* ---------------- shared helpers ---------------- */

function letterOf4(cgpa: number): string {
  if (cgpa >= 3.75) return 'A+'
  if (cgpa >= 3.5) return 'A'
  if (cgpa >= 3.25) return 'A-'
  if (cgpa >= 3.0) return 'B+'
  if (cgpa >= 2.75) return 'B'
  if (cgpa >= 2.5) return 'B-'
  if (cgpa >= 2.25) return 'C+'
  if (cgpa >= 2.0) return 'C'
  if (cgpa >= 1.0) return 'D'
  return 'F'
}

/** এক গুচ্ছ কোর্স (name, credit, grade) থেকে GPA */
function gpaOf(rows: { course: NuCourse; grade?: string }[]): { gpa: number | null; credits: number; graded: number; total: number } {
  let credits = 0
  let weighted = 0
  let graded = 0
  for (const r of rows) {
    if (!r.grade) continue
    const p = pointOf(r.grade)
    credits += r.course.credits
    weighted += r.course.credits * p
    graded++
  }
  return { gpa: credits > 0 ? weighted / credits : null, credits, graded, total: rows.length }
}

/* ------------------------------------------------------------------ */
/* NU মোড                                                              */
/* ------------------------------------------------------------------ */

interface YearResult {
  yearBn: string
  yearEn: string
  gpa: number
  credits: number
}

function NuCalculator() {
  const { t, tx, lang } = useUI()
  const [programId, setProgramId] = useState<string>('')
  const [deptId, setDeptId] = useState<string>('')
  const [yearIdx, setYearIdx] = useState<string>('') // index as string
  const [grades, setGrades] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [resultOpen, setResultOpen] = useState(false)
  /** একই program:dept-এ প্রতি বর্ষের হিসাব — CGPA দেখানোর জন্য */
  const [yearResults, setYearResults] = useState<Record<string, YearResult[]>>({})

  const program = NU_PROGRAMS.find((p) => p.id === programId)
  const dept = program?.depts.find((d) => d.id === deptId)
  const year: NuYearData | undefined = dept?.years[Number(yearIdx)]

  /** বর্তমান বর্ষের ফ্ল্যাট কোর্স তালিকা (core + optional) */
  const rows: { key: string; course: NuCourse; optional: boolean }[] = []
  if (year) {
    year.courses.forEach((c, i) => rows.push({ key: `c${i}`, course: c, optional: false }))
    year.optional?.courses.forEach((c, i) => rows.push({ key: `o${i}`, course: c, optional: true }))
  }
  const firstOptionalIdx = rows.findIndex((r) => r.optional)

  const live = gpaOf(rows.map((r) => ({ course: r.course, grade: grades[r.key] })))

  const selectProgram = (v: string) => {
    setProgramId(v)
    setDeptId('')
    setYearIdx('')
    setError('')
  }
  const selectDept = (v: string) => {
    setDeptId(v)
    setYearIdx('')
    setError('')
  }
  const selectYear = (v: string) => {
    setYearIdx(v)
    setError('')
  }
  const setGrade = (key: string, grade: string) => {
    setGrades((g) => ({ ...g, [key]: grade }))
    setError('')
  }
  const resetAll = () => {
    setGrades({})
    setError('')
    if (programId && deptId) {
      setYearResults((rs) => {
        const copy = { ...rs }
        delete copy[`${programId}:${deptId}`]
        return copy
      })
    }
  }

  const calculate = () => {
    if (!year) {
      setError(tx('প্রথমে প্রোগ্রাম, বিভাগ ও বর্ষ নির্বাচন করুন।', 'Select program, department and year first.'))
      return
    }
    if (live.graded === 0 || live.gpa === null) {
      setError(tx('অন্তত একটি কোর্সের গ্রেড নির্বাচন করুন।', 'Select the grade of at least one course.'))
      return
    }
    const storeKey = `${programId}:${deptId}`
    const entry: YearResult = {
      yearBn: year.bn,
      yearEn: year.en,
      gpa: live.gpa,
      credits: live.credits,
    }
    const prev = (yearResults[storeKey] || []).filter((r) => r.yearEn !== year.en)
    setYearResults((rs) => ({ ...rs, [storeKey]: [...prev, entry] }))
    setResultOpen(true)
  }

  const allYears = programId && deptId ? yearResults[`${programId}:${deptId}`] || [] : []
  const cgpa =
    allYears.length > 0
      ? allYears.reduce((s, y) => s + y.gpa * y.credits, 0) / allYears.reduce((s, y) => s + y.credits, 0)
      : null

  const resultTitle = program && dept && year ? `${program.id} - ${lang === 'bn' ? dept.bn : dept.en} (${year.en})` : ''

  return (
    <div className="mt-6">
      {/* ---- ক্যাসকেডিং সিলেক্ট (প্রোগ্রাম → বিভাগ → বর্ষ) ---- */}
      <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label={tx('প্রোগ্রাম, বিভাগ ও বর্ষ নির্বাচন', 'Program, department and year selection')}>
        <div>
          <Label htmlFor="nu-program" className="sr-only">{tx('প্রোগ্রাম নির্বাচন করুন', 'Select program')}</Label>
          <Select value={programId} onValueChange={selectProgram}>
            <SelectTrigger id="nu-program" className="h-11 w-full bg-card">
              <SelectValue placeholder={tx('প্রোগ্রাম নির্বাচন করুন', 'Select program')} />
            </SelectTrigger>
            <SelectContent>
              {NU_PROGRAMS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {lang === 'bn' ? p.bn : p.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="nu-dept" className="sr-only">{tx('বিভাগ নির্বাচন করুন', 'Select department')}</Label>
          <Select value={deptId} onValueChange={selectDept} disabled={!program}>
            <SelectTrigger id="nu-dept" className="h-11 w-full bg-card">
              <SelectValue placeholder={tx('বিভাগ নির্বাচন করুন', 'Select department')} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {program?.depts.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {lang === 'bn' ? d.bn : d.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="nu-year" className="sr-only">{tx('ইয়ার নির্বাচন করুন', 'Select year')}</Label>
          <Select value={yearIdx} onValueChange={selectYear} disabled={!dept}>
            <SelectTrigger id="nu-year" className="h-11 w-full bg-card">
              <SelectValue placeholder={tx('ইয়ার নির্বাচন করুন', 'Select year')} />
            </SelectTrigger>
            <SelectContent>
              {dept?.years.map((y, i) => (
                <SelectItem key={y.en} value={String(i)}>
                  {lang === 'bn' ? y.bn : y.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ---- কোর্স টেবিল ---- */}
      {year && (
        <div className="mt-5 overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">{tx('কোর্স ও গ্রেড তালিকা', 'Course and grade list')}</caption>
              <thead>
                <tr className="border-b bg-muted/50 text-xs font-bold text-foreground">
                  <th scope="col" className="px-4 py-3 text-left">{tx('বিষয়', 'Subject')}</th>
                  <th scope="col" className="w-28 px-2 py-3 text-center">{tx('গ্রেড', 'Grade')}</th>
                  <th scope="col" className="w-24 px-2 py-3 text-center">{tx('গ্রেড পয়েন্ট', 'Grade Point')}</th>
                  <th scope="col" className="w-28 px-2 py-3 text-center">{tx('ক্রেডিট পয়েন্ট', 'Credit Points')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <Fragment key={r.key}>
                    {i === firstOptionalIdx && year?.optional && (
                      <tr className="border-b bg-accent/40">
                        <td colSpan={4} className="px-4 py-2 text-xs font-bold text-foreground/80">
                          {lang === 'bn'
                            ? year.optional.bn
                            : year.optional.en || year.optional.bn}
                        </td>
                      </tr>
                    )}
                    <tr className={`border-b last:border-b-0 ${r.optional ? 'bg-muted/20' : ''}`}>
                      <td className="px-4 py-2.5">
                        {r.course.name}
                        {r.course.code && <span className="ml-1.5 text-xs text-muted-foreground">({r.course.code})</span>}
                      </td>
                      <td className="px-2 py-2">
                        <Select value={grades[r.key] ?? ''} onValueChange={(v) => setGrade(r.key, v)}>
                          <SelectTrigger className="h-9 w-full" aria-label={`${r.course.name} — ${tx('গ্রেড', 'grade')}`}>
                            <SelectValue placeholder={tx('গ্রেড', 'Grade')} />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            {NU_GRADING.map((g) => (
                              <SelectItem key={g.grade} value={g.grade}>
                                {g.grade}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2 text-center font-semibold tabular-nums">
                        {grades[r.key] !== undefined ? pointOf(grades[r.key]).toFixed(2) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums">{lang === 'bn' ? digitsBn(r.course.credits) : r.course.credits}</td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- লাইভ সারাংশ + ত্রুটি + বাটন ---- */}
      <div className="mt-4 flex flex-col items-center gap-3">
        {live.graded > 0 && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {tx('নির্বাচিত', 'Graded')} {lang === 'bn' ? digitsBn(live.graded) : live.graded}/{lang === 'bn' ? digitsBn(live.total) : live.total} ·{' '}
            {tx('বর্তমান GPA', 'Current GPA')}: <strong className="tabular-nums">{live.gpa?.toFixed(2)}</strong> ({letterOf4(live.gpa ?? 0)})
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
        {year && (
          <Button size="lg" onClick={calculate} className="h-11 rounded-full px-8 text-base font-bold shadow-lg shadow-primary/25">
            <Calculator className="mr-2 h-4 w-4" aria-hidden />
            {tx('CGPA ক্যালকুলেট করুন', 'Calculate CGPA')}
          </Button>
        )}
        {allYears.length > 0 && (
          <Button variant="ghost" size="sm" onClick={resetAll} className="h-8 gap-1.5 rounded-lg text-xs">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            {tx('এই বিভাগের সব ফলাফল রিসেট', 'Reset all results for this department')}
          </Button>
        )}
      </div>

      {/* ---- ফলাফল মডাল ---- */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader className="items-center text-center sm:text-center">
            <DialogTitle className="flex flex-col items-center gap-1">
              <span className="grad-brand flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-md shadow-emerald-500/30">
                <GraduationCap className="h-6 w-6" aria-hidden />
              </span>
              <span className="grad-text-brand mt-1 text-xl font-bold">{t('brand')}</span>
              <span className="text-lg font-bold">{tx('আপনার ফলাফল', 'Your Result')}</span>
              <span className="text-sm font-medium text-muted-foreground">{resultTitle}</span>
              <Badge className="mt-1 bg-emerald-600 px-4 py-1.5 text-base font-bold hover:bg-emerald-600">
                {tx('GPA', 'GPA')}: {live.gpa?.toFixed(2)}
              </Badge>
              {cgpa !== null && allYears.length > 1 && (
                <Badge variant="outline" className="mt-1 border-primary/40 px-4 py-1.5 text-base font-bold text-primary">
                  {tx('সম্মিলিত CGPA', 'Overall CGPA')}: {cgpa.toFixed(2)}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">{tx('কোর্সভিত্তিক ফলাফল বিবরণ', 'Course-wise result details')}</DialogDescription>
          </DialogHeader>

          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs font-bold">
                  <th scope="col" className="px-3 py-2 text-left">{tx('বিষয়', 'Subject')}</th>
                  <th scope="col" className="w-16 px-2 py-2 text-center">{tx('গ্রেড', 'Grade')}</th>
                  <th scope="col" className="w-20 px-2 py-2 text-center">{tx('গ্রেড পয়েন্ট', 'Grade Point')}</th>
                  <th scope="col" className="w-20 px-2 py-2 text-center">{tx('মোট পয়েন্ট', 'Total Points')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const g = grades[r.key]
                  if (!g) return null
                  const p = pointOf(g)
                  return (
                    <tr key={r.key} className="border-b last:border-b-0">
                      <td className="px-3 py-2">
                        {r.course.name}
                        {r.course.code && <span className="ml-1.5 text-xs text-muted-foreground">({r.course.code})</span>}
                      </td>
                      <td className="px-2 py-2 text-center font-bold">{g}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{p.toFixed(2)}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{lang === 'bn' ? digitsBn(p * r.course.credits) : (p * r.course.credits).toFixed(2)}</td>
                    </tr>
                  )
                })}
                <tr className="bg-muted/50 font-bold">
                  <td className="px-3 py-2">{tx('মোট', 'Total')}</td>
                  <td />
                  <td className="px-2 py-2 text-center tabular-nums">{live.gpa?.toFixed(2)}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{lang === 'bn' ? digitsBn(live.credits) : live.credits}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* বহু-বর্ষ CGPA ব্রেকডাউন */}
          {allYears.length > 1 && (
            <div className="mt-3 overflow-hidden rounded-xl border">
              <p className="border-b bg-primary/5 px-3 py-2 text-xs font-bold">{tx('বর্ষভিত্তিক ফলাফল (এই বিভাগ)', 'Year-wise results (this department)')}</p>
              <table className="w-full text-sm">
                <tbody>
                  {allYears.map((y) => (
                    <tr key={y.yearEn} className="border-b last:border-b-0">
                      <td className="px-3 py-2">{lang === 'bn' ? y.yearBn : y.yearEn}</td>
                      <td className="px-2 py-2 text-right text-xs text-muted-foreground">
                        {tx('ক্রেডিট', 'Credits')}: {lang === 'bn' ? digitsBn(y.credits) : y.credits}
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">{y.gpa.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/50 font-bold">
                    <td className="px-3 py-2">{tx('সম্মিলিত CGPA', 'Overall CGPA')}</td>
                    <td />
                    <td className="px-3 py-2 text-right tabular-nums">{cgpa?.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-1 text-center text-xs text-muted-foreground">
            {tx(
              'পরের বর্ষ হিসাব করলে সম্মিলিত CGPA স্বয়ংক্রিয়ভাবে যুক্ত হবে।',
              'Calculate other years to combine them into the overall CGPA.'
            )}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* কাস্টম মোড (আগের টুল — সংরক্ষিত)                                     */
/* ------------------------------------------------------------------ */

interface Row {
  id: number
  course: string
  credits: string
  point: string
}

const POINTS = NU_GRADING.map((g) => g.point.toFixed(2))

let nextId = 9

function CustomCgpaForm() {
  const { tx } = useUI()
  const [rows, setRows] = useState<Row[]>([
    { id: 1, course: '', credits: '3', point: '' },
    { id: 2, course: '', credits: '3', point: '' },
    { id: 3, course: '', credits: '3', point: '' },
    { id: 4, course: '', credits: '3', point: '' },
  ])

  const calc = useMemo(() => {
    let credits = 0
    let weighted = 0
    for (const r of rows) {
      const c = parseFloat(r.credits)
      const p = parseFloat(r.point)
      if (Number.isFinite(c) && c > 0 && Number.isFinite(p)) {
        credits += c
        weighted += c * p
      }
    }
    return { credits, cgpa: credits > 0 ? weighted / credits : null }
  }, [rows])

  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const addRow = () => setRows((rs) => [...rs, { id: nextId++, course: '', credits: '3', point: '' }])
  const removeRow = (id: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs))
  const reset = () => setRows((rs) => rs.map((r) => ({ ...r, course: '', credits: '3', point: '' })))

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Calculator className="h-4 w-4 text-primary" aria-hidden />
            {tx('কোর্সসমূহ', 'Courses')}
          </h3>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={addRow} className="h-8 gap-1 rounded-lg text-xs">
              <Plus className="h-3.5 w-3.5" aria-hidden /> {tx('কোর্স', 'Course')}
            </Button>
            <Button variant="ghost" size="sm" onClick={reset} className="h-8 gap-1 rounded-lg text-xs">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {tx('রিসেট', 'Reset')}
            </Button>
          </div>
        </div>

        <div className="hidden gap-2 px-1 pb-1 text-[11px] font-semibold text-muted-foreground sm:grid sm:grid-cols-[1fr_90px_120px_36px]">
          <span>{tx('কোর্সের নাম (ঐচ্ছিক)', 'Course name (optional)')}</span>
          <span>{tx('ক্রেডিট', 'Credits')}</span>
          <span>{tx('গ্রেড পয়েন্ট', 'Grade point')}</span>
          <span />
        </div>

        <div className="flex flex-col gap-2.5">
          {rows.map((r, i) => (
            <div key={r.id} className="grid gap-2 rounded-xl border bg-muted/30 p-2.5 sm:grid-cols-[1fr_90px_120px_36px] sm:items-center">
              <div>
                <Label htmlFor={`course-${r.id}`} className="sr-only">
                  {tx('কোর্স', 'Course')} {i + 1}
                </Label>
                <Input
                  id={`course-${r.id}`}
                  value={r.course}
                  onChange={(e) => update(r.id, { course: e.target.value.slice(0, 60) })}
                  placeholder={tx('যেমন: পরিসংখ্যান', 'e.g. Statistics')}
                  className="h-9"
                />
              </div>
              <div>
                <Label htmlFor={`credits-${r.id}`} className="sr-only">
                  {tx('ক্রেডিট', 'Credits')} {i + 1}
                </Label>
                <Input
                  id={`credits-${r.id}`}
                  inputMode="decimal"
                  value={r.credits}
                  onChange={(e) => update(r.id, { credits: e.target.value.replace(/[^\d.]/g, '').slice(0, 4) })}
                  placeholder="3"
                  className="h-9"
                />
              </div>
              <Select value={r.point} onValueChange={(v) => update(r.id, { point: v })}>
                <SelectTrigger className="h-9 w-full" aria-label={`${tx('গ্রেড পয়েন্ট', 'Grade point')} ${i + 1}`}>
                  <SelectValue placeholder={tx('পয়েন্ট', 'Point')} />
                </SelectTrigger>
                <SelectContent>
                  {POINTS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeRow(r.id)}
                disabled={rows.length <= 1}
                className="h-8 w-8 justify-self-end text-muted-foreground hover:text-destructive"
                aria-label={`${tx('মুছুন', 'Remove')} ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* ফলাফল */}
      <div className="lg:sticky lg:top-24">
        <div className="grad-violet rounded-2xl p-5 text-white shadow-lg shadow-violet-500/25">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{tx('আপনার CGPA', 'Your CGPA')}</p>
          <p className="mt-1 text-5xl font-black tabular-nums">{calc.cgpa !== null ? calc.cgpa.toFixed(2) : '—'}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold backdrop-blur">
              {calc.cgpa !== null ? `${tx('গ্রেড', 'Grade')}: ${letterOf4(calc.cgpa)}` : tx('তথ্য দিন', 'Enter data')}
            </span>
          </div>
          <p className="mt-3 text-[11px] text-white/75">
            {tx('মোট ক্রেডিট', 'Total credits')}: <strong className="tabular-nums">{calc.credits > 0 ? calc.credits : '—'}</strong>
          </p>
        </div>

        <div className="mt-4 rounded-2xl border bg-card p-4 text-xs leading-relaxed text-muted-foreground shadow-sm">
          <p className="font-semibold text-foreground">{tx('গ্রেড পয়েন্ট নির্দেশিকা', 'Grade point guide')}</p>
          <p className="mt-1.5">A+ 4.00 · A 3.75 · A- 3.50 · B+ 3.25 · B 3.00 · B- 2.75 · C+ 2.50 · C 2.25 · D 2.00 · F 0.00</p>
          <p className="mt-2">{tx('জাতীয় বিশ্ববিদ্যালয়ের ৪.০০ স্কেল অনুসারে।', 'As per the National University 4.00 scale.')}</p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* মূল ভিউ                                                             */
/* ------------------------------------------------------------------ */

export default function CgpaCalculatorView() {
  const { t, tx } = useUI()
  const [mode, setMode] = useState<'nu' | 'custom'>('nu')

  return (
    <div className="mx-auto w-full max-w-4xl px-3.5 py-8 sm:py-12">
      <SectionHeadingCenter
        title={tx('জাতীয় বিশ্ববিদ্যালয় CGPA ক্যালকুলেটর', 'National University CGPA Calculator')}
        subtitle={tx(
          'প্রোগ্রাম, বিভাগ ও বর্ষ নির্বাচন করে কোর্সের গ্রেড বসান — সাথে সাথে বর্ষের GPA ও সম্মিলিত CGPA দেখুন।',
          'Pick program, department and year, enter course grades — get yearly GPA and combined CGPA instantly.'
        )}
      />

      {/* মোড ট্যাব */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'nu' | 'custom')} className="mt-5">
        <TabsList className="mx-auto flex">
          <TabsTrigger value="nu" className="gap-1.5">
            <GraduationCap className="h-4 w-4" aria-hidden />
            {tx('জাতীয় বিশ্ববিদ্যালয়', 'National University')}
          </TabsTrigger>
          <TabsTrigger value="custom">{tx('কাস্টম হিসাব', 'Custom')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === 'nu' ? <NuCalculator /> : <CustomCgpaForm />}

      {/* ---- গ্রেডিং সিস্টেম টেবিল ---- */}
      <section className="mt-10" aria-labelledby="nu-grading-heading">
        <h2 id="nu-grading-heading" className="text-center text-xl font-bold sm:text-2xl">
          {tx('National University Bangladesh Grading System', 'National University Bangladesh Grading System')}
        </h2>
        <div className="mx-auto mt-4 max-w-2xl overflow-hidden rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs font-bold">
                <th scope="col" className="px-4 py-3 text-center">{tx('গ্রেড', 'Grade')}</th>
                <th scope="col" className="px-4 py-3 text-center">{tx('গ্রেড পয়েন্ট', 'Grade Point')}</th>
                <th scope="col" className="px-4 py-3 text-center">{tx('মার্কস রেঞ্জ', 'Marks Range')}</th>
              </tr>
            </thead>
            <tbody>
              {NU_GRADING.map((g) => (
                <tr key={g.grade} className="border-b last:border-b-0">
                  <td className="px-4 py-2.5 text-center font-bold">{g.grade}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums">{g.point.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-center text-muted-foreground">{g.range}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ব্যবহার নির্দেশিকা */}
        <div className="mx-auto mt-6 max-w-2xl rounded-2xl border bg-card p-4 text-sm leading-relaxed text-muted-foreground shadow-sm sm:p-5">
          <h3 className="text-sm font-bold text-foreground">{tx('কীভাবে ব্যবহার করবেন?', 'How to use?')}</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>{tx('প্রোগ্রাম নির্বাচন করুন — BSc, BA, BSS বা BBA।', 'Select a program — BSc, BA, BSS or BBA.')}</li>
            <li>{tx('আপনার বিভাগ ও বর্ষ নির্বাচন করুন।', 'Choose your department and year.')}</li>
            <li>{tx('প্রতিটি কোর্সের পাশে গ্রেড নির্বাচন করুন।', 'Select the grade beside each course.')}</li>
            <li>{tx('"CGPA ক্যালকুলেট করুন" চাপলে ফলাফল মডালে GPA দেখা যাবে।', 'Press "Calculate CGPA" to see the result in a modal.')}</li>
            <li>{tx('প্রতিটি বর্ষ হিসাব করলে সম্মিলিত CGPA দেখা যাবে।', 'Calculate each year to build the overall CGPA.')}</li>
          </ol>
          <p className="mt-3 text-xs">
            {tx(
              'গ্রেডিং: জাতীয় বিশ্ববিদ্যালয়ের অনুমোদিত ৪.০০ স্কেল। কোর্স তালিকা প্রচলিত অনার্স পাঠ্যক্রমের ভিত্তিতে; ক্যালকুলেটর ফরম্যুলা: Σ(ক্রেডিট × পয়েন্ট) ÷ মোট ক্রেডিট।',
              'Grading follows the official NU 4.00 scale. Course lists follow the common honours curriculum; formula: Σ(credit × point) ÷ total credits.'
            )}
          </p>
        </div>
      </section>
    </div>
  )
}

/** কেন্দ্রীভূত শিরোনাম (SectionHeading-এর h1 সংস্করণ) */
function SectionHeadingCenter({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center">
      <span aria-hidden className="rainbow-bar mx-auto mb-3 block h-1.5 w-16 rounded-full" />
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {subtitle && (
        <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">{subtitle}</p>
      )}
    </div>
  )
}

'use client'

/**
 * AdminQuizzesView — shared manager for BOTH learning-assessment types:
 *   mode="QUIZ" → course practice quizzes  (admin/quizzes, courseId required)
 *   mode="EXAM" → live exams               (admin/exams,   courseId optional)
 *
 * Edit flow is fully prefilled: GET /api/quizzes/[id] (admin) returns the
 * stored questions incl. correctIndex; PUT keeps question ids (upsert), so
 * editing no longer requires re-typing the whole question bank.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ClipboardList,
  FileUp,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  ShieldX,
  Trash2,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import {
  BulkBar,
  DetailsDialog,
  RowBox,
  ScrollX,
  SelectAll,
  useBulkSelection,
  type DetailField,
} from '@/components/admin/data-tools'
import { DateStamp } from '@/components/admin/date-stamp'
import { fmtStampText } from '@/lib/format'
import { apiDelete, apiGet, apiPost, apiPut, apiSend } from '@/lib/api-client'
import { digitsBn, fmtDate } from '@/lib/format'
import { useAuth } from '@/store/auth-store'
import { go, useUI } from '@/store/ui-store'
import { useHashRoute } from '@/hooks/use-hash-route'
import { isPanelRole, isOwner } from '@/lib/roles'

type QuizMode = 'QUIZ' | 'EXAM'

interface QuizRow {
  id: string
  title: string
  description?: string | null
  type?: string
  durationMin: number
  questionCount: number
  imageUrl?: string | null // feature image shown in the admin list (like courses)
  createdAt?: string
  courseTitle?: string | null
  myBest?: number | null
}

interface CourseLite {
  id: string
  title: string
}

interface QuestionDraft {
  key: string
  id?: string // existing question id → PUT upsert keeps it
  text: string
  options: string[]
  correctIndex: number
}

interface QuizFormState {
  title: string
  description: string
  courseId: string
  durationMin: string
  isPublished: boolean
  imageUrl: string
}

const LETTERS_BN = ['ক', 'খ', 'গ', 'ঘ']

const BLANK_FORM: QuizFormState = {
  title: '',
  description: '',
  courseId: '',
  durationMin: '10',
  isPublished: true,
  imageUrl: '',
}

const newKey = () => Math.random().toString(36).slice(2, 10)

const blankQuestions = () => [{ key: newKey(), text: '', options: ['', '', '', ''], correctIndex: 0 }]

/* ── Bulk MCQ parsing (CSV / TSV / pipe rows, or Q:/A) blocks) ─────────────── */

interface ParsedMcq {
  text: string
  options: string[]
  correctIndex: number
}

interface BulkParseResult {
  items: ParsedMcq[]
  errors: string[]
}

/** Correct-answer token (A/B/C/D, a-d, 1-4, ক-ঘ) → 0-3, or -1 when unrecognised. */
function correctTokenToIndex(token: string): number {
  const s = token.trim().toLowerCase()
  if (!s) return -1
  if (/^[1-4]$/.test(s)) return Number(s) - 1
  const letters = ['a', 'b', 'c', 'd']
  const li = letters.indexOf(s)
  if (li >= 0) return li
  const bn = ['ক', 'খ', 'গ', 'ঘ']
  const bi = bn.indexOf(s)
  if (bi >= 0) return bi
  const m = s.match(/(?:option\s*)?([a-d])$/) // tolerate "ans. a", "option b"
  if (m) return letters.indexOf(m[1])
  const mb = s.match(/([ক-ঘ])$/) // tolerate "উত্তর: খ"
  if (mb) return bn.indexOf(mb[1])
  return -1
}

/** One CSV/TSV row splitter that respects double-quoted fields ("a,b" stays one cell). */
function splitSepLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQ = false
      } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === sep) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((f) => f.trim())
}

/** Pick the row separator from a sample line: tab beats pipe beats comma. */
function detectSep(line: string): string {
  if (line.includes('\t')) return '\t'
  if (line.includes('|')) return '|'
  return ','
}

const OPT_RE = /^\(?\s*([A-Da-dক-ঘ])\s*[).:ঃ]\s*(.+)$/ // "A) …", "a. …", "ক) …", "(b) …"
const Q_RE = /^(?:q|question|প্রশ্ন|প)\s*[:：]/i
const ANS_RE = /^(?:ans|answer|উত্তর|উ)\s*[:：]/i
const NUMQ_RE = /^\d{1,3}\s*[.):ঃ]\s*(.+)$/ // "1. …", "12) …"

/** Parse pasted/uploaded bulk text into MCQ drafts. Two accepted shapes: */
/**  ① one question per ROW: `question, optA, optB, optC, optD[, correct]` (CSV/TSV/pipe, quotes ok, optional header) */
/**  ② BLOCK: `Q: …` + `A) …` `B) …` `C) …` `D) …` + `Ans: A`  (Bengali markers প্রশ্ন:/ক)…/উত্তর: also ok) */
export function parseBulkMcq(raw: string): BulkParseResult {
  const items: ParsedMcq[] = []
  const errors: string[] = []
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())

  const isBlock = lines.some((l) => Q_RE.test(l) || ANS_RE.test(l))

  if (isBlock) {
    let cur: { text: string; options: (string | null)[]; correctIndex: number; n: number } | null = null
    let seen = 0
    const flush = () => {
      if (!cur) return
      const opts = cur.options.map((o) => (o ?? '').trim())
      const text = cur.text.trim()
      if (!text && opts.every((o) => !o)) {
        cur = null
        return // empty trailing block — ignore silently
      }
      seen++
      if (!text) errors.push(`#${cur.n}: ${'question text missing / প্রশ্নের লেখা নেই'}`)
      else if (opts.some((o) => !o)) errors.push(`#${cur.n}: all 4 options required / ৪টি অপশনই পূরণ করুন`)
      else items.push({ text, options: opts, correctIndex: cur.correctIndex })
      cur = null
    }
    for (const line of lines) {
      if (!line) continue
      if (Q_RE.test(line)) {
        flush()
        cur = { text: line.replace(Q_RE, '').trim(), options: [null, null, null, null], correctIndex: 0, n: seen + 1 }
        continue
      }
      const om = line.match(OPT_RE)
      if (om) {
        if (!cur) cur = { text: '', options: [null, null, null, null], correctIndex: 0, n: seen + 1 }
        const li = ['a', 'b', 'c', 'd'].indexOf(om[1].toLowerCase())
        const bi = ['ক', 'খ', 'গ', 'ঘ'].indexOf(om[1])
        const idx = li >= 0 ? li : bi
        if (idx >= 0 && idx < 4) cur.options[idx] = om[2]
        continue
      }
      if (ANS_RE.test(line)) {
        if (!cur) cur = { text: '', options: [null, null, null, null], correctIndex: 0, n: seen + 1 }
        const token = line.replace(ANS_RE, '')
        const ci = correctTokenToIndex(token)
        if (ci >= 0) cur.correctIndex = ci
        else errors.push(`#${cur.n}: unknown answer "${token.slice(0, 12)}" / উত্তর বোঝা যায়নি`)
        continue
      }
      const nm = line.match(NUMQ_RE)
      if (nm && !cur) {
        cur = { text: nm[1], options: [null, null, null, null], correctIndex: 0, n: seen + 1 }
        continue
      }
      if (cur) cur.text = cur.text ? `${cur.text}\n${line}` : line // multi-line question text
    }
    flush()
    return { items, errors }
  }

  // ── row format ──
  const content = lines.filter(Boolean)
  if (content.length && /^[\"']?(?:question|প্রশ্ন)[\"']?\s*[,|\t]/i.test(content[0])) content.shift() // header row
  content.forEach((line, i) => {
    const sep = detectSep(line)
    const f = splitSepLine(line, sep)
    if (f.length < 5) {
      errors.push(
        `#${i + 1}: needs 5-6 parts (${sep === '\t' ? 'TAB' : sep}) — got ${f.length} / অন্তত ৫টি অংশ দরকার`
      )
      return
    }
    const opts = f.slice(1, 5)
    if (!f[0]) {
      errors.push(`#${i + 1}: question text missing / প্রশ্নের লেখা নেই`)
      return
    }
    if (opts.some((o) => !o)) {
      errors.push(`#${i + 1}: all 4 options required / ৪টি অপশনই পূরণ করুন`)
      return
    }
    let correctIndex = 0
    if (f[5]) {
      const ci = correctTokenToIndex(f[5])
      if (ci >= 0) correctIndex = ci
      else errors.push(`#${i + 1}: unknown answer "${f[5].slice(0, 12)}" — using A / উত্তর A ধরা হয়েছে`)
    }
    items.push({ text: f[0], options: opts, correctIndex })
  })
  return { items, errors }
}

/** Contract guarantees no isPublished on list rows, but Prisma backends usually return it — read defensively. */
function rowPublished(q: QuizRow): boolean {
  const v = (q as { isPublished?: boolean }).isPublished
  return typeof v === 'boolean' ? v : true
}

function AccessDenied() {
  const { tx } = useUI()
  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldX className="h-7 w-7" />
        </span>
        <h2 className="text-lg font-semibold">{tx('প্রবেশাধিকার নেই', 'Access denied')}</h2>
        <p className="text-sm text-muted-foreground">
          {tx('এই পেজটি শুধুমাত্র অ্যাডমিনদের জন্য।', 'This page is for administrators only.')}
        </p>
        <Button className="mt-2" onClick={() => go('/login')}>
          {tx('লগইন করুন', 'Go to login')}
        </Button>
      </CardContent>
    </Card>
  )
}

export default function AdminQuizzesView({ mode = 'QUIZ' }: { mode?: QuizMode }) {
  const isExam = mode === 'EXAM'
  const nounBn = isExam ? 'এক্সাম' : 'কুইজ'
  const nounEn = isExam ? 'Exam' : 'Quiz'
  const { user, status, initialized } = useAuth()
  const { t, tx, lang } = useUI()

  const [quizzes, setQuizzes] = useState<QuizRow[]>([])
  const [courses, setCourses] = useState<CourseLite[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<QuizFormState>(BLANK_FORM)
  const [questions, setQuestions] = useState<QuestionDraft[]>(blankQuestions())
  const [saving, setSaving] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  /* ── Bulk MCQ add (paste or CSV/TSV/TXT file) ── */
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkRaw, setBulkRaw] = useState('')
  const bulkInputRef = useRef<HTMLInputElement>(null)
  const bulkParsed = useMemo(
    () => (bulkRaw.trim() ? parseBulkMcq(bulkRaw) : { items: [], errors: [] as string[] }),
    [bulkRaw]
  )

  function openBulk() {
    setBulkRaw('')
    setBulkOpen(true)
  }

  /** Load a .csv/.tsv/.txt file into the paste box (≤2MB text). */
  async function onBulkFilePicked(file: File | null) {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error(tx('ফাইলটি খুব বড় — সর্বোচ্চ ২MB টেক্সট।', 'File too large — max 2MB of text.'))
      return
    }
    try {
      const text = await file.text()
      setBulkRaw((prev) => (prev.trim() ? `${prev}\n${text}` : text))
      toast.success(tx('ফাইল লোড হয়েছে — নিচে যাচাই করে যোগ করুন।', 'File loaded — review below, then add.'))
    } catch {
      toast.error(tx('ফাইল পড়া যায়নি।', 'Could not read the file.'))
    } finally {
      if (bulkInputRef.current) bulkInputRef.current.value = ''
    }
  }

  /** Append parsed questions to the editor (replaces the single untouched blank draft). */
  function applyBulk() {
    if (!bulkParsed.items.length) return
    setQuestions((prev) => {
      const blankOnly =
        prev.length === 1 && !prev[0].id && !prev[0].text.trim() && prev[0].options.every((o) => !o.trim())
      return [
        ...(blankOnly ? [] : prev),
        ...bulkParsed.items.map((it) => ({
          key: newKey(),
          text: it.text,
          options: [...it.options],
          correctIndex: it.correctIndex,
        })),
      ]
    })
    toast.success(
      tx(
        `${digitsBn(bulkParsed.items.length)} টি প্রশ্ন যোগ হয়েছে — সংরক্ষণ করুন।`,
        `${bulkParsed.items.length} questions added — save to persist.`
      )
    )
    setBulkOpen(false)
    setBulkRaw('')
  }

  /** feature image upload for the public /exams card. */
  async function onCoverPicked(file: File | null) {
    if (!file) return
    setUploadingCover(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', 'image')
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
      const json = (await res.json().catch(() => null)) as
        | { ok: boolean; data?: { url: string }; error?: string }
        | null
      if (!res.ok || !json?.ok || !json.data) {
        throw new Error(json?.error ?? tx('আপলোড ব্যর্থ', 'Upload failed'))
      }
      setField('imageUrl', json.data.url)
      toast.success(tx('ফিচার ইমেজ যোগ হয়েছে', 'Feature image added'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপলোড ব্যর্থ', 'Upload failed'))
    } finally {
      setUploadingCover(false)
      if (coverInputRef.current) coverInputRef.current.value = ''
    }
  }
  const [deleteTarget, setDeleteTarget] = useState<QuizRow | null>(null)
  const bulk = useBulkSelection()
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [details, setDetails] = useState<QuizRow | null>(null)

  const setField = <K extends keyof QuizFormState>(key: K, value: QuizFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let list: QuizRow[]
      try {
        list = await apiGet<QuizRow[]>(`/api/quizzes?scope=all&type=${mode}`)
      } catch {
        list = await apiGet<QuizRow[]>('/api/quizzes?scope=all')
      }
      setQuizzes(list)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => {
    void load()
    apiGet<CourseLite[]>('/api/courses?all=1')
      .then(setCourses)
      .catch(() => setCourses([]))
  }, [load])

  function openCreate() {
    setEditingId(null)
    setForm(BLANK_FORM)
    setQuestions(blankQuestions())
    setDialogOpen(true)
  }

  const route = useHashRoute()
  // /admin/quizzes?new=1 (header quick action) → open the create dialog once, then clean the URL
  useEffect(() => {
    if (route.query.get('new') !== '1') return
    const timer = setTimeout(() => {
      openCreate()
      go('#/admin/quizzes')
    }, 60)
    return () => clearTimeout(timer)
     
  }, [route.query])

  /** Fully prefilled edit — questions come from the admin GET (incl. correctIndex). */
  async function openEdit(q: QuizRow) {
    setEditingId(q.id)
    setForm({
      title: q.title,
      description: q.description ?? '',
      courseId: '',
      durationMin: String(q.durationMin ?? 10),
      isPublished: rowPublished(q),
      imageUrl: (q as { imageUrl?: string | null }).imageUrl ?? '',
    })
    setQuestions(blankQuestions())
    setDialogOpen(true)
    try {
      const detail = await apiGet<{
        quiz: { courseId: string | null; isPublished?: boolean; imageUrl?: string | null }
        questions: { id: string; text: string; options: string[]; correctIndex: number }[]
      }>(`/api/quizzes/${q.id}`)
      setForm((prev) => ({
        ...prev,
        courseId: detail.quiz.courseId ?? '',
        isPublished:
          typeof detail.quiz.isPublished === 'boolean' ? detail.quiz.isPublished : prev.isPublished,
        imageUrl: detail.quiz.imageUrl ?? prev.imageUrl,
      }))
      setQuestions(
        detail.questions.length
          ? detail.questions.map((qz) => ({
              key: newKey(),
              id: qz.id,
              text: qz.text,
              options: qz.options.slice(0, 4),
              correctIndex: qz.correctIndex ?? 0,
            }))
          : blankQuestions()
      )
    } catch {
      // Detail fetch failed → keep the blank editor; save still replaces questions.
      toast.info(
        tx(
          'প্রশ্ন লোড করা যায়নি — নতুন করে লিখে সংরক্ষণ করুন।',
          'Could not load questions — re-enter them and save.'
        )
      )
    }
  }

  /* ── Question helpers ── */

  function addQuestion() {
    setQuestions((prev) => [...prev, { key: newKey(), text: '', options: ['', '', '', ''], correctIndex: 0 }])
  }

  function removeQuestion(qi: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== qi))
  }

  function updateQuestion(qi: number, patch: Partial<Omit<QuestionDraft, 'key'>>) {
    setQuestions((prev) => prev.map((q, i) => (i === qi ? { ...q, ...patch } : q)))
  }

  function updateOption(qi: number, oi: number, value: string) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q
      )
    )
  }

  /* ── Save ── */

  async function handleSave() {
    if (!form.title.trim()) {
      toast.error(tx(`${nounBn}ের শিরোনাম আবশ্যক`, `${nounEn} title is required`))
      return
    }
    if (!isExam && !form.courseId) {
      toast.error(
        tx(
          'কুইজটি কোন কোর্সের অধীনে দেওয়া হবে — কোর্স নির্বাচন করুন।',
          'Select the course this quiz belongs to.'
        )
      )
      return
    }
    if (!form.durationMin || Number(form.durationMin) <= 0) {
      toast.error(tx('সময় (মিনিট) সঠিকভাবে দিন', 'Enter a valid duration in minutes'))
      return
    }
    if (questions.length < 1) {
      toast.error(tx('অন্তত ১টি প্রশ্ন যোগ করুন', 'Add at least 1 question'))
      return
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (!q.text.trim()) {
        toast.error(tx(`প্রশ্ন ${i + 1}: প্রশ্নের লেখা আবশ্যক`, `Question ${i + 1}: text required`))
        return
      }
      if (q.options.some((o) => !o.trim())) {
        toast.error(
          tx(`প্রশ্ন ${i + 1}: ৪টি অপশনই পূরণ করুন`, `Question ${i + 1}: fill all 4 options`)
        )
        return
      }
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        type: mode,
        courseId: form.courseId || null,
        durationMin: Number(form.durationMin),
        isPublished: form.isPublished,
        imageUrl: form.imageUrl || null,
        questions: questions.map((q, i) => ({
          ...(q.id ? { id: q.id } : {}),
          text: q.text.trim(),
          options: q.options.map((o) => o.trim()),
          correctIndex: q.correctIndex,
          order: i + 1,
        })),
      }
      if (editingId) {
        await apiPut(`/api/quizzes/${editingId}`, payload)
        toast.success(tx(`${nounBn} আপডেট হয়েছে`, `${nounEn} updated`))
      } else {
        await apiPost('/api/quizzes', payload)
        toast.success(tx(`${nounBn} তৈরি হয়েছে`, `${nounEn} created`))
      }
      setDialogOpen(false)
      setEditingId(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সংরক্ষণ ব্যর্থ', 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await apiDelete(`/api/quizzes/${deleteTarget.id}`)
      toast.success(tx(`${nounBn} মুছে ফেলা হয়েছে`, `${nounEn} deleted`))
      setDeleteTarget(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    }
  }

  async function bulkDelete() {
    setBulkDeleting(true)
    try {
      const res = await apiSend<{ deleted: number }>('/api/admin/bulk-delete', 'POST', {
        resource: 'quizzes',
        ids: bulk.selected,
      })
      toast.success(
        tx(`${digitsBn(res.deleted)} টি ${nounBn} মুছে ফেলা হয়েছে`, `${res.deleted} ${nounEn.toLowerCase()}(s) deleted`)
      )
      bulk.clear()
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setBulkDeleting(false)
    }
  }

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return <AccessDenied />
  }

  const detailsFields: DetailField[] = details
    ? [
        { label: t('description'), value: details.description || undefined },
        { label: tx('ধরন', 'Type'), value: details.type ?? mode },
        {
          label: tx('সময় (মিনিট)', 'Duration (min)'),
          value: `${digitsBn(details.durationMin)} ${t('minutes')}`,
        },
        { label: t('questions'), value: digitsBn(details.questionCount) },
        {
          label: t('status'),
          value: rowPublished(details) ? tx('প্রকাশিত', 'Published') : tx('খসড়া', 'Draft'),
        },
        {
          label: t('date'),
          value: details.createdAt ? fmtStampText(details.createdAt) : undefined,
        },
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">
            {isExam ? tx('এক্সাম ম্যানেজার', 'Exam Manager') : t('admin_quizzes')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isExam
              ? tx(
                  'লাইভ এক্সাম তৈরি করুন — শিক্ষার্থীর ড্যাশবোর্ডের “পরীক্ষা” পেজে দেখা যাবে।',
                  'Create live exams — they appear on the student “Exams” page.'
                )
              : tx(
                  'কোর্সের অনুশীলনী কুইজ তৈরি করুন — ক্লাসরুমে দেখা যাবে।',
                  'Create course practice quizzes — they appear in the classroom.'
                )}
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" /> {tx(`নতুন ${nounBn}`, `New ${nounEn.toLowerCase()}`)}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : quizzes.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7" />}
          title={tx(`কোনো ${nounBn} নেই`, `No ${nounEn.toLowerCase()}s yet`)}
          description={
            isExam
              ? tx(
                  'শিক্ষার্থীদের জন্য প্রথম লাইভ এক্সাম তৈরি করুন।',
                  'Create your first live exam for students.'
                )
              : tx(
                  'কোর্সের ক্লাসরুমে অনুশীলনীর জন্য প্রথম কুইজ তৈরি করুন।',
                  'Create your first practice quiz for a course classroom.'
                )
          }
          actionLabel={tx(`নতুন ${nounBn}`, `New ${nounEn.toLowerCase()}`)}
          onAction={openCreate}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card>
            <CardContent className="p-0">
              <ScrollX>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <SelectAll
                        ids={quizzes.map((q) => q.id)}
                        isSelected={bulk.isSelected}
                        onToggleAll={bulk.toggleAll}
                      />
                    </TableHead>
                    <TableHead className="min-w-[200px]">{nounBn}</TableHead>
                    <TableHead>{tx('কোর্স', 'Course')}</TableHead>
                    <TableHead>{t('minutes')}</TableHead>
                    <TableHead>{t('questions')}</TableHead>
                    <TableHead>{t('status')}</TableHead>
                    <TableHead>{tx('তারিখ', 'Date')}</TableHead>
                    <TableHead className="text-right">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quizzes.map((q) => (
                    <TableRow
                      key={q.id}
                      className="cursor-pointer"
                      onClick={() => setDetails(q)}
                    >
                      <TableCell>
                        <RowBox id={q.id} isSelected={bulk.isSelected} onToggle={bulk.toggle} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {/* Feature image thumbnail — same idiom as the courses list */}
                          <span className="relative block h-10 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
                            {q.imageUrl ? (
                              <img src={q.imageUrl} alt={q.title} className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                                <ClipboardList className="h-4 w-4" />
                              </span>
                            )}
                          </span>
                          <div className="min-w-0">
                            <p
                              className="max-w-[240px] cursor-pointer truncate text-sm font-semibold"
                              onClick={() => setDetails(q)}
                            >
                              {q.title}
                            </p>
                            {q.description && (
                              <p className="max-w-[240px] truncate text-xs text-muted-foreground">
                                {q.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {q.courseTitle || tx('স্ট্যান্ডঅ্যালোন', 'Standalone')}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {digitsBn(q.durationMin)} {t('minutes')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{digitsBn(q.questionCount)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            rowPublished(q)
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-muted text-muted-foreground'
                          }
                        >
                          {rowPublished(q) ? tx('প্রকাশিত', 'Published') : tx('খসড়া', 'Draft')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DateStamp iso={q.createdAt} label={tx('তৈরির তারিখ', 'Created at')} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation()
                              openEdit(q)
                            }}
                            aria-label={t('edit')}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteTarget(q)
                            }}
                            aria-label={t('delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </ScrollX>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Create/Edit dialog ── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) setEditingId(null)
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? tx(`${nounBn} সম্পাদনা`, `Edit ${nounEn.toLowerCase()}`)
                : tx(`নতুন ${nounBn}`, `New ${nounEn.toLowerCase()}`)}
            </DialogTitle>
            <DialogDescription>
              {tx(
                'প্রতিটি প্রশ্নে ৪টি অপশন ও সঠিক উত্তর নির্বাচন করুন।',
                'Each question needs 4 options and a correct answer.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[64vh] space-y-5 overflow-y-auto pr-2">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>
                  {tx('শিরোনাম', 'Title')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.title}
                  onChange={(e) => setField('title', e.target.value)}
                  placeholder={
                    isExam
                      ? tx('যেমন: পদার্থবিজ্ঞান সাপ্তাহিক এক্সাম', 'e.g. Physics Weekly Exam')
                      : tx('যেমন: অধ্যায় ১ অনুশীলনী', 'e.g. Chapter 1 Practice')
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>{t('description')}</Label>
                <Textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  placeholder={tx('সংক্ষিপ্ত বিবরণ', 'Short description')}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>
                    {isExam
                      ? tx('কোর্স (ঐচ্ছিক)', 'Course (optional)')
                      : tx('কোর্স', 'Course')}{' '}
                    {!isExam && <span className="text-destructive">*</span>}
                  </Label>
                  <Select
                    value={form.courseId || 'none'}
                    onValueChange={(v) => setField('courseId', v === 'none' ? '' : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={tx('নির্বাচন করুন', 'Select course')} />
                    </SelectTrigger>
                    <SelectContent>
                      {isExam && (
                        <SelectItem value="none">{tx('স্ট্যান্ডঅ্যালোন', 'Standalone')}</SelectItem>
                      )}
                      {courses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isExam && (
                    <p className="text-[11px] text-muted-foreground">
                      {tx(
                        'কুইজটি এই কোর্সের ক্লাসরুমে অনুশীলনী হিসেবে দেখা যাবে।',
                        'The quiz appears as practice inside this course classroom.'
                      )}
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label>
                    {tx('সময় (মিনিট)', 'Duration (min)')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.durationMin}
                    onChange={(e) => setField('durationMin', e.target.value)}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Switch checked={form.isPublished} onCheckedChange={(v) => setField('isPublished', v)} />
                {t('publish')}
              </label>

              {/* feature image — shown on the public /exams card */}
              <div className="grid gap-2">
                <Label className="text-xs">{tx('ফিচার ইমেজ (এক্সাম কার্ডে দেখাবে)', 'Feature image (shown on the exam card)')}</Label>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => void onCoverPicked(e.target.files?.[0] ?? null)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => coverInputRef.current?.click()}
                    disabled={uploadingCover}
                  >
                    {uploadingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                    {form.imageUrl ? tx('বদলান', 'Replace') : tx('ছবি আপলোড', 'Upload image')}
                  </Button>
                  {form.imageUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setField('imageUrl', '')}
                    >
                      {tx('সরান', 'Remove')}
                    </Button>
                  )}
                </div>
                {form.imageUrl && (
                  <div className="w-full max-w-xs overflow-hidden rounded-lg border">
                    <img src={form.imageUrl} alt={tx('ফিচার ইমেজ', 'Feature image')} className="aspect-[16/10] w-full object-cover" />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  {t('questions')} · {digitsBn(questions.length)}
                </Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={openBulk}>
                    <Upload className="h-4 w-4" /> {tx('বাল্ক যোগ', 'Bulk add')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addQuestion}>
                    <Plus className="h-4 w-4" /> {t('add_question')}
                  </Button>
                </div>
              </div>

              {questions.map((q, qi) => (
                <div key={q.key} className="space-y-3 rounded-xl border bg-muted/30 p-3">
                  <div className="flex items-start gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                      {qi + 1}
                    </span>
                    <Textarea
                      rows={2}
                      value={q.text}
                      onChange={(e) => updateQuestion(qi, { text: e.target.value })}
                      placeholder={tx('প্রশ্ন লিখুন...', 'Type the question...')}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => removeQuestion(qi)}
                      aria-label={t('delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-bold text-secondary-foreground">
                          {LETTERS_BN[oi]}
                        </span>
                        <Input
                          value={opt}
                          onChange={(e) => updateOption(qi, oi, e.target.value)}
                          placeholder={`${tx('অপশন', 'Option')} ${LETTERS_BN[oi]}`}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      {tx('সঠিক উত্তর:', 'Correct answer:')}
                    </span>
                    <RadioGroup
                      value={String(q.correctIndex)}
                      onValueChange={(v) => updateQuestion(qi, { correctIndex: Number(v) })}
                      className="flex flex-row items-center gap-4"
                    >
                      {q.options.map((_, oi) => (
                        <label key={oi} className="flex cursor-pointer items-center gap-1.5 text-sm">
                          <RadioGroupItem value={String(oi)} />
                          <span className="font-semibold">{LETTERS_BN[oi]}</span>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk MCQ add dialog ── */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tx('বাল্ক প্রশ্ন যোগ করুন', 'Bulk add questions')}</DialogTitle>
            <DialogDescription>
              {tx(
                'CSV/টেক্সট ফাইল আপলোড করুন বা নিচে পেস্ট করুন — যাচাই হয়ে একসাথে যোগ হবে।',
                'Upload a CSV/text file or paste below — questions are validated, then added all at once.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={bulkInputRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={(e) => void onBulkFilePicked(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => bulkInputRef.current?.click()}
              >
                <FileUp className="h-4 w-4" /> {tx('CSV/টেক্সট ফাইল আপলোড', 'Upload CSV/text file')}
              </Button>
              <span className="text-xs text-muted-foreground">.csv · .tsv · .txt (≤2MB)</span>
            </div>

            <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 text-xs sm:grid-cols-2">
              <div className="space-y-1">
                <p className="font-semibold">{tx('ফরম্যাট ১ — সারি (CSV):', 'Format 1 — Rows (CSV):')}</p>
                <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">{
                  'প্রশ্ন,ক,খ,গ,ঘ,উত্তর\nবাংলাদেশের রাজধানী কী?,ঢাকা,চট্টগ্রাম,খুলনা,রাজশাহী,A'
                }</pre>
              </div>
              <div className="space-y-1">
                <p className="font-semibold">{tx('ফরম্যাট ২ — ব্লক:', 'Format 2 — Block:')}</p>
                <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">{
                  'Q: ২+২ কত?\nক) ৩\nখ) ৪\nগ) ৫\nঘ) ৬\nউত্তর: খ'
                }</pre>
              </div>
              <p className="text-muted-foreground sm:col-span-2">
                {tx(
                  'উত্তর লিখতে পারেন: A/B/C/D, 1/2/3/4 বা ক/খ/গ/ঘ — সেপারেটর: কমা, TAB বা |।',
                  'Answers may be A/B/C/D, 1/2/3/4 or ক/খ/গ/ঘ — separators: comma, TAB or pipe (|).'
                )}
              </p>
            </div>

            <div className="grid gap-2">
              <Label>{tx('প্রশ্ন পেস্ট করুন', 'Paste questions')}</Label>
              <Textarea
                rows={8}
                value={bulkRaw}
                onChange={(e) => setBulkRaw(e.target.value)}
                placeholder={tx('এখানে প্রশ্নগুলো পেস্ট করুন…', 'Paste your questions here…')}
                className="font-mono text-xs"
              />
            </div>

            {bulkRaw.trim() && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={bulkParsed.items.length ? 'default' : 'destructive'}>
                    {digitsBn(bulkParsed.items.length)} {tx('টি প্রশ্ন পাওয়া গেছে', 'questions found')}
                  </Badge>
                  {bulkParsed.errors.length > 0 && (
                    <Badge variant="destructive">
                      {digitsBn(bulkParsed.errors.length)} {tx('টি সমস্যা', 'issues')}
                    </Badge>
                  )}
                </div>
                {bulkParsed.errors.length > 0 && (
                  <div className="max-h-24 space-y-1 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                    {bulkParsed.errors.map((er, i) => (
                      <p key={i}>{er}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={applyBulk} disabled={!bulkParsed.items.length} className="gap-2">
              <Upload className="h-4 w-4" />
              {bulkParsed.items.length
                ? tx(`${digitsBn(bulkParsed.items.length)} টি যোগ করুন`, `Add ${bulkParsed.items.length}`)
                : tx('যোগ করুন', 'Add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tx(`${nounBn} মুছে ফেলবেন?`, `Delete this ${nounEn.toLowerCase()}?`)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `"${deleteTarget?.title ?? ''}" ও এর সব প্রশ্ন স্থায়ীভাবে মুছে যাবে।`,
                `"${deleteTarget?.title ?? ''}" and all its questions will be permanently deleted.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Row details dialog ── */}
      <DetailsDialog
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        title={details?.title ?? ''}
        subtitle={tx(`${nounBn}ের বিবরণ`, `${nounEn} details`)}
        fields={detailsFields}
        actions={
          details ? (
            <>
              <Button
                onClick={() => {
                  setDetails(null)
                  openEdit(details)
                }}
              >
                <Pencil className="h-4 w-4" /> {t('edit')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setDetails(null)
                  setDeleteTarget(details)
                }}
              >
                <Trash2 className="h-4 w-4" /> {t('delete')}
              </Button>
            </>
          ) : undefined
        }
      />

      {/* ── Bulk selection bar ── */}
      <BulkBar
        count={bulk.count}
        deleting={bulkDeleting}
        onDelete={() => void bulkDelete()}
        onClear={bulk.clear}
      />
    </div>
  )
}

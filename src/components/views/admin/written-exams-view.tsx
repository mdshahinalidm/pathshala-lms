'use client'

/**
 * AdminWrittenExamsView — /admin/written-exams — WRITTEN/THEORY exam manager.
 * Create → Course → Category → Subject → marks/duration/price → question
 * PDF/images → publish. NO MCQ anywhere: these are descriptive answer-sheet
 * exams marked from the Result Center (/admin/exam-results).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  FilePlus2,
  ImageIcon,
  PenLine,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  ShoppingBag,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { PdfFileIcon } from '@/components/shared/pdf-file-icon'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client'
import { ThumbnailPreview, type ThumbMeta } from '@/components/admin/thumbnail-preview'
import { DateStamp } from '@/components/admin/date-stamp'
import { digitsBn, fmtBDT, fmtDate, fmtStampText } from '@/lib/format'
import { useUI } from '@/store/ui-store'
import { useHashRoute } from '@/hooks/use-hash-route'
import { go } from '@/store/ui-store'

interface QuestionImage {
  url: string
  name?: string
  size?: number
  mime?: string
}

interface WrittenExamRow {
  id: string
  title: string
  description: string
  instructions: string
  courseId: string | null
  courseTitle: string | null
  categoryName: string | null
  subjectId: string | null
  subjectName: string | null
  durationMin: number
  totalMarks: number
  isFree: boolean
  price: number | null
  isPublished: boolean
  questionPdfUrl: string | null
  questionPdfName: string | null
  questionImages: QuestionImage[]
  imageUrl: string | null
  createdAt: string
  purchaseCount: number
  attemptCount: number
}

interface ExamPurchaseRow {
  id: string
  amount: number
  method: string
  status: string
  trxId: string
  invoiceNo: string | null
  payStatus: string
  senderNumber: string | null
  submittedTrxId: string | null
  submittedAt: string | null
  adminNote: string | null
  createdAt: string
  user: { id: string; name: string; email: string | null; phone: string | null; studentClass: string | null }
  exam: { id: string; title: string; price: number | null }
}

interface Category {
  id: string
  name: string
  nameEn?: string | null
}
interface Subject {
  id: string
  name: string
  nameEn?: string | null
}
interface CourseLite {
  id: string
  title: string
  categoryId?: string | null
}

interface FormState {
  title: string
  description: string
  instructions: string
  courseId: string
  categoryName: string
  subjectId: string
  durationMin: string
  totalMarks: string
  isFree: boolean
  price: string
  isPublished: boolean
  questionPdfUrl: string
  questionPdfName: string
  questionImages: QuestionImage[]
  imageUrl: string
}

const BLANK_FORM: FormState = {
  title: '',
  description: '',
  instructions: '',
  courseId: 'none',
  categoryName: '',
  subjectId: 'none',
  durationMin: '60',
  totalMarks: '100',
  isFree: true,
  price: '',
  isPublished: false,
  questionPdfUrl: '',
  questionPdfName: '',
  questionImages: [],
  imageUrl: '',
}

export default function AdminWrittenExamsView() {
  const { tx } = useUI()
  const route = useHashRoute()

  const [exams, setExams] = useState<WrittenExamRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState<CourseLite[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<WrittenExamRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  // exam purchases review tab
  const [purchases, setPurchases] = useState<ExamPurchaseRow[] | null>(null)
  const [purchFilter, setPurchFilter] = useState<'SUBMITTED' | 'SUCCESS' | 'FAILED' | 'ALL'>('SUBMITTED')
  const [purchDetails, setPurchDetails] = useState<ExamPurchaseRow | null>(null)
  const [purchNote, setPurchNote] = useState('')
  const [purchBusy, setPurchBusy] = useState(false)
  const [purchDelete, setPurchDelete] = useState<ExamPurchaseRow | null>(null)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  /** meta (name/size) of the freshly uploaded cover — shown in the big preview. */
  const [coverMeta, setCoverMeta] = useState<ThumbMeta | undefined>(undefined)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<WrittenExamRow[]>('/api/admin/written-exams')
      setExams(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
      setExams([])
    } finally {
      setLoading(false)
    }
  }, [tx])

  useEffect(() => {
    void load()
    apiGet<CourseLite[]>('/api/courses?all=1').then(setCourses).catch(() => setCourses([]))
    apiGet<Category[]>('/api/courses/categories').then(setCategories).catch(() => setCategories([]))
    apiGet<Subject[]>('/api/subjects').then(setSubjects).catch(() => setSubjects([]))
  }, [load])

  const purchStatusOf = (f: typeof purchFilter): string | undefined =>
    f === 'ALL' ? undefined : f

  const loadPurchases = useCallback(async () => {
    try {
      const q = purchStatusOf(purchFilter)
      const data = await apiGet<ExamPurchaseRow[]>(`/api/admin/exam-purchases${q ? `?status=${q}` : ''}`)
      setPurchases(Array.isArray(data) ? data : [])
    } catch {
      setPurchases([])
    }
  }, [purchFilter])

  useEffect(() => {
    void loadPurchases()
  }, [loadPurchases])

  async function reviewPurchase(row: ExamPurchaseRow, action: 'APPROVE' | 'REJECT') {
    setPurchBusy(true)
    try {
      await apiPatch(`/api/admin/exam-purchases/${row.id}`, {
        action,
        note: purchNote.trim() || undefined,
      })
      toast.success(
        action === 'APPROVE'
          ? tx('অনুমোদিত — পরীক্ষাটি ছাত্রের "আমার পরীক্ষা"-তে আনলক হয়েছে।', 'Approved — the exam is unlocked for the student.')
          : tx('প্রত্যাখ্যান করা হয়েছে।', 'Rejected.')
      )
      setPurchDetails(null)
      setPurchNote('')
      void loadPurchases()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('ব্যর্থ', 'Failed'))
    } finally {
      setPurchBusy(false)
    }
  }

  async function deletePurchase() {
    if (!purchDelete) return
    setPurchBusy(true)
    try {
      await apiDelete(`/api/admin/exam-purchases/${purchDelete.id}`)
      toast.success(tx('রেকর্ড মুছে ফেলা হয়েছে', 'Record deleted'))
      setPurchDelete(null)
      void loadPurchases()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setPurchBusy(false)
    }
  }

  // /admin/written-exams?new=1 (header quick action) → open create dialog
  useEffect(() => {
    if (route.query.get('new') !== '1') return
    const timer = setTimeout(() => {
      openCreate()
      go('#/admin/written-exams')
    }, 60)
    return () => clearTimeout(timer)
     
  }, [route.query])

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === (form.courseId === 'none' ? '' : form.courseId)) ?? null,
    [courses, form.courseId]
  )

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  function openCreate() {
    setEditingId(null)
    setForm(BLANK_FORM)
    setCoverMeta(undefined)
    setDialogOpen(true)
  }

  function openEdit(e: WrittenExamRow) {
    setEditingId(e.id)
    setForm({
      title: e.title,
      description: e.description ?? '',
      instructions: e.instructions ?? '',
      courseId: e.courseId ?? 'none',
      categoryName: e.categoryName ?? '',
      subjectId: e.subjectId ?? 'none',
      durationMin: String(e.durationMin),
      totalMarks: String(e.totalMarks),
      isFree: e.isFree,
      price: e.price != null ? String(e.price) : '',
      isPublished: e.isPublished,
      questionPdfUrl: e.questionPdfUrl ?? '',
      questionPdfName: e.questionPdfName ?? '',
      questionImages: e.questionImages ?? [],
      imageUrl: e.imageUrl ?? '',
    })
    setCoverMeta(undefined)
    setDialogOpen(true)
  }

  /** payload shared by create/update */
  function buildPayload() {
    const isFree = form.isFree
    return {
      title: form.title.trim(),
      description: form.description.trim(),
      instructions: form.instructions.trim(),
      courseId: form.courseId === 'none' ? null : form.courseId,
      categoryName: form.categoryName || null,
      subjectId: form.subjectId === 'none' ? null : form.subjectId,
      subjectName:
        form.subjectId === 'none'
          ? null
          : (subjects.find((s) => s.id === form.subjectId)?.nameEn ||
            subjects.find((s) => s.id === form.subjectId)?.name ||
            null),
      durationMin: Math.max(1, Math.round(Number(form.durationMin) || 60)),
      totalMarks: Math.max(1, Math.round(Number(form.totalMarks) || 100)),
      isFree,
      price: isFree ? null : Math.max(0, Number(form.price) || 0),
      isPublished: form.isPublished,
      questionPdfUrl: form.questionPdfUrl || null,
      questionPdfName: form.questionPdfName || null,
      questionImages: form.questionImages,
      imageUrl: form.imageUrl || null,
    }
  }

  async function save() {
    if (form.title.trim().length < 2) {
      toast.error(tx('পরীক্ষার নাম দিন', 'Enter the exam title'))
      return
    }
    if (!form.questionPdfUrl && form.questionImages.length === 0) {
      toast.error(
        tx('প্রশ্নের PDF অথবা অন্তত একটি ছবি আপলোড করুন', 'Upload a question PDF or at least one image')
      )
      return
    }
    if (!form.isFree && !(Number(form.price) > 0)) {
      toast.error(tx('পেইড এক্সামের দাম দিন', 'Set a price for a paid exam'))
      return
    }
    setSaving(true)
    try {
      const payload = buildPayload()
      if (editingId) await apiPatch(`/api/admin/written-exams/${editingId}`, payload)
      else await apiPost('/api/admin/written-exams', payload)
      toast.success(editingId ? tx('আপডেট হয়েছে', 'Updated') : tx('তৈরি হয়েছে', 'Created'))
      setDialogOpen(false)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সংরক্ষণ ব্যর্থ', 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  async function togglePublish(e: WrittenExamRow) {
    try {
      await apiPatch(`/api/admin/written-exams/${e.id}`, { isPublished: !e.isPublished })
      setExams((prev) => prev?.map((x) => (x.id === e.id ? { ...x, isPublished: !x.isPublished } : x)) ?? prev)
      toast.success(e.isPublished ? tx('আনপাবলিশ হয়েছে', 'Unpublished') : tx('পাবলিশ হয়েছে', 'Published'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx('ব্যর্থ', 'Failed'))
    }
  }

  async function doDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiDelete(`/api/admin/written-exams/${deleteTarget.id}`)
      toast.success(tx('মুছে ফেলা হয়েছে', 'Deleted'))
      setDeleteTarget(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setDeleting(false)
    }
  }

  async function uploadFile(file: File, kind: 'pdf' | 'image') {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', kind === 'pdf' ? 'pdf' : 'image')
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
    const json = (await res.json().catch(() => null)) as
      | { ok: boolean; data?: { url: string; filename: string; size: number; mime: string }; error?: string }
      | null
    if (!res.ok || !json?.ok || !json.data) {
      throw new Error(json?.error ?? tx('আপলোড ব্যর্থ', 'Upload failed'))
    }
    return json.data
  }

  async function onPdfPicked(file: File | null) {
    if (!file) return
    setUploadingPdf(true)
    try {
      const d = await uploadFile(file, 'pdf')
      setForm((f) => ({ ...f, questionPdfUrl: d.url, questionPdfName: file.name }))
      toast.success(tx('প্রশ্নের PDF যোগ হয়েছে', 'Question PDF added'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপলোড ব্যর্থ', 'Upload failed'))
    } finally {
      setUploadingPdf(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

  async function onCoverPicked(file: File | null) {
    if (!file) return
    setUploadingCover(true)
    try {
      const d = await uploadFile(file, 'image')
      setForm((f) => ({ ...f, imageUrl: d.url }))
      setCoverMeta({ name: file.name, size: file.size })
      toast.success(tx('ফিচার ইমেজ যোগ হয়েছে — নিচে থাম্বনেইল দেখুন', 'Feature image added — see the thumbnail below'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপলোড ব্যর্থ', 'Upload failed'))
    } finally {
      setUploadingCover(false)
      if (coverInputRef.current) coverInputRef.current.value = ''
    }
  }

  async function onImagesPicked(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingImage(true)
    const added: QuestionImage[] = []
    try {
      for (const file of Array.from(files)) {
        const d = await uploadFile(file, 'image')
        added.push({ url: d.url, name: file.name, size: d.size, mime: d.mime })
      }
      setForm((f) => ({ ...f, questionImages: [...f.questionImages, ...added].slice(0, 30) }))
      toast.success(
        tx(`${added.length}টি প্রশ্নের ছবি যোগ হয়েছে`, `${added.length} question image(s) added`)
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপলোড ব্যর্থ', 'Upload failed'))
    } finally {
      setUploadingImage(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const num = (n: number | string) => digitsBn(n)

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{tx('লিখিত পরীক্ষা', 'Written Exams')}</h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'রচনাধর্মী লিখিত পরীক্ষা তৈরি ও ব্যবস্থাপনা — প্রশ্ন PDF/ছবি, ছাত্র উত্তরপত্র ছবিতে জমা দেবে।',
              'Create and manage descriptive written exams — question PDF/images, students submit answer-sheet photos.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void load()}>
            <RefreshCcw className="h-4 w-4" /> {tx('রিফ্রেশ', 'Refresh')}
          </Button>
          <Button size="sm" className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" /> {tx('নতুন লিখিত পরীক্ষা', 'New Written Exam')}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="exams" className="gap-6">
        <TabsList>
          <TabsTrigger value="exams" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> {tx('পরীক্ষা', 'Exams')}
          </TabsTrigger>
          <TabsTrigger value="purchases" className="gap-1.5">
            <ShoppingBag className="h-3.5 w-3.5" /> {tx('পারচেজ', 'Purchases')}
          </TabsTrigger>
        </TabsList>

      <TabsContent value="exams" className="mt-0 space-y-6">
      {/* list */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : !exams || exams.length === 0 ? (
        <EmptyState
          icon={<FilePlus2 className="h-7 w-7" />}
          title={tx('কোনো লিখিত পরীক্ষা নেই', 'No written exams yet')}
          description={tx(
            'প্রথম লিখিত পরীক্ষা তৈরি করুন — কোর্স, ক্যাটাগরি, সাবজেক্ট নির্বাচন করে প্রশ্ন আপলোড দিন।',
            'Create your first written exam — pick course, category, subject and upload questions.'
          )}
          actionLabel={tx('নতুন লিখিত পরীক্ষা', 'New Written Exam')}
          onAction={openCreate}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {exams.map((e) => (
            <Card key={e.id} className="relative overflow-hidden">
              <span
                aria-hidden
                className={`absolute inset-x-0 top-0 h-1 ${e.isPublished ? 'grad-emerald' : 'bg-muted-foreground/30'}`}
              />
              <CardContent className="space-y-3 pt-5">
                {/* Feature image thumbnail (image shows in admin panel too) */}
                <div className="relative aspect-[16/10] overflow-hidden rounded-xl border bg-muted">
                  {e.imageUrl ? (
                    <img src={e.imageUrl} alt={e.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <PenLine className="h-8 w-8" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold" title={e.title}>{e.title}</h3>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {e.courseTitle ?? tx('কোর্স নেই', 'No course')}
                      {e.categoryName ? ` · ${e.categoryName}` : ''}
                      {e.subjectName ? ` · ${e.subjectName}` : ''}
                    </p>
                  </div>
                  <Badge className={e.isPublished ? 'grad-emerald border-transparent text-white' : 'bg-muted text-muted-foreground'}>
                    {e.isPublished ? tx('পাবলিশড', 'Published') : tx('খসড়া', 'Draft')}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" /> {num(e.durationMin)} {tx('মিনিট', 'min')}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <FileText className="h-3 w-3" /> {num(e.totalMarks)} {tx('নম্বর', 'marks')}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <ImageIcon className="h-3 w-3" /> {num(e.questionImages.length)} {tx('ছবি', 'img')}
                    {e.questionPdfUrl ? ' +PDF' : ''}
                  </Badge>
                  <Badge variant="secondary">
                    {e.isFree ? tx('ফ্রি', 'Free') : fmtBDT(e.price ?? 0)}
                  </Badge>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {num(e.purchaseCount)} {tx('কেনা', 'purchases')} · {num(e.attemptCount)} {tx('চেষ্টা', 'attempts')}
                  </span>
                  <DateStamp iso={e.createdAt} label={tx('তৈরির তারিখ', 'Created at')} className="text-right" />
                </div>

                <div className="flex items-center justify-between gap-2 border-t pt-3">
                  <div className="flex items-center gap-1.5">
                    <Switch checked={e.isPublished} onCheckedChange={() => void togglePublish(e)} aria-label="Publish" />
                    <span className="text-xs text-muted-foreground">{tx('পাবলিশ', 'Publish')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => openEdit(e)} aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(e)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      </TabsContent>

      <TabsContent value="purchases" className="mt-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {tx(
              'ম্যানুয়াল পেমেন্টের অনুমোদন — অনুমোদন করলে পরীক্ষাটি ছাত্রের "আমার পরীক্ষা"-তে সাথে সাথে চলে আসবে।',
              "Manual payment review — approving unlocks the exam in the student's My Exams instantly."
            )}
          </p>
          <Select value={purchFilter} onValueChange={(v) => setPurchFilter(v as typeof purchFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SUBMITTED">{tx('পেন্ডিং', 'Pending')}</SelectItem>
              <SelectItem value="SUCCESS">{tx('সফল', 'Success')}</SelectItem>
              <SelectItem value="FAILED">{tx('ব্যর্থ', 'Failed')}</SelectItem>
              <SelectItem value="ALL">{tx('সব', 'All')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!purchases ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : purchases.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag className="h-7 w-7" />}
            title={tx('কোনো পারচেজ নেই', 'No purchases')}
            description={tx(
              'ছাত্ররা পরীক্ষা কিনলে এখানে দেখা যাবে।',
              'Exam purchases will appear here.'
            )}
          />
        ) : (
          <div className="space-y-2">
            {purchases.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => { setPurchDetails(p); setPurchNote('') }}
                >
                  <p className="truncate text-sm font-semibold">{p.user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.exam.title} · {p.method} · {fmtBDT(p.amount)}
                  </p>
                </button>
                <span className="hidden text-xs text-muted-foreground sm:block">{fmtDate(p.createdAt)}</span>
                <Badge
                  className={
                    p.status === 'SUCCESS'
                      ? 'grad-emerald border-transparent text-white'
                      : p.status === 'FAILED'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                  }
                >
                  {p.status === 'SUCCESS' ? tx('সফল', 'Success') : p.status === 'FAILED' ? tx('ব্যর্থ', 'Failed') : tx('পেন্ডিং', 'Pending')}
                </Badge>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => { setPurchDetails(p); setPurchNote('') }} aria-label="Details">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setPurchDelete(p)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
      </Tabs>

      {/* purchase details dialog */}
      <Dialog open={Boolean(purchDetails)} onOpenChange={(o) => !o && setPurchDetails(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tx('পারচেজ ডিটেইলস', 'Purchase details')}</DialogTitle>
            <DialogDescription>{purchDetails?.exam.title}</DialogDescription>
          </DialogHeader>
          {purchDetails && (
            <div className="space-y-3">
              <div className="grid gap-1.5 rounded-xl border bg-muted/30 p-3 text-sm">
                <p className="flex justify-between gap-2"><span className="text-muted-foreground">{tx('শিক্ষার্থী', 'Student')}</span><span className="font-semibold">{purchDetails.user.name}</span></p>
                <p className="flex justify-between gap-2"><span className="text-muted-foreground">{tx('ইমেইল', 'Email')}</span><span>{purchDetails.user.email ?? '—'}</span></p>
                <p className="flex justify-between gap-2"><span className="text-muted-foreground">{tx('ফোন', 'Phone')}</span><span>{purchDetails.user.phone ?? '—'}</span></p>
                <p className="flex justify-between gap-2"><span className="text-muted-foreground">{tx('পরিমাণ', 'Amount')}</span><span className="font-bold">{fmtBDT(purchDetails.amount)}</span></p>
                <p className="flex justify-between gap-2"><span className="text-muted-foreground">{tx('মেথড', 'Method')}</span><span>{purchDetails.method}</span></p>
                <p className="flex justify-between gap-2"><span className="text-muted-foreground">{tx('ইনভয়েস', 'Invoice')}</span><span className="font-mono">{purchDetails.invoiceNo ?? '—'}</span></p>
                <p className="flex justify-between gap-2"><span className="text-muted-foreground">TrxID</span><span className="font-mono">{purchDetails.trxId}</span></p>
                {purchDetails.submittedTrxId && (
                  <p className="flex justify-between gap-2"><span className="text-muted-foreground">{tx('জমা দেওয়া TrxID', 'Submitted TrxID')}</span><span className="font-mono">{purchDetails.submittedTrxId}</span></p>
                )}
                {purchDetails.senderNumber && (
                  <p className="flex justify-between gap-2"><span className="text-muted-foreground">{tx('সেন্ডার', 'Sender')}</span><span className="font-mono">{purchDetails.senderNumber}</span></p>
                )}
                <p className="flex justify-between gap-2"><span className="text-muted-foreground">{tx('তারিখ', 'Date')}</span><span>{fmtDate(purchDetails.createdAt)}</span></p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ep-note">{tx('নোট (ঐচ্ছিক)', 'Note (optional)')}</Label>
                <Textarea id="ep-note" rows={2} value={purchNote} onChange={(e) => setPurchNote(e.target.value)} />
              </div>
              {purchDetails.status === 'PENDING' ? (
                <div className="flex gap-2">
                  <Button className="flex-1 gap-1.5 grad-emerald border-transparent text-white" onClick={() => void reviewPurchase(purchDetails, 'APPROVE')} disabled={purchBusy}>
                    {purchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {tx('অনুমোদন', 'Approve')}
                  </Button>
                  <Button variant="outline" className="flex-1 gap-1.5 text-destructive hover:text-destructive" onClick={() => void reviewPurchase(purchDetails, 'REJECT')} disabled={purchBusy}>
                    <XCircle className="h-4 w-4" /> {tx('প্রত্যাখ্যান', 'Reject')}
                  </Button>
                </div>
              ) : (
                <p className="rounded-lg bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
                  {tx('এই ক্রয়টি প্রসেস হয়ে গেছে।', 'This purchase has already been processed.')}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* purchase delete confirm */}
      <AlertDialog open={Boolean(purchDelete)} onOpenChange={(o) => !o && setPurchDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('পারচেজ রেকর্ড মুছে ফেলবেন?', 'Delete this purchase record?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {purchDelete
                ? `${purchDelete.user.name} — ${purchDelete.exam.title} (${fmtBDT(purchDelete.amount)}) · ` +
                  tx('এটি স্থায়ীভাবে মুছে যাবে।', 'This will be permanently removed.')
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tx('বাতিল', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void deletePurchase()
              }}
            >
              {purchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : tx('মুছে ফেলুন', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? tx('লিখিত পরীক্ষা সম্পাদনা', 'Edit written exam') : tx('নতুন লিখিত পরীক্ষা', 'New written exam')}
            </DialogTitle>
            <DialogDescription>
              {tx(
                'কোর্স → ক্যাটাগরি → সাবজেক্ট নির্বাচন করে প্রশ্ন আপলোড করুন।',
                'Pick Course → Category → Subject, then upload the question media.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="we-title">{tx('পরীক্ষার নাম', 'Exam name')} *</Label>
              <Input
                id="we-title"
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder={tx('যেমন: অনার্স ১ম বর্ষ রসায়ন লিখিত পরীক্ষা', 'e.g. Honours 1st Year Chemistry Written Exam')}
              />
            </div>

            {/* course → category → subject */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>{tx('কোর্স', 'Course')}</Label>
                <Select
                  value={form.courseId}
                  onValueChange={(v) => {
                    setField('courseId', v)
                    const c = courses.find((x) => x.id === v)
                    setForm((f) => ({ ...f, courseId: v, categoryName: c?.categoryId ? (categories.find((cat) => cat.id === c.categoryId)?.name ?? '') : '' }))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tx('কোর্স নির্বাচন', 'Select course')} />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="none">{tx('কোর্স নেই', 'No course')}</SelectItem>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{tx('ক্যাটাগরি', 'Category')}</Label>
                <Select
                  value={form.categoryName || 'none'}
                  onValueChange={(v) => setField('categoryName', v === 'none' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tx('ক্যাটাগরি নির্বাচন', 'Select category')} />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="none">{tx('ক্যাটাগরি নেই', 'No category')}</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{tx('সাবজেক্ট', 'Subject')}</Label>
                <Select value={form.subjectId} onValueChange={(v) => setField('subjectId', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={tx('সাবজেক্ট নির্বাচন', 'Select subject')} />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="none">{tx('সাবজেক্ট নেই', 'No subject')}</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nameEn || s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selectedCourse && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" /> {selectedCourse.title}
              </p>
            )}

            <div className="grid gap-2">
              <Label htmlFor="we-desc">{tx('বর্ণনা', 'Description')}</Label>
              <Textarea
                id="we-desc"
                rows={2}
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="we-inst">{tx('পরীক্ষার নির্দেশনা', 'Instructions')}</Label>
              <Textarea
                id="we-inst"
                rows={3}
                value={form.instructions}
                onChange={(e) => setField('instructions', e.target.value)}
                placeholder={tx(
                  'যেমন: খাতায় লিখে ছবি তুলে আপলোড করুন…',
                  'e.g. Write on paper, photograph each page and upload…'
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="we-dur">{tx('সময় (মিনিট)', 'Duration (minutes)')}</Label>
                <Input
                  id="we-dur"
                  type="number"
                  min={1}
                  value={form.durationMin}
                  onChange={(e) => setField('durationMin', e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="we-marks">{tx('পূর্ণমান', 'Total marks')}</Label>
                <Input
                  id="we-marks"
                  type="number"
                  min={1}
                  value={form.totalMarks}
                  onChange={(e) => setField('totalMarks', e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium">{tx('ফ্রি পরীক্ষা', 'Free exam')}</p>
                  <p className="text-xs text-muted-foreground">{tx('অফ করলে দাম লাগবে', 'Turn off to set a price')}</p>
                </div>
                <Switch checked={form.isFree} onCheckedChange={(v) => setField('isFree', v)} aria-label="Free" />
              </div>
              {!form.isFree && (
                <div className="grid gap-2">
                  <Label htmlFor="we-price">{tx('দাম (৳)', 'Price (BDT)')}</Label>
                  <Input
                    id="we-price"
                    type="number"
                    min={1}
                    value={form.price}
                    onChange={(e) => setField('price', e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* question media */}
            <div className="grid gap-3 rounded-xl border bg-muted/30 p-3">
              <p className="text-sm font-semibold">{tx('প্রশ্ন (PDF / ছবি)', 'Questions (PDF / images)')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => void onPdfPicked(e.target.files?.[0] ?? null)}
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => void onImagesPicked(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={uploadingPdf}
                >
                  {uploadingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PdfFileIcon className="h-3.5 w-3.5" />}
                  {tx('প্রশ্নের PDF', 'Question PDF')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                  {tx('প্রশ্নের ছবি (একাধিক)', 'Question images (multiple)')}
                </Button>
              </div>

              {form.questionPdfUrl && (
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <PdfFileIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{form.questionPdfName ?? 'question.pdf'}</span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setForm((f) => ({ ...f, questionPdfUrl: '', questionPdfName: '' }))}
                    aria-label="Remove PDF"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              {form.questionImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {form.questionImages.map((qi, idx) => (
                    <div key={`${qi.url}-${idx}`} className="group relative overflow-hidden rounded-lg border">
                      { }
                      <img src={qi.url} alt={qi.name ?? `question-${idx + 1}`} className="aspect-square w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, questionImages: f.questionImages.filter((_, i) => i !== idx) }))}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Remove image"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <span className="absolute bottom-0.5 left-1 text-[10px] font-bold text-white drop-shadow">
                        {num(idx + 1)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* feature image — shown on the public /exams card */}
            <div className="grid gap-3 rounded-xl border bg-muted/30 p-3">
              <p className="text-sm font-semibold">{tx('ফিচার ইমেজ (কার্ডে দেখাবে)', 'Feature image (shown on the card)')}</p>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => void onCoverPicked(e.target.files?.[0] ?? null)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={uploadingCover}
                >
                  {uploadingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                  {form.imageUrl ? tx('বদলান', 'Replace') : tx('ছবি আপলোড করুন', 'Upload image')}
                </Button>
              </div>
              <ThumbnailPreview
                value={form.imageUrl}
                meta={coverMeta}
                onRemove={form.imageUrl
                  ? () => {
                      setCoverMeta(undefined)
                      setForm((f) => ({ ...f, imageUrl: '' }))
                    }
                  : undefined}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">{tx('পাবলিশ', 'Published')}</p>
                <p className="text-xs text-muted-foreground">
                  {tx('চালু করলে ছাত্রদের কাছে দেখা যাবে', 'Visible to students when on')}
                </p>
              </div>
              <Switch checked={form.isPublished} onCheckedChange={(v) => setField('isPublished', v)} aria-label="Published" />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tx('বাতিল', 'Cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? tx('সংরক্ষণ করুন', 'Save changes') : tx('তৈরি করুন', 'Create exam')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('পরীক্ষাটি মুছে ফেলবেন?', 'Delete this exam?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.title} —{' '}
              {tx(
                'এটি ও এর ক্রয়/উত্তরপত্র স্থায়ীভাবে মুছে যাবে। এই কাজ ফেরানো যাবে না।',
                'The exam and its purchases/attempt records will be permanently removed. This cannot be undone.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tx('বাতিল', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void doDelete()
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : tx('মুছে ফেলুন', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

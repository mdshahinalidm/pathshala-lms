'use client'

/**
 * AdminCombosView — combo (bundle) offer manager.
 * Create/edit/delete combos of 2–20 items (courses / written exams /
 * suggestions), activate toggle, plus a combo-purchase review table below
 * (approve grants the whole bundle, reject, delete cleanup).
 * Data: /api/admin/combos (GET, POST) · /api/admin/combos/[id] (PATCH, DELETE)
 *       /api/admin/combo-purchases (GET) · /api/admin/combo-purchases/[id] (PATCH, DELETE)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { toast } from 'sonner'
import {
  BookOpen,
  FileText,
  Loader2,
  MoreHorizontal,
  Package,
  PenLine,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldX,
  ShoppingBag,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollX } from '@/components/admin/data-tools'
import { EmptyState } from '@/components/shared/empty-state'
import { DateStamp } from '@/components/admin/date-stamp'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client'
import { fmtBDT, fmtNum } from '@/lib/format'
import { useAuth } from '@/store/auth-store'
import { useUI } from '@/store/ui-store'
import { isManagerRole } from '@/lib/roles'
import { ImageUpload } from '@/components/admin/image-upload'

/* ── Types ── */

type ItemType = 'COURSE' | 'EXAM' | 'SUGGESTION'

interface ComboItemRow {
  id: string
  itemType: string
  refId: string
  titleSnapshot: string
  order: number
}

interface ComboRow {
  id: string
  title: string
  description: string
  price: number
  imageUrl: string | null
  isActive: boolean
  createdAt: string
  items: ComboItemRow[]
}

interface ComboPurchaseRow {
  id: string
  amount: number
  listAmount: number | null
  discount: number | null
  couponCode: string | null
  method: string
  status: string
  trxId: string | null
  invoiceNo: string | null
  payStatus: string
  senderNumber: string | null
  submittedTrxId: string | null
  submittedAt: string | null
  adminNote: string | null
  createdAt: string
  user: { name: string | null; email: string | null; phone: string | null } | null
  combo: { title: string } | null
}

/** One editable row inside the items builder. */
interface BuilderItem {
  key: string
  itemType: ItemType
  refId: string
}

interface PickEntry {
  id: string
  title: string
  price: number | null
  isFree?: boolean
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
      </CardContent>
    </Card>
  )
}

/* ── Item-type helpers ── */

const ITEM_TYPES: ItemType[] = ['COURSE', 'EXAM', 'SUGGESTION']

const TYPE_META: Record<ItemType, { bn: string; en: string; Icon: typeof BookOpen; tone: string }> = {
  COURSE: { bn: 'কোর্স', en: 'Course', Icon: BookOpen, tone: 'grad-emerald' },
  EXAM: { bn: 'পরীক্ষা', en: 'Exam', Icon: PenLine, tone: 'grad-violet' },
  SUGGESTION: { bn: 'সাজেশন', en: 'Suggestion', Icon: FileText, tone: 'grad-amber' },
}

function statusBadge(status: string) {
  if (status === 'SUCCESS')
    return 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
  if (status === 'PENDING')
    return 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
  return 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
}

function payStatusBadge(payStatus: string) {
  if (payStatus === 'SUBMITTED')
    return 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
  if (payStatus === 'APPROVED')
    return 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
  if (payStatus === 'REJECTED')
    return 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
  return 'bg-muted text-muted-foreground'
}

const STATUS_BN: Record<string, string> = { PENDING: 'পেন্ডিং', SUCCESS: 'সফল', FAILED: 'ব্যর্থ' }
const PAYSTATUS_BN: Record<string, string> = {
  NONE: 'জমা নেই',
  SUBMITTED: 'রিভিউয়ের অপেক্ষায়',
  APPROVED: 'অনুমোদিত',
  REJECTED: 'বাতিল',
}

export default function AdminCombosView() {
  const { user, status, initialized } = useAuth()
  const { t, tx, lang } = useUI()

  const [combos, setCombos] = useState<ComboRow[]>([])
  const [loading, setLoading] = useState(true)

  const [purchases, setPurchases] = useState<ComboPurchaseRow[]>([])
  const [loadingPurchases, setLoadingPurchases] = useState(true)

  // Pick-lists for the item builder
  const [courseList, setCourseList] = useState<PickEntry[]>([])
  const [examList, setExamList] = useState<PickEntry[]>([])
  const [suggestionList, setSuggestionList] = useState<PickEntry[]>([])

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ComboRow | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formImageUrl, setFormImageUrl] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [formItems, setFormItems] = useState<BuilderItem[]>([])
  const [saving, setSaving] = useState(false)
  const keyCounter = useRef(0)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ComboRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Purchase review + delete
  const [review, setReview] = useState<{ row: ComboPurchaseRow; action: 'APPROVE' | 'REJECT' } | null>(null)
  const [note, setNote] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [purchaseDeleteTarget, setPurchaseDeleteTarget] = useState<ComboPurchaseRow | null>(null)
  const [purchaseDeleting, setPurchaseDeleting] = useState(false)

  const num = (n: number | string) => fmtNum(n, lang)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<{ combos: ComboRow[] }>('/api/admin/combos')
      setCombos(data.combos)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [tx])

  const loadPurchases = useCallback(async () => {
    setLoadingPurchases(true)
    try {
      const data = await apiGet<{ purchases: ComboPurchaseRow[] }>('/api/admin/combo-purchases')
      setPurchases(data.purchases)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoadingPurchases(false)
    }
  }, [tx])

  useEffect(() => {
    const timer = setTimeout(() => {
      void load()
      void loadPurchases()
    }, 0)
    return () => clearTimeout(timer)
  }, [load, loadPurchases])

  // Item pick-lists (published courses, written exams, suggestions)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const [courses, exams, suggestions] = await Promise.all([
          apiGet<PickEntry[]>('/api/courses'),
          apiGet<{ exams: PickEntry[] }>('/api/written-exams'),
          apiGet<PickEntry[]>('/api/suggestions'),
        ])
        if (cancelled) return
        setCourseList(
          (courses ?? []).map((c) => ({ id: c.id, title: c.title, price: c.price ?? null }))
        )
        setExamList((exams?.exams ?? []).map((e) => ({ id: e.id, title: e.title, price: e.price ?? null })))
        setSuggestionList(
          (suggestions ?? []).map((s) => ({ id: s.id, title: s.title, price: s.price ?? null, isFree: s.isFree }))
        )
      } catch {
        // Pickers stay empty — the builder still works with already-typed rows.
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const pickListFor = (type: ItemType): PickEntry[] =>
    type === 'COURSE' ? courseList : type === 'EXAM' ? examList : suggestionList

  /** Sell price of a picked entry — mirrors the public decorateCombo rule. */
  const entryPrice = (type: ItemType, entry: PickEntry): number => {
    if (type === 'COURSE') return entry.price ?? 0
    return entry.isFree ? 0 : (entry.price ?? 0)
  }

  /** Optional live hint: total list value of the picked items. */
  const itemsListTotal = formItems.reduce((sum, it) => {
    if (!it.refId) return sum
    const entry = pickListFor(it.itemType).find((x) => x.id === it.refId)
    return entry ? sum + entryPrice(it.itemType, entry) : sum
  }, 0)
  const comboPriceNum = Number(formPrice)
  const savings =
    Number.isFinite(comboPriceNum) && itemsListTotal > comboPriceNum ? itemsListTotal - comboPriceNum : 0

  function nextKey(): string {
    keyCounter.current += 1
    return `row-${keyCounter.current}`
  }

  function openCreate() {
    setEditing(null)
    setFormTitle('')
    setFormDescription('')
    setFormImageUrl('')
    setFormPrice('')
    setFormActive(true)
    setFormItems([
      { key: nextKey(), itemType: 'COURSE', refId: '' },
      { key: nextKey(), itemType: 'COURSE', refId: '' },
    ])
    setDialogOpen(true)
  }

  function openEdit(c: ComboRow) {
    setEditing(c)
    setFormTitle(c.title)
    setFormDescription(c.description ?? '')
    setFormImageUrl(c.imageUrl ?? '')
    setFormPrice(String(c.price))
    setFormActive(c.isActive)
    setFormItems(
      c.items.map((it) => ({
        key: nextKey(),
        itemType: (ITEM_TYPES.includes(it.itemType as ItemType) ? it.itemType : 'COURSE') as ItemType,
        refId: it.refId,
      }))
    )
    setDialogOpen(true)
  }

  function updateItem(key: string, patch: Partial<BuilderItem>) {
    setFormItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function addItemRow() {
    setFormItems((rows) => [...rows, { key: nextKey(), itemType: 'COURSE', refId: '' }])
  }

  function removeItemRow(key: string) {
    setFormItems((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.key !== key)))
  }

  async function handleSave() {
    const title = formTitle.trim()
    const price = Number(formPrice)
    const items = formItems
      .filter((r) => r.refId)
      .map((r) => ({ itemType: r.itemType, refId: r.refId }))

    if (title.length < 2) {
      toast.error(tx('কম্বোর শিরোনাম দিন (কমপক্ষে ২ অক্ষর)', 'Title is required (at least 2 characters)'))
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error(tx('সঠিক মূল্য দিন (০ বা তার বেশি)', 'Enter a valid price (0 or more)'))
      return
    }
    if (items.length < 2) {
      toast.error(
        tx('কম্পক্ষে ২টি আইটেম নির্বাচন করুন', 'Select at least 2 items')
      )
      return
    }
    if (items.length > 20) {
      toast.error(tx('সর্বোচ্চ ২০টি আইটেম নেওয়া যায়', 'Maximum 20 items'))
      return
    }

    setSaving(true)
    try {
      const body = {
        title,
        description: formDescription.trim(),
        imageUrl: formImageUrl.trim() || null,
        price,
        isActive: formActive,
        items,
      }
      if (editing) {
        await apiPatch(`/api/admin/combos/${editing.id}`, body)
        toast.success(tx('কম্বো আপডেট হয়েছে', 'Combo updated'))
      } else {
        await apiPost('/api/admin/combos', body)
        toast.success(tx('কম্বো তৈরি হয়েছে', 'Combo created'))
      }
      setDialogOpen(false)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সংরক্ষণ ব্যর্থ', 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  /** Instant activate/deactivate toggle (mirrors coupons-view optimistic switch). */
  async function toggleActive(c: ComboRow, next: boolean) {
    setCombos((list) => list.map((x) => (x.id === c.id ? { ...x, isActive: next } : x)))
    try {
      await apiPatch(`/api/admin/combos/${c.id}`, { isActive: next })
      toast.success(
        next
          ? tx('কম্বো সক্রিয় করা হয়েছে', 'Combo activated')
          : tx('কম্বো নিষ্ক্রিয় করা হয়েছে', 'Combo deactivated')
      )
    } catch (e) {
      setCombos((list) => list.map((x) => (x.id === c.id ? { ...x, isActive: !next } : x)))
      toast.error(e instanceof Error ? e.message : tx('পরিবর্তন ব্যর্থ', 'Update failed'))
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiDelete(`/api/admin/combos/${deleteTarget.id}`)
      toast.success(tx('কম্বো মুছে ফেলা হয়েছে', 'Combo deleted'))
      setDeleteTarget(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setDeleting(false)
    }
  }

  async function submitReview() {
    if (!review) return
    setReviewBusy(true)
    try {
      await apiPatch(`/api/admin/combo-purchases/${review.row.id}`, {
        action: review.action,
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      toast.success(
        review.action === 'APPROVE'
          ? tx(
              'অনুমোদিত — শিক্ষার্থী এখন পুরো কম্বো ব্যবহার করতে পারবে।',
              'Approved — the student now has the full bundle.'
            )
          : tx('প্রত্যাখ্যান করা হয়েছে।', 'Rejected.')
      )
      setReview(null)
      setNote('')
      void loadPurchases()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('ব্যর্থ', 'Failed'))
    } finally {
      setReviewBusy(false)
    }
  }

  async function confirmPurchaseDelete() {
    if (!purchaseDeleteTarget) return
    setPurchaseDeleting(true)
    try {
      await apiDelete(`/api/admin/combo-purchases/${purchaseDeleteTarget.id}`)
      toast.success(tx('ক্রয় রেকর্ড মুছে ফেলা হয়েছে', 'Purchase record deleted'))
      setPurchaseDeleteTarget(null)
      void loadPurchases()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setPurchaseDeleting(false)
    }
  }

  if (initialized && status !== 'loading' && (!user || !isManagerRole(user.role))) {
    return <AccessDenied />
  }

  /* ── Small renderers ── */

  const itemChip = (it: ComboItemRow) => {
    const tm = TYPE_META[(ITEM_TYPES as string[]).includes(it.itemType) ? (it.itemType as ItemType) : 'COURSE']
    return (
      <span
        key={it.id}
        title={it.titleSnapshot}
        className="inline-flex max-w-[150px] items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground"
      >
        <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white ${tm.tone}`}>
          <tm.Icon className="h-2.5 w-2.5" />
        </span>
        <span className="truncate">{it.titleSnapshot}</span>
      </span>
    )
  }

  const itemChips = (items: ComboItemRow[]) => {
    const visible = items.slice(0, 4)
    const extra = items.length - visible.length
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground">
          {tx('আইটেম', 'Items')}: {num(items.length)}
        </span>
        <div className="flex flex-wrap gap-1">
          {visible.map(itemChip)}
          {extra > 0 && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              +{num(extra)}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Package className="h-6 w-6 text-primary" />
            {tx('কম্বো অফার', 'Combo Offers')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'কোর্স, পরীক্ষা ও সাজেশনের বান্ডেল অফার তৈরি করুন — এক দামে সবকিছু।',
              'Bundle courses, exams and suggestions into one offer — everything at one price.'
            )}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          {tx('নতুন কম্বো', 'New combo')}
        </Button>
      </div>

      {/* Combos table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : combos.length === 0 ? (
        <EmptyState
          icon={<Package className="h-7 w-7" />}
          title={tx('কোনো কম্বো নেই', 'No combos yet')}
          description={tx(
            'প্রথম কম্বো অফারটি তৈরি করুন — অন্তত ২টি আইটেম বেছে নিন।',
            'Create your first combo offer — pick at least 2 items.'
          )}
          actionLabel={tx('নতুন কম্বো', 'New combo')}
          onAction={openCreate}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden rounded-2xl border bg-card"
        >
          <ScrollX>
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{tx('কম্বো', 'Combo')}</TableHead>
                  <TableHead>{tx('আইটেম', 'Items')}</TableHead>
                  <TableHead>{tx('মূল্য', 'Price')}</TableHead>
                  <TableHead>{tx('স্ট্যাটাস', 'Status')}</TableHead>
                  <TableHead>{tx('তৈরি', 'Created')}</TableHead>
                  <TableHead className="text-right">{tx('অ্যাকশন', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {combos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-[260px]">
                      <div className="flex items-start gap-2">
                        {c.imageUrl ? (
                          <span className="relative mt-0.5 block h-8 w-12 shrink-0 overflow-hidden rounded-lg border bg-muted">
                            <Image
                              src={c.imageUrl}
                              alt=""
                              fill
                              sizes="48px"
                              unoptimized={c.imageUrl.startsWith('http')}
                              className="object-cover"
                            />
                          </span>
                        ) : (
                          <span className="grad-brand mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white">
                            <Package className="h-4 w-4" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{c.title}</p>
                          {c.description ? (
                            <p className="line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{itemChips(c.items)}</TableCell>
                    <TableCell className="font-semibold tabular-nums">{fmtBDT(c.price, lang)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={c.isActive}
                          onCheckedChange={(v) => void toggleActive(c, v)}
                          aria-label={tx(
                            `${c.title} ${c.isActive ? 'নিষ্ক্রিয়' : 'সক্রিয়'} করুন`,
                            `${c.isActive ? 'Deactivate' : 'Activate'} ${c.title}`
                          )}
                        />
                        <Badge
                          variant="outline"
                          className={
                            c.isActive
                              ? 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-muted text-muted-foreground'
                          }
                        >
                          {c.isActive ? tx('সক্রিয়', 'Active') : tx('নিষ্ক্রিয়', 'Inactive')}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DateStamp iso={c.createdAt} label={tx('তৈরির তারিখ', 'Created at')} />
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={tx('অ্যাকশন', 'Actions')}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4" />
                            {tx('সম্পাদনা', 'Edit')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(c)}
                          >
                            <Trash2 className="h-4 w-4" />
                            {tx('মুছুন', 'Delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollX>
        </motion.div>
      )}

      {/* ── Combo purchases (review) ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
              <ShoppingBag className="h-5 w-5 text-primary" />
              {tx('কম্বো পারচেজ', 'Combo Purchases')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {tx(
                'ম্যানুয়াল পেমেন্ট রিভিউ — অনুমোদনেই পুরো কম্বো শিক্ষার্থীর ড্যাশবোর্ডে যোগ হয়।',
                'Manual payment review — approval grants the whole bundle instantly.'
              )}
            </p>
          </div>
        </div>

        {loadingPurchases ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : purchases.length === 0 ? (
          <div className="rounded-2xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            {tx('এখনো কোনো কম্বো কেনা হয়নি।', 'No combo purchases yet.')}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden rounded-2xl border bg-card"
          >
            <ScrollX>
              <Table className="min-w-[1080px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{tx('শিক্ষার্থী', 'Student')}</TableHead>
                    <TableHead>{tx('কম্বো', 'Combo')}</TableHead>
                    <TableHead>{tx('মূল্য', 'Amount')}</TableHead>
                    <TableHead>{tx('মেথড', 'Method')}</TableHead>
                    <TableHead>{tx('স্ট্যাটাস', 'Status')}</TableHead>
                    <TableHead>{tx('পেমেন্ট রিভিউ', 'Payment review')}</TableHead>
                    <TableHead>TrxID</TableHead>
                    <TableHead>{tx('তৈরি', 'Created')}</TableHead>
                    <TableHead className="text-right">{tx('অ্যাকশন', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-[190px]">
                        <p className="truncate text-sm font-medium">{p.user?.name ?? '—'}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.user?.email ?? ''}
                          {p.user?.email && p.user?.phone ? ' · ' : ''}
                          {p.user?.phone ?? ''}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-[170px]">
                        <p className="truncate text-sm font-medium">{p.combo?.title ?? '—'}</p>
                        {p.invoiceNo ? (
                          <p className="text-xs text-muted-foreground">{p.invoiceNo}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-semibold tabular-nums">
                        {fmtBDT(p.amount, lang)}
                        {p.discount != null && p.discount > 0 && p.listAmount != null ? (
                          <p className="text-xs font-normal text-muted-foreground">
                            <s>{fmtBDT(p.listAmount, lang)}</s> −{fmtBDT(p.discount, lang)}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{p.method}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadge(p.status)}>
                          {lang === 'bn' ? (STATUS_BN[p.status] ?? p.status) : p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={payStatusBadge(p.payStatus)}>
                          {lang === 'bn' ? (PAYSTATUS_BN[p.payStatus] ?? p.payStatus) : p.payStatus}
                        </Badge>
                        {(p.senderNumber || p.submittedTrxId) && (
                          <p className="mt-1 max-w-[150px] truncate text-xs text-muted-foreground">
                            {p.senderNumber ? `${p.senderNumber}` : ''}
                            {p.senderNumber && p.submittedTrxId ? ' · ' : ''}
                            {p.submittedTrxId ?? ''}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[150px]">
                        <p className="truncate font-mono text-xs">{p.submittedTrxId ?? p.trxId ?? '—'}</p>
                      </TableCell>
                      <TableCell>
                        <DateStamp iso={p.createdAt} label={tx('কেনার তারিখ', 'Purchased at')} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {p.status === 'PENDING' && (
                            <>
                              <Button
                                size="sm"
                                className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                                onClick={() => {
                                  setNote('')
                                  setReview({ row: p, action: 'APPROVE' })
                                }}
                              >
                                <ShieldAlert className="h-3.5 w-3.5" />
                                {tx('অনুমোদন', 'Approve')}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="gap-1"
                                onClick={() => {
                                  setNote('')
                                  setReview({ row: p, action: 'REJECT' })
                                }}
                              >
                                {tx('বাতিল', 'Reject')}
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setPurchaseDeleteTarget(p)}
                            aria-label={tx('রেকর্ড মুছুন', 'Delete record')}
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
          </motion.div>
        )}
      </div>

      {/* ── Create / Edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? tx('কম্বো সম্পাদনা', 'Edit combo') : tx('নতুন কম্বো', 'New combo')}
            </DialogTitle>
            <DialogDescription>
              {tx(
                'শিরোনাম, মূল্য ও অন্তত ২টি আইটেম দিন — শিক্ষার্থী এক দামে সব পাবে।',
                'Provide a title, price and at least 2 items — students get everything at one price.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="combo-title">
                {tx('শিরোনাম', 'Title')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="combo-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={tx('যেমন: এসএসসি ফুল কোর্স + পরীক্ষা বান্ডেল', 'e.g. SSC full course + exam bundle')}
                maxLength={140}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="combo-desc">{tx('বর্ণনা (ডিটেইলস পেজে দেখাবে)', 'Description (shown on the detail page)')}</Label>
              <Textarea
                id="combo-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={5}
                maxLength={1200}
                placeholder={tx(
                  'শিক্ষার্থী যা জানতে চায় সব লিখে দিন — কম্বোতে কী কী আছে, কাদের জন্য, কীভাবে শুরু করবে, কতদিন অ্যাক্সেস পাবে…',
                  'Answer what students ask — what the bundle includes, who it is for, how to start, how long the access lasts…'
                )}
              />
              <p className="text-xs text-muted-foreground">
                {tx(
                  'কম্বোর ডিটেইলস পেজে ফিচার ইমেজের নিচে এই বর্ণনাটি দেখানো হবে।',
                  'This description appears below the feature image on the combo detail page.'
                )}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label>{tx('ফিচার ইমেজ (ঐচ্ছিক)', 'Feature image (optional)')}</Label>
              <ImageUpload value={formImageUrl} onChange={setFormImageUrl} />
              <p className="text-xs text-muted-foreground">
                {tx(
                  'আপলোড, মিডিয়া লাইব্রেরি বা URL — কম্বোটি কোর্সের মতো ছবিসহ দেখাবে।',
                  'Upload, pick from the media library, or paste a URL — the combo is shown with an image like a course.'
                )}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="combo-price">
                  {tx('মূল্য (৳)', 'Price (৳)')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="combo-price"
                  type="number"
                  min="0"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  placeholder="1990"
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium">{tx('সক্রিয়', 'Active')}</p>
                  <p className="text-xs text-muted-foreground">
                    {tx('নিষ্ক্রিয় কম্বো সাইটে দেখা যাবে না', 'Inactive combos are hidden from the site')}
                  </p>
                </div>
                <Switch checked={formActive} onCheckedChange={setFormActive} aria-label={tx('সক্রিয়', 'Active')} />
              </div>
            </div>

            {/* Items builder */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>
                  {tx('কম্বোর আইটেমসমূহ', 'Combo items')}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <span className="text-xs text-muted-foreground">
                  {num(formItems.length)} {tx('টি নির্বাচিত (ন্যূনতম ২)', 'selected (min 2)')}
                </span>
              </div>
              {formItems.map((row) => {
                const list = pickListFor(row.itemType)
                const picked = row.refId ? list.find((x) => x.id === row.refId) : undefined
                return (
                  <div key={row.key} className="flex flex-col gap-2 rounded-xl border p-2.5 sm:flex-row sm:items-center">
                    <Select
                      value={row.itemType}
                      onValueChange={(v) => updateItem(row.key, { itemType: v as ItemType, refId: '' })}
                    >
                      <SelectTrigger
                        className="w-full shrink-0 sm:w-36"
                        aria-label={tx('আইটেমের ধরন', 'Item type')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEM_TYPES.map((tp) => (
                          <SelectItem key={tp} value={tp}>
                            {tx(TYPE_META[tp].bn, TYPE_META[tp].en)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={row.refId}
                      onValueChange={(v) => updateItem(row.key, { refId: v })}
                    >
                      <SelectTrigger className="w-full" aria-label={tx('আইটেম নির্বাচন', 'Select item')}>
                        <SelectValue
                          placeholder={
                            list.length === 0
                              ? tx('কোনো আইটেম নেই', 'No items available')
                              : tx('আইটেম নির্বাচন করুন…', 'Select an item…')
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {list.map((entry) => (
                          <SelectItem key={entry.id} value={entry.id}>
                            <span className="flex max-w-[320px] items-center justify-between gap-2">
                              <span className="truncate">{entry.title}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {entryPrice(row.itemType, entry) > 0
                                  ? fmtBDT(entryPrice(row.itemType, entry), lang)
                                  : tx('ফ্রি', 'Free')}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      {picked ? (
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          {picked.title.slice(0, 18)}
                          {picked.title.length > 18 ? '…' : ''}
                        </span>
                      ) : (
                        <span />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeItemRow(row.key)}
                        disabled={formItems.length <= 1}
                        aria-label={tx('আইটেম সরান', 'Remove item')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={addItemRow}
                  disabled={formItems.length >= 20}
                >
                  <Plus className="h-4 w-4" />
                  {tx('আইটেম যোগ করুন', 'Add item')}
                </Button>
                {savings > 0 && (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {tx('মোট মূল্য সাশ্রয়', 'Total savings')}: {fmtBDT(savings, lang)}{' '}
                    {itemsListTotal > 0
                      ? `(${num(Math.round((savings / itemsListTotal) * 100))}%)`
                      : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {tx(
                  'কোর্স, লিখিত পরীক্ষা ও সাজেশন — যেকোনো মিশ্রণে অন্তত ২টি আইটেম দিন। আইটেমগুলোর বর্তমান শিরোনাম কম্বোর সাথে সংরক্ষিত হয়।',
                  'Courses, written exams and suggestions — at least 2 items in any mix. Item titles are snapshotted with the combo.'
                )}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {tx('বাতিল', 'Cancel')}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? tx('আপডেট করুন', 'Update') : tx('তৈরি করুন', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete combo confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('কম্বোটি মুছে ফেলবেন?', 'Delete this combo?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `"${deleteTarget?.title ?? ''}" স্থায়ীভাবে মুছে যাবে। আগের কেনা কম্বোগুলোর শিক্ষার্থী অ্যাক্সেস অপরিবর্তিত থাকবে।`,
                `"${deleteTarget?.title ?? ''}" will be permanently deleted. Access already granted to students is preserved.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{tx('বাতিল', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {tx('মুছুন', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Purchase review dialog (approve/reject with optional note) ── */}
      <Dialog open={Boolean(review)} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <ShieldAlert className="h-5 w-5 text-primary" />
              {review?.action === 'APPROVE'
                ? tx('কম্বো অনুমোদন করুন', 'Approve combo purchase')
                : tx('প্রত্যাখ্যান করুন', 'Reject purchase')}
            </DialogTitle>
            <DialogDescription>
              {review?.row.combo?.title} · {review ? fmtBDT(review.row.amount, lang) : ''} ·{' '}
              {review?.row.user?.name}
            </DialogDescription>
          </DialogHeader>
          {review?.action === 'APPROVE' && (
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              {tx(
                'অনুমোদন করলে কম্বোর প্রতিটি আইটেম (কোর্স, পরীক্ষা, সাজেশন) সাথে সাথেই শিক্ষার্থীর অ্যাকাউন্টে যোগ হয়ে যাবে।',
                'Approving instantly grants every item in the bundle to the student’s account.'
              )}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="combo-note">{tx('নোট (ঐচ্ছিক)', 'Note (optional)')}</Label>
            <Textarea id="combo-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setReview(null)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={() => void submitReview()}
              disabled={reviewBusy}
              variant={review?.action === 'APPROVE' ? 'default' : 'destructive'}
              className={review?.action === 'APPROVE' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}
            >
              {reviewBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {review?.action === 'APPROVE' ? tx('অনুমোদন করুন', 'Approve') : tx('প্রত্যাখ্যান করুন', 'Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Purchase record delete confirm ── */}
      <AlertDialog open={!!purchaseDeleteTarget} onOpenChange={(o) => !o && setPurchaseDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('ক্রয় রেকর্ড মুছে ফেলবেন?', 'Delete this purchase record?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `"${purchaseDeleteTarget?.combo?.title ?? ''}" (${purchaseDeleteTarget ? fmtBDT(purchaseDeleteTarget.amount, lang) : ''} — ${purchaseDeleteTarget?.user?.name ?? ''}) রেকর্ডটি স্থায়ীভাবে মুছে যাবে।`,
                `"${purchaseDeleteTarget?.combo?.title ?? ''}" (${purchaseDeleteTarget ? fmtBDT(purchaseDeleteTarget.amount, lang) : ''} — ${purchaseDeleteTarget?.user?.name ?? ''}) will be permanently deleted.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purchaseDeleting}>{tx('বাতিল', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={purchaseDeleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmPurchaseDelete()
              }}
            >
              {purchaseDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {tx('মুছুন', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

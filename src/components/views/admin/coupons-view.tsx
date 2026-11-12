'use client'

/**
 * AdminCouponsView — coupon manager: create/edit/delete discount coupons,
 * search by code, activate/deactivate toggle, copy-code shortcut.
 * API: /api/admin/coupons (GET ?q, POST) · /api/admin/coupons/[id] (PUT, DELETE)
 */

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  BadgePercent,
  CalendarDays,
  Check,
  Copy,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldX,
  Ticket,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  BulkBar,
  DetailsDialog,
  RowBox,
  ScrollX,
  SelectAll,
  useBulkSelection,
} from '@/components/admin/data-tools'
import { EmptyState } from '@/components/shared/empty-state'
import { apiDelete, apiGet, apiPost, apiPut, apiSend } from '@/lib/api-client'
import { COUPON_SCOPES, parseCouponScopes, type CouponScope } from '@/lib/coupon'
import { digitsBn, fmtBDT, fmtDate } from '@/lib/format'
import { DateStamp } from '@/components/admin/date-stamp'
import { useAuth } from '@/store/auth-store'
import { go, useUI } from '@/store/ui-store'
import { isPanelRole, isOwner } from '@/lib/roles'

interface CouponRow {
  id: string
  code: string
  type: 'PERCENT' | 'FIXED'
  scopes: string // "ALL" or CSV of COURSE / EXAM / SUGGESTION
  value: number
  minAmount: number
  maxUses: number | null
  usedCount: number
  expiresAt: string | null
  isActive: boolean
  createdAt: string
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
        <Button className="mt-2" onClick={() => go('#/login')}>
          {tx('লগইন করুন', 'Go to login')}
        </Button>
      </CardContent>
    </Card>
  )
}

/** ISO string → value usable by <input type="datetime-local"> in the local zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AdminCouponsView() {
  const { user, status, initialized } = useAuth()
  const { tx, lang } = useUI()

  const [coupons, setCoupons] = useState<CouponRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CouponRow | null>(null)
  const [formCode, setFormCode] = useState('')
  const [formType, setFormType] = useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [formValue, setFormValue] = useState('10')
  const [formMinAmount, setFormMinAmount] = useState('0')
  const [formMaxUses, setFormMaxUses] = useState('')
  const [formExpires, setFormExpires] = useState('')
  const [formScopes, setFormScopes] = useState<CouponScope[]>([])
  const [formActive, setFormActive] = useState(true)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<CouponRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // Bulk selection + row details (shared admin data-tools)
  const bulk = useBulkSelection()
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [details, setDetails] = useState<CouponRow | null>(null)

  const num = (n: number | string) => (lang === 'bn' ? digitsBn(n) : String(n))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = query ? `/api/admin/coupons?q=${encodeURIComponent(query)}` : '/api/admin/coupons'
      const data = await apiGet<CouponRow[]>(url)
      setCoupons(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [tx, query])

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [load])

  // Debounced search → query
  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchInput.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  function openCreate() {
    setEditing(null)
    setFormCode('')
    setFormType('PERCENT')
    setFormValue('10')
    setFormMinAmount('0')
    setFormMaxUses('')
    setFormExpires('')
    setFormScopes([])
    setFormActive(true)
    setDialogOpen(true)
  }

  function openEdit(c: CouponRow) {
    setEditing(c)
    setFormCode(c.code)
    setFormType(c.type)
    setFormValue(String(c.value))
    setFormMinAmount(String(c.minAmount))
    setFormMaxUses(c.maxUses != null ? String(c.maxUses) : '')
    setFormExpires(toLocalInput(c.expiresAt))
    setFormScopes(parseCouponScopes(c.scopes))
    setFormActive(c.isActive)
    setDialogOpen(true)
  }

  async function handleSave() {
    const code = formCode.trim().toUpperCase()
    const value = Number(formValue)
    const minAmount = Number(formMinAmount || '0')

    if (!code) {
      toast.error(tx('কুপন কোড দিন', 'Coupon code is required'))
      return
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error(tx('ভ্যালু ০ এর বেশি হতে হবে', 'Value must be greater than 0'))
      return
    }
    if (formType === 'PERCENT' && value > 100) {
      toast.error(tx('শতাংশ ১০০ এর বেশি হতে পারে না', 'Percentage cannot exceed 100'))
      return
    }
    if (!Number.isFinite(minAmount) || minAmount < 0) {
      toast.error(tx('সর্বনিম্ন অর্ডার মূল্য ০ বা তার বেশি হতে হবে', 'Minimum amount must be 0 or more'))
      return
    }
    if (formMaxUses && (!Number.isInteger(Number(formMaxUses)) || Number(formMaxUses) < 1)) {
      toast.error(tx('সর্বোচ্চ ব্যবহার সংখ্যা সঠিক পূর্ণসংখ্যা দিন', 'Max uses must be a positive integer'))
      return
    }

    setSaving(true)
    try {
      const body = {
        code,
        type: formType,
        value,
        minAmount,
        maxUses: formMaxUses ? Number(formMaxUses) : null,
        expiresAt: formExpires ? new Date(formExpires).toISOString() : null,
        scopes: formScopes,
        isActive: formActive,
      }
      if (editing) {
        await apiPut(`/api/admin/coupons/${editing.id}`, body)
        toast.success(tx('কুপন আপডেট হয়েছে', 'Coupon updated'))
      } else {
        await apiPost('/api/admin/coupons', body)
        toast.success(tx('কুপন তৈরি হয়েছে', 'Coupon created'))
      }
      setDialogOpen(false)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সংরক্ষণ ব্যর্থ', 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(c: CouponRow, next: boolean) {
    setCoupons((list) => list.map((x) => (x.id === c.id ? { ...x, isActive: next } : x)))
    try {
      await apiPut(`/api/admin/coupons/${c.id}`, { isActive: next })
      toast.success(
        next ? tx('কুপন সক্রিয় করা হয়েছে', 'Coupon activated') : tx('কুপন নিষ্ক্রিয় করা হয়েছে', 'Coupon deactivated')
      )
    } catch (e) {
      setCoupons((list) => list.map((x) => (x.id === c.id ? { ...x, isActive: !next } : x)))
      toast.error(e instanceof Error ? e.message : tx('পরিবর্তন ব্যর্থ', 'Update failed'))
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiDelete(`/api/admin/coupons/${deleteTarget.id}`)
      toast.success(tx('কুপন মুছে ফেলা হয়েছে', 'Coupon deleted'))
      setDeleteTarget(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setDeleting(false)
    }
  }

  async function bulkDelete() {
    if (bulk.selected.length === 0) return
    setBulkDeleting(true)
    try {
      const r = await apiSend<{ deleted: number }>('/api/admin/bulk-delete', 'POST', {
        resource: 'coupons',
        ids: bulk.selected,
      })
      toast.success(tx(`${r.deleted} টি কুপন মুছে ফেলা হয়েছে`, `${r.deleted} coupon(s) deleted`))
      bulk.clear()
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setBulkDeleting(false)
    }
  }

  function copyCode(code: string) {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopiedCode(code)
        setTimeout(() => setCopiedCode((cur) => (cur === code ? null : cur)), 1500)
        toast.success(tx('কোড কপি হয়েছে', 'Code copied'))
      })
      .catch(() => toast.error(tx('কপি করা যায়নি', 'Copy failed')))
  }

  function couponValueLabel(c: CouponRow): string {
    return c.type === 'PERCENT' ? `${c.value}%` : fmtBDT(c.value)
  }

  function scopeLabel(c: CouponRow): string {
    const picked = parseCouponScopes(c.scopes)
    if (picked.length === 0 || picked.length === COUPON_SCOPES.length) {
      return tx('সব খাত', 'All types')
    }
    const en: Record<CouponScope, string> = { COURSE: 'Course', EXAM: 'Exam', SUGGESTION: 'Suggestion' }
    const bn: Record<CouponScope, string> = { COURSE: 'কোর্স', EXAM: 'পরীক্ষা', SUGGESTION: 'সাজেশন' }
    return picked.map((s) => (lang === 'bn' ? bn[s] : en[s])).join(' / ')
  }

  if (initialized && status !== 'loading' && (!user || !isOwner(user.role))) {
    return <AccessDenied />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{tx('কুপন ম্যানেজার', 'Coupon Manager')}</h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'ছাড় কুপন তৈরি করুন, সীমা ও মেয়াদ নিয়ন্ত্রণ করুন',
              'Create discount coupons, control limits and expiry'
            )}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          {tx('নতুন কুপন', 'New coupon')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={tx('কোড দিয়ে খুঁজুন…', 'Search by code…')}
          className="pl-9"
          aria-label={tx('কুপন সার্চ', 'Search coupons')}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : coupons.length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-7 w-7" />}
          title={query ? tx('কোনো কুপন মেলেনি', 'No coupons match') : tx('কোনো কুপন নেই', 'No coupons yet')}
          description={
            query
              ? tx('অন্য কোড দিয়ে খুঁজে দেখুন।', 'Try a different code.')
              : tx(
                  'প্রথম ছাড় কুপন তৈরি করে শিক্ষার্থীদের পুরস্কৃত করুন।',
                  'Create your first discount coupon to reward students.'
                )
          }
          actionLabel={query ? undefined : tx('নতুন কুপন', 'New coupon')}
          onAction={query ? undefined : openCreate}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden rounded-2xl border bg-card"
        >
          <ScrollX>
            <Table className="min-w-[1020px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <SelectAll
                      ids={coupons.map((c) => c.id)}
                      isSelected={bulk.isSelected}
                      onToggleAll={bulk.toggleAll}
                    />
                  </TableHead>
                  <TableHead>{tx('কোড', 'Code')}</TableHead>
                  <TableHead>{tx('ছাড়', 'Discount')}</TableHead>
                  <TableHead>{tx('প্রযোজ্য খাত', 'Applies to')}</TableHead>
                  <TableHead>{tx('ব্যবহার', 'Usage')}</TableHead>
                  <TableHead>{tx('সর্বনিম্ন অর্ডার', 'Min order')}</TableHead>
                  <TableHead>{tx('মেয়াদ', 'Expires')}</TableHead>
                  <TableHead>{tx('তৈরি', 'Created')}</TableHead>
                  <TableHead>{tx('স্ট্যাটাস', 'Status')}</TableHead>
                  <TableHead className="text-right">{tx('অ্যাকশন', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((c) => {
                  const expired = c.expiresAt != null && new Date(c.expiresAt).getTime() <= Date.now()
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <RowBox id={c.id} isSelected={bulk.isSelected} onToggle={bulk.toggle} />
                      </TableCell>
                      <TableCell className="cursor-pointer" onClick={() => setDetails(c)}>
                        <div className="flex items-center gap-1.5">
                          <code className="rounded bg-muted px-2 py-1 text-xs font-bold tracking-wide">
                            {c.code}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation()
                              copyCode(c.code)
                            }}
                            aria-label={tx(`কোড ${c.code} কপি করুন`, `Copy code ${c.code}`)}
                          >
                            {copiedCode === c.code ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            c.type === 'PERCENT'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                          }
                        >
                          <BadgePercent className="mr-1 h-3 w-3" />
                          {couponValueLabel(c)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            parseCouponScopes(c.scopes).length === COUPON_SCOPES.length
                              ? 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-muted text-muted-foreground'
                          }
                        >
                          <Ticket className="mr-1 h-3 w-3" />
                          {scopeLabel(c)}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {num(c.usedCount)} / {c.maxUses != null ? num(c.maxUses) : '∞'}
                      </TableCell>
                      <TableCell>{c.minAmount > 0 ? fmtBDT(c.minAmount) : '—'}</TableCell>
                      <TableCell>
                        {c.expiresAt ? (
                          <span className={expired ? 'text-destructive' : ''}>{fmtDate(c.expiresAt, lang)}</span>
                        ) : (
                          <span className="text-muted-foreground">{tx('নেই', 'Never')}</span>
                        )}
                      </TableCell>
                      <TableCell><DateStamp iso={c.createdAt} label={tx('তৈরির তারিখ', 'Created at')} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={c.isActive}
                            onCheckedChange={(v) => void toggleActive(c, v)}
                            aria-label={tx(`${c.code} ${c.isActive ? 'নিষ্ক্রিয়' : 'সক্রিয়'} করুন`, `${c.isActive ? 'Deactivate' : 'Activate'} ${c.code}`)}
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
                            <DropdownMenuItem onClick={() => copyCode(c.code)}>
                              {copiedCode === c.code ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                              {tx('কোড কপি', 'Copy code')}
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
                  )
                })}
              </TableBody>
            </Table>
          </ScrollX>
        </motion.div>
      )}

      {/* ── Create / Edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? tx('কুপন সম্পাদনা', 'Edit coupon') : tx('নতুন কুপন', 'New coupon')}
            </DialogTitle>
            <DialogDescription>
              {tx(
                'কোড, ছাড়ের ধরন ও শর্তাবলি দিন — চেকআউটে প্রযোজ্য হবে।',
                'Provide the code, discount type and rules — applied at checkout.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="coupon-code">
                {tx('কুপন কোড', 'Coupon code')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="coupon-code"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                placeholder="PATHSHALA20"
                className="font-mono uppercase"
                maxLength={24}
              />
              <p className="text-xs text-muted-foreground">
                {tx('শুধু A-Z, 0-9, হাইফেন ও আন্ডারস্কোর (২–২৪ অক্ষর)', 'Only A-Z, 0-9, hyphen and underscore (2–24 chars)')}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>{tx('ছাড়ের ধরন', 'Discount type')}</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as 'PERCENT' | 'FIXED')}>
                  <SelectTrigger className="w-full" aria-label={tx('ছাড়ের ধরন', 'Discount type')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT">{tx('শতাংশ (%)', 'Percent (%)')}</SelectItem>
                    <SelectItem value="FIXED">{tx('নির্দিষ্ট টাকা (৳)', 'Fixed amount (৳)')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="coupon-value">
                  {formType === 'PERCENT' ? tx('শতাংশ', 'Percent') : tx('টাকা (৳)', 'Amount (৳)')}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="coupon-value"
                  type="number"
                  min="1"
                  max={formType === 'PERCENT' ? 100 : undefined}
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="coupon-min">{tx('সর্বনিম্ন অর্ডার (৳)', 'Min order (৳)')}</Label>
                <Input
                  id="coupon-min"
                  type="number"
                  min="0"
                  value={formMinAmount}
                  onChange={(e) => setFormMinAmount(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="coupon-max">{tx('সর্বোচ্চ ব্যবহার', 'Max uses')}</Label>
                <Input
                  id="coupon-max"
                  type="number"
                  min="1"
                  value={formMaxUses}
                  onChange={(e) => setFormMaxUses(e.target.value)}
                  placeholder={tx('সীমাহীন', 'Unlimited')}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>{tx('প্রযোজ্য খাত — কোন কেনায় কুপনটি কাজ করবে', 'Applies to — which purchases it works for')}</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {COUPON_SCOPES.map((s) => {
                  const scopeBn: Record<CouponScope, string> = { COURSE: 'কোর্স', EXAM: 'পরীক্ষা', SUGGESTION: 'সাজেশন' }
                  const scopeEn: Record<CouponScope, string> = { COURSE: 'Course', EXAM: 'Exam', SUGGESTION: 'Suggestion' }
                  const checked = formScopes.includes(s)
                  return (
                    <label
                      key={s}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 transition-colors ${
                        checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setFormScopes((cur) => (v ? [...cur, s] : cur.filter((x) => x !== s)))
                        }
                        aria-label={lang === 'bn' ? scopeBn[s] : scopeEn[s]}
                      />
                      <span className="text-sm font-medium">{lang === 'bn' ? scopeBn[s] : scopeEn[s]}</span>
                    </label>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {tx(
                  'সবগুলো নির্বাচন করলে (বা কিছুই না করলে) কুপনটি কোর্স, পরীক্ষা ও সাজেশন — সব কেনায় কাজ করবে। নির্দিষ্ট খাত নির্বাচন করলে শুধু সেই খাতের চেকআউটেই প্রযোজ্য হবে।',
                  'Selecting all (or none) makes the coupon valid for course, exam and suggestion purchases alike. Picking specific types restricts it to those checkouts only.'
                )}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="coupon-expires">{tx('মেয়াদ শেষ', 'Expires at')}</Label>
              <Input
                id="coupon-expires"
                type="datetime-local"
                value={formExpires}
                onChange={(e) => setFormExpires(e.target.value)}
              />
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                {tx('খালি রাখলে মেয়াদহীন থাকবে', 'Leave empty for no expiry')}
              </p>
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">{tx('সক্রিয়', 'Active')}</p>
                <p className="text-xs text-muted-foreground">
                  {tx('নিষ্ক্রিয় কুপন চেকআউটে কাজ করবে না', 'Inactive coupons are rejected at checkout')}
                </p>
              </div>
              <Switch checked={formActive} onCheckedChange={setFormActive} aria-label={tx('সক্রিয়', 'Active')} />
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

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('কুপন মুছে ফেলবেন?', 'Delete this coupon?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `"${deleteTarget?.code ?? ''}" মুছে ফেলা হলে এটি আর চেকআউটে ব্যবহার করা যাবে না। পুরোনো অর্ডারের ছাড় অপরিবর্তিত থাকবে।`,
                `"${deleteTarget?.code ?? ''}" will no longer be usable at checkout. Discounts on past orders are preserved.`
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

      {/* ── Row details dialog ── */}
      <DetailsDialog
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        title={details?.code ?? ''}
        subtitle={tx('কুপনের বিস্তারিত তথ্য', 'Coupon details')}
        fields={
          details
            ? [
                { label: tx('কোড', 'Code'), value: details.code },
                { label: tx('ছাড়ের ধরন', 'Type'), value: details.type },
                { label: tx('মান', 'Value'), value: couponValueLabel(details) },
                { label: tx('প্রযোজ্য খাত', 'Applies to'), value: scopeLabel(details) },
                {
                  label: tx('সর্বনিম্ন অর্ডার', 'Min order'),
                  value: details.minAmount > 0 ? fmtBDT(details.minAmount) : '—',
                },
                {
                  label: tx('সর্বোচ্চ ব্যবহার', 'Max uses'),
                  value: details.maxUses != null ? num(details.maxUses) : '∞',
                },
                { label: tx('ব্যবহৃত হয়েছে', 'Used'), value: num(details.usedCount) },
                {
                  label: tx('মেয়াদ শেষ', 'Expires at'),
                  value: details.expiresAt ? fmtDate(details.expiresAt, lang) : tx('নেই', 'Never'),
                },
                {
                  label: tx('স্ট্যাটাস', 'Status'),
                  value: details.isActive ? tx('সক্রিয়', 'Active') : tx('নিষ্ক্রিয়', 'Inactive'),
                },
              ]
            : []
        }
        actions={
          details ? (
            <>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  if (!details) return
                  const c = details
                  setDetails(null)
                  openEdit(c)
                }}
              >
                <Pencil className="h-4 w-4" />
                {tx('সম্পাদনা', 'Edit')}
              </Button>
              <Button
                variant="destructive"
                className="gap-1.5"
                onClick={() => {
                  if (!details) return
                  const c = details
                  setDetails(null)
                  setDeleteTarget(c)
                }}
              >
                <Trash2 className="h-4 w-4" />
                {tx('মুছুন', 'Delete')}
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

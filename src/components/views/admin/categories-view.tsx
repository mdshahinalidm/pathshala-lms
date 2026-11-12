'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  BookOpen,
  Briefcase,
  Calculator,
  Code,
  FlaskConical,
  Globe,
  GraduationCap,
  Languages,
  LayoutGrid,
  Loader2,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Scale,
  ShieldX,
  Stethoscope,
  Tags,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  SelectAll,
  useBulkSelection,
} from '@/components/admin/data-tools'
import { EmptyState } from '@/components/shared/empty-state'
import { DateStamp } from '@/components/admin/date-stamp'
import { apiDelete, apiGet, apiPost, apiPut, apiSend } from '@/lib/api-client'
import { digitsBn } from '@/lib/format'
import { useAuth } from '@/store/auth-store'
import { go, useUI } from '@/store/ui-store'
import { isPanelRole, isOwner } from '@/lib/roles'

interface AdminCategory {
  id: string
  name: string
  nameEn: string | null
  slug: string
  icon: string
  order?: number
  _count?: { courses: number }
}

const ICON_PRESETS: Record<string, LucideIcon> = {
  Code,
  Calculator,
  BookOpen,
  Languages,
  Globe,
  Palette,
  FlaskConical,
  Briefcase,
  Stethoscope,
  Scale,
  GraduationCap,
}

function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_PRESETS[name] ?? LayoutGrid
  return <Icon className={className} />
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

export default function AdminCategoriesView() {
  const { user, status, initialized } = useAuth()
  const { tx } = useUI()

  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AdminCategory | null>(null)
  const [formName, setFormName] = useState('')
  const [formNameEn, setFormNameEn] = useState('')
  const [formIcon, setFormIcon] = useState('BookOpen')
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<AdminCategory | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Bulk selection + row details (shared admin data-tools)
  const bulk = useBulkSelection()
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [details, setDetails] = useState<AdminCategory | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<AdminCategory[]>('/api/categories')
      setCategories(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [tx])

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [load])

  function openCreate() {
    setEditing(null)
    setFormName('')
    setFormNameEn('')
    setFormIcon('BookOpen')
    setDialogOpen(true)
  }

  function openEdit(c: AdminCategory) {
    setEditing(c)
    setFormName(c.name)
    setFormNameEn(c.nameEn ?? '')
    setFormIcon(ICON_PRESETS[c.icon] ? c.icon : 'BookOpen')
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error(tx('ক্যাটাগরির নাম দিন', 'Category name is required'))
      return
    }
    setSaving(true)
    try {
      const body = { name: formName.trim(), nameEn: formNameEn.trim() || undefined, icon: formIcon }
      if (editing) {
        await apiPut(`/api/categories/${editing.id}`, body)
        toast.success(tx('ক্যাটাগরি আপডেট হয়েছে', 'Category updated'))
      } else {
        await apiPost('/api/categories', body)
        toast.success(tx('ক্যাটাগরি তৈরি হয়েছে', 'Category created'))
      }
      setDialogOpen(false)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সংরক্ষণ ব্যর্থ', 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiDelete(`/api/categories/${deleteTarget.id}`)
      toast.success(tx('ক্যাটাগরি মুছে ফেলা হয়েছে', 'Category deleted'))
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
        resource: 'categories',
        ids: bulk.selected,
      })
      toast.success(
        tx(`${r.deleted} টি ক্যাটাগরি মুছে ফেলা হয়েছে`, `${r.deleted} category(ies) deleted`)
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">
            {tx('ক্যাটাগরি ম্যানেজার', 'Category Manager')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'কোর্সের ক্যাটাগরি যোগ, সম্পাদনা ও বিন্যাস করুন',
              'Add, edit and organize course categories'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {categories.length > 0 && (
            <span className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium">
              <SelectAll
                ids={categories.map((c) => c.id)}
                isSelected={bulk.isSelected}
                onToggleAll={bulk.toggleAll}
              />
              {tx('সব নির্বাচন', 'Select all')}
            </span>
          )}
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            {tx('নতুন ক্যাটাগরি', 'New category')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-7 w-7" />}
          title={tx('কোনো ক্যাটাগরি নেই', 'No categories yet')}
          description={tx(
            'প্রথম ক্যাটাগরি তৈরি করে কোর্সগুলো গুছিয়ে রাখুন।',
            'Create your first category to organize courses.'
          )}
          actionLabel={tx('নতুন ক্যাটাগরি', 'New category')}
          onAction={openCreate}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {categories.map((c) => (
            <Card key={c.id} className="transition-shadow hover:shadow-md">
              <CardContent className="flex h-full items-start gap-3 p-4">
                <RowBox id={c.id} isSelected={bulk.isSelected} onToggle={bulk.toggle} />
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CategoryIcon name={c.icon} className="h-5.5 w-5.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3
                        className="cursor-pointer truncate font-semibold"
                        onClick={() => setDetails(c)}
                      >
                        {c.name}
                      </h3>
                      {c.nameEn && (
                        <p className="truncate text-xs text-muted-foreground">{c.nameEn}</p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          aria-label={tx('অ্যাকশন', 'Actions')}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
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
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {c.slug}
                    </code>
                    <Badge variant="secondary" className="text-xs">
                      {tx(`${digitsBn(c._count?.courses ?? 0)}টি কোর্স`, `${c._count?.courses ?? 0} courses`)}
                    </Badge>
                    <DateStamp iso={(c as { createdAt?: string }).createdAt} className="ml-auto text-right" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {/* ── Create / Edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? tx('ক্যাটাগরি সম্পাদনা', 'Edit category')
                : tx('নতুন ক্যাটাগরি', 'New category')}
            </DialogTitle>
            <DialogDescription>
              {tx(
                'ক্যাটাগরির নাম ও আইকন দিন — ক্যাটালগ ফিল্টারে দেখানো হবে।',
                'Provide a name and icon — shown in catalog filters.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cat-name">
                {tx('নাম', 'Name')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cat-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={tx('যেমন: বিসিএস প্রিপারেশন', 'e.g. BCS Preparation')}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cat-name-en">{tx('ইংরেজি নাম', 'English name')}</Label>
              <Input
                id="cat-name-en"
                value={formNameEn}
                onChange={(e) => setFormNameEn(e.target.value)}
                placeholder="e.g. BCS Preparation"
              />
              <p className="text-xs text-muted-foreground">
                {tx('ইংরেজি নাম দিলে slug সুন্দর হবে', 'A nice slug is generated from the English name')}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label>{tx('আইকন', 'Icon')}</Label>
              <Select value={formIcon} onValueChange={setFormIcon}>
                <SelectTrigger className="w-full" aria-label={tx('আইকন', 'Icon')}>
                  <SelectValue placeholder={tx('আইকন বাছুন', 'Pick an icon')} />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(ICON_PRESETS).map((key) => {
                    const Icon = ICON_PRESETS[key]
                    return (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-primary" />
                          {key}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
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
            <AlertDialogTitle>
              {tx('ক্যাটাগরি মুছে ফেলবেন?', 'Delete this category?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `"${deleteTarget?.name ?? ''}" মুছে ফেলা হলে এই ক্যাটাগরিতে থাকা কোর্সগুলো আনক্যাটাগরাইজড হয়ে যাবে।`,
                `Courses in "${deleteTarget?.name ?? ''}" will become uncategorized after deletion.`
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
        title={details?.name ?? ''}
        fields={
          details
            ? [
                { label: tx('নাম', 'Name'), value: details.name },
                { label: tx('ইংরেজি নাম', 'English name'), value: details.nameEn },
                { label: tx('স্লাগ', 'Slug'), value: details.slug },
                { label: tx('আইকন', 'Icon'), value: details.icon },
                {
                  label: tx('ক্রম', 'Order'),
                  value:
                    details.order != null
                      ? tx(digitsBn(details.order), String(details.order))
                      : '—',
                },
                {
                  label: tx('কোর্স সংখ্যা', 'Courses'),
                  value: tx(
                    `${digitsBn(details._count?.courses ?? 0)}টি কোর্স`,
                    `${details._count?.courses ?? 0} courses`
                  ),
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
        confirmMessage={tx(
          `${bulk.count} টি ক্যাটাগরি স্থায়ীভাবে মুছে যাবে — যুক্ত কোর্সগুলো মুছবে না, শুধু আনক্যাটাগরাইজড হবে।`,
          `${bulk.count} category(ies) will be permanently deleted. Linked courses are NOT deleted — they just become uncategorized.`
        )}
      />
    </div>
  )
}

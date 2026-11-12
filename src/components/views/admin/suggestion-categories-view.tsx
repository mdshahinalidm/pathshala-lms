'use client'

/**
 * AdminSuggestionCategoriesView — সাজেশন ক্যাটাগরি ব্যবস্থাপনা
 * (Admin → সাজেশনস → ক্যাটাগরি). Create / edit / delete suggestion
 * categories; the `name` is stored on every suggestion, so renaming
 * migrates existing suggestions automatically. A delete warns when the
 * category is still in use. Data: /api/admin/suggestion-categories.
 */
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, ShieldX, Tags, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { ScrollX } from '@/components/admin/data-tools'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client'
import { DateStamp } from '@/components/admin/date-stamp'
import { fmtDate } from '@/lib/format'
import { useAuth } from '@/store/auth-store'
import { go, useUI } from '@/store/ui-store'
import { isPanelRole } from '@/lib/roles'

interface SuggestionCategoryRow {
  id: string
  name: string
  nameBn: string | null
  description: string | null
  order: number
  createdAt: string
  _count?: { suggestions: number }
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

export default function AdminSuggestionCategoriesView() {
  const { user, status, initialized } = useAuth()
  const { t, tx, lang } = useUI()

  const [rows, setRows] = useState<SuggestionCategoryRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SuggestionCategoryRow | null>(null)
  const [formName, setFormName] = useState('')
  const [formNameBn, setFormNameBn] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<SuggestionCategoryRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<SuggestionCategoryRow[]>('/api/admin/suggestion-categories')
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড ব্যর্থ', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [tx])

  useEffect(() => {
    if (user && isPanelRole(user.role)) void load()
  }, [user, load])

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return <AccessDenied />
  }

  function openCreate() {
    setEditing(null)
    setFormName('')
    setFormNameBn('')
    setFormDesc('')
    setDialogOpen(true)
  }

  function openEdit(row: SuggestionCategoryRow) {
    setEditing(row)
    setFormName(row.name)
    setFormNameBn(row.nameBn ?? '')
    setFormDesc(row.description ?? '')
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error(tx('ক্যাটাগরির নাম আবশ্যক', 'Category name is required'))
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await apiPatch(`/api/admin/suggestion-categories/${editing.id}`, {
          name: formName.trim(),
          nameBn: formNameBn.trim() || null,
          description: formDesc.trim() || null,
        })
        toast.success(tx('ক্যাটাগরি আপডেট হয়েছে', 'Category updated'))
      } else {
        await apiPost('/api/admin/suggestion-categories', {
          name: formName.trim(),
          ...(formNameBn.trim() ? { nameBn: formNameBn.trim() } : {}),
          ...(formDesc.trim() ? { description: formDesc.trim() } : {}),
        })
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
      const res = await apiDelete<{ deleted: boolean; inUse: number }>(
        `/api/admin/suggestion-categories/${deleteTarget.id}`
      )
      if (res?.inUse > 0) {
        toast.success(
          tx(
            `মুছে ফেলা হয়েছে — ${res.inUse} টি সাজেশন এখনো এই নাম বহন করে (ডেটা অক্ষত)।`,
            `Deleted — ${res.inUse} suggestion(s) still carry this name (data intact).`
          )
        )
      } else {
        toast.success(tx('মুছে ফেলা হয়েছে', 'Deleted'))
      }
      setDeleteTarget(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setDeleting(false)
    }
  }

  const label = (row: SuggestionCategoryRow) =>
    lang === 'bn' ? row.nameBn?.trim() || row.name : row.name

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Tags className="h-6 w-6 text-primary" />
            {tx('সাজেশন ক্যাটাগরি', 'Suggestion Categories')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'সাজেশন আপলোডের সময় যেসব ক্যাটাগরি দেখা যাবে — এখান থেকেই তৈরি/এডিট করুন।',
              'Categories shown when uploading suggestions — create and edit them here.'
            )}
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" /> {tx('নতুন ক্যাটাগরি', 'New category')}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-7 w-7" />}
          title={tx('কোনো ক্যাটাগরি নেই', 'No categories yet')}
          description={tx(
            'সাজেশন গুছিয়ে রাখতে প্রথম ক্যাটাগরি তৈরি করুন।',
            'Create the first category to organise suggestions.'
          )}
          actionLabel={tx('নতুন ক্যাটাগরি', 'New category')}
          onAction={openCreate}
        />
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card>
            <CardContent className="p-0">
              <ScrollX>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">{tx('নাম', 'Name')}</TableHead>
                      <TableHead className="min-w-[200px]">{t('description')}</TableHead>
                      <TableHead>{tx('ক্রম', 'Order')}</TableHead>
                      <TableHead>{tx('সাজেশন', 'Suggestions')}</TableHead>
                      <TableHead>{t('date')}</TableHead>
                      <TableHead className="text-right">{t('actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <p className="text-sm font-semibold">{label(row)}</p>
                          {lang === 'bn' && row.nameBn && row.name !== row.nameBn && (
                            <p className="text-xs text-muted-foreground">{row.name}</p>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <p className="truncate text-sm text-muted-foreground">
                            {row.description || '—'}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">{row.order}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              (row._count?.suggestions ?? 0) > 0
                                ? 'border-primary/30 bg-primary/5 text-primary'
                                : ''
                            }
                          >
                            {row._count?.suggestions ?? 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DateStamp iso={row.createdAt} label={tx('তৈরির তারিখ', 'Created at')} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(row)}
                              aria-label={t('edit')}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(row)}
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

      {/* ── Create / edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? tx('ক্যাটাগরি এডিট করুন', 'Edit category')
                : tx('নতুন ক্যাটাগরি', 'New category')}
            </DialogTitle>
            <DialogDescription>
              {tx(
                'নামটি সাজেশন আপলোড ফর্মের ক্যাটাগরি ড্রপডাউনে দেখা যাবে।',
                'This name appears in the suggestion upload form category dropdown.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>
                {tx('নাম (English)', 'Name (English)')} <span className="text-destructive">*</span>
              </Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="SSC"
                maxLength={60}
              />
            </div>
            <div className="grid gap-2">
              <Label>{tx('বাংলা নাম (ঐচ্ছিক)', 'Bangla name (optional)')}</Label>
              <Input
                value={formNameBn}
                onChange={(e) => setFormNameBn(e.target.value)}
                placeholder="এসএসসি"
                maxLength={60}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('description')}</Label>
              <Textarea
                rows={2}
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder={tx('সংক্ষিপ্ত বিবরণ', 'Short description')}
                maxLength={300}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
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

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('মুছে ফেলবেন?', 'Delete this?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {`"${label(deleteTarget ?? { name: '', nameBn: null } as SuggestionCategoryRow)}" ${tx(
                'ক্যাটাগরিটি স্থায়ীভাবে মুছে যাবে।',
                'category will be permanently deleted.'
              )} `}
              {(deleteTarget?._count?.suggestions ?? 0) > 0
                ? tx(
                    `${deleteTarget?._count?.suggestions} টি সাজেশন এই ক্যাটাগরিতে আছে — সাজেশনগুলো অক্ষত থাকবে, শুধু ড্রপডাউন থেকে সরে যাবে।`,
                    `${deleteTarget?._count?.suggestions} suggestion(s) use it — the suggestions stay intact; only the dropdown entry goes away.`
                  )
                : tx('এই ক্যাটাগরিতে কোনো সাজেশন নেই।', 'No suggestions use this category.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

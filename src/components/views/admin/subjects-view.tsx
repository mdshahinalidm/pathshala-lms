'use client'

/**
 * AdminSubjectsView — CRUD for course Subjects (Physics, Chemistry, …).
 * Follows the Categories view's design language exactly (same cards,
 * search bar, dialogs) — part of the Catalog group, under Categories.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  BookMarked,
  Loader2,
  Pencil,
  Plus,
  Search,
  Shapes,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
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
import { EmptyState } from '@/components/shared/empty-state'
import { DateStamp } from '@/components/admin/date-stamp'
import { apiGet, apiSend } from '@/lib/api-client'
import { useUI } from '@/store/ui-store'

interface SubjectRow {
  id: string
  name: string
  nameEn: string | null
  slug: string
  _count?: { courses: number }
}

export default function AdminSubjectsView() {
  const { tx } = useUI()
  const [rows, setRows] = useState<SubjectRow[] | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<SubjectRow | null>(null)
  const [editing, setEditing] = useState<SubjectRow | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ name: '', nameEn: '' })

  const load = useCallback(async () => {
    try {
      const data = await apiGet<SubjectRow[]>('/api/subjects')
      setRows(data ?? [])
    } catch {
      toast.error(tx('লোড করা যায়নি', 'Failed to load'))
      setRows([])
    }
  }, [tx])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.nameEn ?? '').toLowerCase().includes(q) ||
        r.slug.includes(q),
    )
  }, [rows, search])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', nameEn: '' })
    setDialogOpen(true)
  }

  const openEdit = (row: SubjectRow) => {
    setEditing(row)
    setForm({ name: row.name, nameEn: row.nameEn ?? '' })
    setDialogOpen(true)
  }

  async function save() {
    if (form.name.trim().length < 1) {
      toast.error(tx('নাম লিখুন', 'Enter a name'))
      return
    }
    setSaving(true)
    try {
      // Subject names are always English — store the English name in both
      // `name` and `nameEn` so every surface displays English.
      const english = form.name.trim()
      if (editing) {
        await apiSend(`/api/subjects/${editing.id}`, 'PATCH', {
          name: english,
          nameEn: english || undefined,
        })
        toast.success(tx('সাবজেক্ট আপডেট হয়েছে ✓', 'Subject updated ✓'))
      } else {
        await apiSend('/api/subjects', 'POST', {
          name: english,
          nameEn: english || undefined,
        })
        toast.success(tx('সাবজেক্ট তৈরি হয়েছে ✓', 'Subject created ✓'))
      }
      setDialogOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সেভ ব্যর্থ', 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(row: SubjectRow) {
    setBusy(true)
    try {
      await apiSend(`/api/subjects/${row.id}`, 'DELETE')
      toast.success(tx('সাবজেক্ট মুছে ফেলা হয়েছে', 'Subject deleted'))
      setDeleting(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{tx('সাবজেক্ট ম্যানেজমেন্ট', 'Subjects')}</h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'কোর্সের সাবজেক্ট (পদার্থবিজ্ঞান, রসায়ন…) তৈরি ও ম্যানেজ করুন — কোর্স এডিট করে সাবজেক্ট যুক্ত করুন।',
              'Create and manage course subjects — assign them from the course editor.'
            )}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> {tx('নতুন সাবজেক্ট', 'New subject')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tx('সাবজেক্ট খুঁজুন…', 'Search subjects…')}
          className="pl-9"
        />
      </div>

      {/* List */}
      {rows === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <EmptyState
              icon={<Shapes className="h-7 w-7" />}
              title={rows.length === 0 ? tx('কোনো সাবজেক্ট নেই', 'No subjects yet') : tx('ম্যাচ পাওয়া যায়নি', 'No matches')}
              description={
                rows.length === 0
                  ? tx('কোর্সে ব্যবহারের জন্য প্রথম সাবজেক্টটি তৈরি করুন।', 'Create the first subject to use in your courses.')
                  : tx('অন্য কিছু লিখে আবার চেষ্টা করুন।', 'Try a different search.')
              }
              actionLabel={rows.length === 0 ? tx('নতুন সাবজেক্ট', 'New subject') : undefined}
              onAction={rows.length === 0 ? openCreate : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((row, i) => (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.2) }}
            >
              <Card className="group transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="grad-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-md">
                    <BookMarked className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{row.nameEn || row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.nameEn && row.name !== row.nameEn ? row.name : row.slug}
                    </p>
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {row._count?.courses ?? 0} {tx('টি কোর্স', 'courses')}
                    </Badge>
                    <DateStamp
                      iso={(row as { createdAt?: string }).createdAt}
                      label={tx('তৈরির তারিখ', 'Created at')}
                      className="mt-1.5"
                    />
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => openEdit(row)}
                      aria-label={tx('এডিট', 'Edit')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleting(row)}
                      aria-label={tx('মুছুন', 'Delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? tx('সাবজেক্ট এডিট করুন', 'Edit subject') : tx('নতুন সাবজেক্ট', 'New subject')}
            </DialogTitle>
            <DialogDescription>
              {tx(
                'সাবজেক্টের নাম সবসময় ইংরেজিতে লিখুন — সাইটের সব জায়গায় ইংরেজিতেই দেখানো হবে।',
                'Subject names are always in English — they are shown in English everywhere.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="subject-name">{tx('নাম (ইংরেজি) — আবশ্যক', 'Name (English) — required')}</Label>
              <Input
                id="subject-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Physics"
              />
              <p className="text-xs text-muted-foreground">
                {tx('যেমন: Physics, Chemistry, Accounting, ICT…', 'e.g. Physics, Chemistry, Accounting, ICT…')}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {tx('বাতিল', 'Cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? tx('সংরক্ষণ', 'Save') : tx('তৈরি করুন', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('সাবজেক্ট মুছে ফেলবেন?', 'Delete this subject?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? tx(
                    `"${deleting.name}" মুছে ফেলা হবে। এই সাবজেক্টটি কোর্স থেকে সরে যাবে, কিন্তু কোর্সের কোনো তথ্য নষ্ট হবে না।`,
                    `"${deleting.name}" will be removed. It is detached from its courses, but no course data is lost.`
                  )
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{tx('বাতিল', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                if (deleting) void remove(deleting)
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tx('মুছে ফেলুন', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

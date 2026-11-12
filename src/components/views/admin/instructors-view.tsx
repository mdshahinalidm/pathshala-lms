'use client'

/**
 * AdminInstructorsView — the INSTRUCTOR section.
 *
 * The owner/admin creates instructors here (name, designation, bio, photo,
 * visibility, order). Every instructor added here automatically appears on
 * the public About page ("Our Team") and becomes selectable in the course
 * creator's instructor dropdown — course forms no longer type free-text
 * instructor profiles, they SELECT from this section.
 */
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldX,
  Trash2,
  UserCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
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
import { ImageUpload } from '@/components/admin/image-upload'
import { EmptyState } from '@/components/shared/empty-state'
import { apiDelete, apiGet, apiPost, apiSend } from '@/lib/api-client'
import { digitsBn } from '@/lib/format'
import { useAuth } from '@/store/auth-store'
import { isManagerRole } from '@/lib/roles'
import { useUI } from '@/store/ui-store'

interface InstructorRow {
  id: string
  name: string
  nameEn?: string | null
  designation?: string | null
  designationEn?: string | null
  bio?: string | null
  bioEn?: string | null
  photoUrl?: string | null
  email?: string | null
  phone?: string | null
  isActive: boolean
  order: number
  createdAt: string
  _count?: { courses: number }
}

interface FormState {
  name: string
  nameEn: string
  designation: string
  designationEn: string
  bio: string
  bioEn: string
  photoUrl: string
  email: string
  phone: string
  isActive: boolean
  order: string
}

const BLANK_FORM: FormState = {
  name: '',
  nameEn: '',
  designation: '',
  designationEn: '',
  bio: '',
  bioEn: '',
  photoUrl: '',
  email: '',
  phone: '',
  isActive: true,
  order: '0',
}

export default function AdminInstructorsView() {
  const { user, status, initialized } = useAuth()
  const { t, tx, lang } = useUI()

  const [instructors, setInstructors] = useState<InstructorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<InstructorRow | null>(null)
  const [form, setForm] = useState<FormState>(BLANK_FORM)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<InstructorRow | null>(null)

  const canManage = !!user && isManagerRole(user.role)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<InstructorRow[]>('/api/admin/instructors')
      setInstructors(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setForm(BLANK_FORM)
    setDialogOpen(true)
  }

  function openEdit(ins: InstructorRow) {
    setEditing(ins)
    setForm({
      name: ins.name ?? '',
      nameEn: ins.nameEn ?? '',
      designation: ins.designation ?? '',
      designationEn: ins.designationEn ?? '',
      bio: ins.bio ?? '',
      bioEn: ins.bioEn ?? '',
      photoUrl: ins.photoUrl ?? '',
      email: ins.email ?? '',
      phone: ins.phone ?? '',
      isActive: ins.isActive,
      order: String(ins.order ?? 0),
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (form.name.trim().length < 2) {
      toast.error(tx('ইন্সট্রাক্টরের নাম দিন (কমপক্ষে ২ অক্ষর)', 'Enter a name (at least 2 characters)'))
      return
    }
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        nameEn: form.nameEn.trim() || null,
        designation: form.designation.trim() || null,
        designationEn: form.designationEn.trim() || null,
        bio: form.bio.trim() || null,
        bioEn: form.bioEn.trim() || null,
        photoUrl: form.photoUrl.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        isActive: form.isActive,
        order: Number(form.order || 0),
      }
      if (editing) {
        await apiSend(`/api/admin/instructors/${editing.id}`, 'PATCH', body)
        toast.success(
          tx(
            'ইন্সট্রাক্টর আপডেট হয়েছে — যুক্ত কোর্স ও About পেজেও হালনাগাদ হয়েছে',
            'Instructor updated — linked courses and the About page refreshed too'
          )
        )
      } else {
        await apiPost('/api/admin/instructors', body)
        toast.success(
          tx(
            'ইন্সট্রাক্টর যোগ হয়েছে — About পেজের "আমাদের টিম"-এ দেখা যাবে',
            'Instructor added — they now appear in "Our Team" on the About page'
          )
        )
      }
      setDialogOpen(false)
      setEditing(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সংরক্ষণ ব্যর্থ', 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(ins: InstructorRow, active: boolean) {
    setBusyId(ins.id)
    try {
      await apiSend(`/api/admin/instructors/${ins.id}`, 'PATCH', { isActive: active })
      toast.success(
        active
          ? tx('About পেজে দেখানো হবে', 'Visible on the About page')
          : tx('About পেজ থেকে লুকানো হলো', 'Hidden from the About page')
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপডেট ব্যর্থ', 'Update failed'))
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    try {
      await apiDelete(`/api/admin/instructors/${deleteTarget.id}`)
      toast.success(tx('ইন্সট্রাক্টর মুছে ফেলা হয়েছে', 'Instructor deleted'))
      setDeleteTarget(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setBusyId(null)
    }
  }

  if (initialized && status !== 'loading' && (!user || !isManagerRole(user.role))) {
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

  const q = search.trim().toLowerCase()
  const filtered = q
    ? instructors.filter((i) =>
        `${i.name} ${i.nameEn ?? ''} ${i.designation ?? ''}`.toLowerCase().includes(q)
      )
    : instructors
  const activeCount = instructors.filter((i) => i.isActive).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">
            {tx('ইন্সট্রাক্টর', 'Instructors')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'শিক্ষক প্রোফাইল তৈরি করুন — সবাই About পেজের "আমাদের টিম"-এ দেখাবে এবং কোর্স তৈরির সময় ড্রপডাউন থেকে নির্বাচন করা যাবে।',
              'Create teacher profiles — they all appear in "Our Team" on the About page and become selectable in the course form dropdown.'
            )}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tx('নাম বা পদবি খুঁজুন...', 'Search name or role...')}
              className="pl-9"
            />
          </div>
          {canManage && (
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {tx('ইন্সট্রাক্টর যোগ করুন', 'Add instructor')}
            </Button>
          )}
        </div>
      </div>

      {/* Stats chips */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: UserCheck,
            label: tx('মোট ইন্সট্রাক্টর', 'Total instructors'),
            value: digitsBn(instructors.length),
          },
          {
            icon: Eye,
            label: tx('About পেজে দৃশ্যমান', 'Visible on About'),
            value: digitsBn(activeCount),
          },
          {
            icon: EyeOff,
            label: tx('লুকানো', 'Hidden'),
            value: digitsBn(instructors.length - activeCount),
          },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <c.icon className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-lg font-bold leading-tight">{c.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={
            search
              ? tx('কিছু পাওয়া যায়নি', 'Nothing found')
              : tx('কোনো ইন্সট্রাক্টর নেই', 'No instructors yet')
          }
          description={
            search
              ? tx('অন্য কীওয়ার্ড দিয়ে খুঁজে দেখুন।', 'Try a different keyword.')
              : tx(
                  '"ইন্সট্রাক্টর যোগ করুন" বাটনে ক্লিক করে প্রথম শিক্ষক প্রোফাইল তৈরি করুন।',
                  'Click "Add instructor" to create the first teacher profile.'
                )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((ins, i) => (
            <motion.div
              key={ins.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}
            >
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start gap-3">
                    {ins.photoUrl ? (
                      <img
                        src={ins.photoUrl}
                        alt={ins.name}
                        className="h-14 w-14 shrink-0 rounded-full border-2 border-primary/25 object-cover"
                      />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                        {ins.name.charAt(0)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{ins.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {ins.designation || tx('পদবি নেই', 'No designation')}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={
                            ins.isActive
                              ? 'border-emerald-300 text-emerald-700'
                              : 'text-muted-foreground'
                          }
                        >
                          {ins.isActive
                            ? tx('দৃশ্যমান', 'Visible')
                            : tx('লুকানো', 'Hidden')}
                        </Badge>
                        <Badge variant="secondary">
                          {digitsBn(ins._count?.courses ?? 0)} {tx('কোর্স', 'courses')}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {ins.bio ? (
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {ins.bio}
                    </p>
                  ) : null}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={ins.isActive}
                        disabled={busyId === ins.id || !canManage}
                        onCheckedChange={(v) => void toggleActive(ins, v)}
                        aria-label={tx('About পেজে দেখাও', 'Show on About page')}
                      />
                      <span className="text-[11px] text-muted-foreground">
                        {tx('About পেজে', 'On About page')}
                      </span>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(ins)}
                          aria-label={t('edit')}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={busyId === ins.id}
                          onClick={() => setDeleteTarget(ins)}
                          aria-label={t('delete')}
                        >
                          {busyId === ins.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Create / edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? tx('ইন্সট্রাক্টর সম্পাদনা', 'Edit instructor')
                : tx('নতুন ইন্সট্রাক্টর যোগ করুন', 'Add a new instructor')}
            </DialogTitle>
            <DialogDescription>
              {tx(
                'এই প্রোফাইলটি About পেজের "আমাদের টিম"-এ দেখাবে এবং কোর্স তৈরির সময় নির্বাচন করা যাবে।',
                'This profile appears in "Our Team" on the About page and can be selected when creating courses.'
              )}
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>
                {tx('নাম (বাংলা)', 'Name (Bangla)')} <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={tx('যেমন: ড. আনিসুর রহমান', 'e.g. Dr. Anisur Rahman')}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{tx('নাম (English)', 'Name (English)')}</Label>
              <Input
                value={form.nameEn}
                onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
                placeholder="e.g. Dr. Anisur Rahman"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>{tx('পদবি (বাংলা)', 'Designation (Bangla)')}</Label>
                <Input
                  value={form.designation}
                  onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                  placeholder={tx('যেমন: গণিত শিক্ষক', 'e.g. Math Instructor')}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{tx('পদবি (English)', 'Designation (English)')}</Label>
                <Input
                  value={form.designationEn}
                  onChange={(e) => setForm((f) => ({ ...f, designationEn: e.target.value }))}
                  placeholder="e.g. Math Instructor"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>{tx('ছোট পরিচিতি (বাংলা)', 'Short bio (Bangla)')}</Label>
              <Textarea
                rows={2}
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                placeholder={tx('১-২ লাইনে পরিচিতি', '1-2 line introduction')}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{tx('ছোট পরিচিতি (English)', 'Short bio (English)')}</Label>
              <Textarea
                rows={2}
                value={form.bioEn}
                onChange={(e) => setForm((f) => ({ ...f, bioEn: e.target.value }))}
                placeholder="Short introduction"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{tx('প্রোফাইল ছবি', 'Profile photo')}</Label>
              <ImageUpload
                value={form.photoUrl}
                onChange={(v) => setForm((f) => ({ ...f, photoUrl: v }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>{t('email')}</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="teacher@pathshala.com"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{t('phone')}</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+880 1X XXXXXXXX"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>{tx('প্রদর্শনের ক্রম', 'Display order')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.order}
                  onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
                />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch
                  id="ins-active"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                />
                <Label htmlFor="ins-active" className="text-sm font-normal">
                  {tx('About পেজে দৃশ্যমান', 'Visible on the About page')}
                </Label>
              </div>
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

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tx('ইন্সট্রাক্টর মুছে ফেলবেন?', 'Delete this instructor?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `"${deleteTarget?.name ?? ''}" About পেজ ও কোর্স ড্রপডাউন থেকে সরে যাবে। তার কোর্সগুলোতে শেষ পরিচিতিটি প্রদর্শিত থাকবে — কোর্সের কোনো ডেটা মুছবে না।`,
                `"${deleteTarget?.name ?? ''}" will be removed from the About page and the course dropdown. Their linked courses keep the last profile snapshot — no course data is deleted.`
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
    </div>
  )
}

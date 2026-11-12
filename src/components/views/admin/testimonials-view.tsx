'use client'

/**
 * AdminTestimonialsView — CRUD for the home page's curated
 * testimonial cards ("শিক্ষার্থীদের মতামত"). While the table is empty the
 * home page keeps showing real course reviews, so adding the FIRST
 * testimonial is the explicit switch to curated mode.
 *
 * Data: GET/POST /api/admin/testimonials · PATCH/DELETE /api/admin/testimonials/[id]
 * Photo upload goes through the shared ImageUpload (media library linked).
 */
import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  Eye,
  EyeOff,
  Loader2,
  MessageSquareQuote,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { ScrollX } from '@/components/admin/data-tools'
import { ImageUpload } from '@/components/admin/image-upload'
import { DateStamp } from '@/components/admin/date-stamp'
import { useUI } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { apiGet, apiSend } from '@/lib/api-client'
import { digitsBn } from '@/lib/format'
import { isPanelRole } from '@/lib/roles'

interface TestimonialRow {
  id: string
  name: string
  role: string
  roleEn: string
  rating: number
  comment: string
  photoUrl: string | null
  order: number
  isActive: boolean
  createdAt: string
}

interface FormState {
  name: string
  role: string
  roleEn: string
  rating: number
  comment: string
  photoUrl: string
  order: number
  isActive: boolean
}

const EMPTY_FORM: FormState = {
  name: '',
  role: '',
  roleEn: '',
  rating: 5,
  comment: '',
  photoUrl: '',
  order: 0,
  isActive: true,
}

function Stars({ rating, className = 'h-3.5 w-3.5' }: { rating: number; className?: string }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${className} ${i <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
          aria-hidden
        />
      ))}
    </span>
  )
}

export default function AdminTestimonialsView() {
  const { tx, t, lang } = useUI()
  const { user, status, initialized } = useAuth()

  const [rows, setRows] = useState<TestimonialRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TestimonialRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const canManage = user && isPanelRole(user.role)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<TestimonialRow[]>('/api/admin/testimonials')
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড ব্যর্থ', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [tx])

  useEffect(() => {
    if (!user || !isPanelRole(user.role)) return
    void load()
  }, [user, load])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (row: TestimonialRow) => {
    setEditing(row)
    setForm({
      name: row.name,
      role: row.role ?? '',
      roleEn: row.roleEn ?? '',
      rating: row.rating,
      comment: row.comment,
      photoUrl: row.photoUrl ?? '',
      order: row.order ?? 0,
      isActive: row.isActive,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (form.name.trim().length < 2) {
      toast.error(tx('নাম কমপক্ষে ২ অক্ষরের দিন', 'Name must be at least 2 characters'))
      return
    }
    if (!form.comment.trim()) {
      toast.error(tx('মতামত লিখুন', 'Please write the testimonial text'))
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        role: form.role.trim(),
        roleEn: form.roleEn.trim(),
        rating: form.rating,
        comment: form.comment.trim(),
        photoUrl: form.photoUrl.trim(),
        order: Number.isFinite(form.order) ? form.order : 0,
        isActive: form.isActive,
      }
      if (editing) {
        await apiSend(`/api/admin/testimonials/${editing.id}`, 'PATCH', payload)
        toast.success(tx('টেস্টিমোনিয়াল আপডেট হয়েছে', 'Testimonial updated'))
      } else {
        await apiSend('/api/admin/testimonials', 'POST', payload)
        toast.success(tx('টেস্টিমোনিয়াল যোগ হয়েছে', 'Testimonial created'))
      }
      setDialogOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সেভ ব্যর্থ', 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (row: TestimonialRow) => {
    try {
      await apiSend(`/api/admin/testimonials/${row.id}`, 'PATCH', { isActive: !row.isActive })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('পরিবর্তন ব্যর্থ', 'Update failed'))
    }
  }

  const handleDelete = async (row: TestimonialRow) => {
    if (!window.confirm(tx(`"${row.name}"-এর টেস্টিমোনিয়াল মুছে ফেলবেন?`, `Delete the testimonial from "${row.name}"?`))) return
    setDeletingId(row.id)
    try {
      await apiSend(`/api/admin/testimonials/${row.id}`, 'DELETE')
      toast.success(tx('মুছে ফেলা হয়েছে', 'Deleted'))
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('ডিলিট ব্যর্থ', 'Delete failed'))
    } finally {
      setDeletingId(null)
    }
  }

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        {tx('প্রবেশাধিকার নেই', 'Access denied')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <MessageSquareQuote className="h-6 w-6 text-primary" />
            {tx('টেস্টিমোনিয়াল', 'Testimonials')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'হোম পেজের "শিক্ষার্থীদের মতামত" সেকশনের কার্ডগুলো এখান থেকে নিয়ন্ত্রিত হয় — নিজের মতো যোগ করুন।',
              'Controls the home page testimonial cards — add as many as you like.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t('retry')}
          </Button>
          {canManage && (
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {tx('যোগ করুন', 'Add testimonial')}
            </Button>
          )}
        </div>
      </div>

      {/* Empty-state hint */}
      {rows !== null && rows.length === 0 && !loading && (
        <div className="rounded-2xl border border-dashed bg-muted/30 p-6 text-center">
          <p className="text-sm font-semibold">{tx('এখনো কোনো টেস্টিমোনিয়াল নেই', 'No testimonials yet')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tx(
              'এই তালিকাই হোম পেজের "শিক্ষার্থীদের মতামত" সেকশন নিয়ন্ত্রণ করে — "যোগ করুন" চাপলেই নতুন কার্ড হোম পেজে দেখাবে; সব মুছে ফেললে সেকশনটি সাইট থেকে সরে যাবে।',
              'This list controls the home page testimonial section — add cards to show them on the home page; delete all to hide the section.'
            )}
          </p>
        </div>
      )}

      {/* Table */}
      {rows === null || loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {tx('উপরের "যোগ করুন" বাটন থেকে শুরু করুন।', 'Use the "Add testimonial" button above to get started.')}
        </p>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <ScrollX>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tx('মতামত', 'Testimonial')}</TableHead>
                  <TableHead>{tx('রেটিং', 'Rating')}</TableHead>
                  <TableHead className="w-20">{tx('ক্রম', 'Order')}</TableHead>
                  <TableHead className="w-24">{tx('স্ট্যাটাস', 'Status')}</TableHead>
                  <TableHead className="w-36">{tx('তৈরি', 'Created')}</TableHead>
                  <TableHead className="w-28 text-right">{tx('অ্যাকশন', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex items-start gap-2.5">
                        <Avatar className="h-9 w-9 shrink-0">
                          {row.photoUrl && <AvatarImage src={row.photoUrl} alt={row.name} />}
                          <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                            {row.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{row.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {lang === 'bn' ? row.role || row.roleEn : row.roleEn || row.role}
                          </p>
                          <p className="mt-0.5 line-clamp-2 max-w-md text-xs text-muted-foreground/90">
                            “{row.comment}”
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Stars rating={row.rating} /></TableCell>
                    <TableCell className="text-sm">{digitsBn(row.order)}</TableCell>
                    <TableCell>
                      {row.isActive ? (
                        <Badge className="gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          <Eye className="h-3 w-3" /> {tx('চালু', 'Live')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <EyeOff className="h-3 w-3" /> {tx('লুকানো', 'Hidden')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell><DateStamp iso={row.createdAt} label={tx('তৈরির তারিখ', 'Created at')} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Switch
                          checked={row.isActive}
                          onCheckedChange={() => void handleToggleActive(row)}
                          aria-label={row.isActive ? tx('লুকান', 'Hide') : tx('দেখান', 'Show')}
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)} aria-label={tx('সম্পাদনা', 'Edit')}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => void handleDelete(row)}
                          disabled={deletingId === row.id}
                          aria-label={tx('মুছুন', 'Delete')}
                        >
                          {deletingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-left">
              {editing ? tx('টেস্টিমোনিয়াল সম্পাদনা', 'Edit testimonial') : tx('নতুন টেস্টিমোনিয়াল', 'New testimonial')}
            </DialogTitle>
            <DialogDescription className="text-left">
              {tx(
                'হোম পেজের মতামত সেকশনে যেভাবে দেখাবে সেভাবেই তথ্যগুলো দিন।',
                'These details appear exactly like this on the home page.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ts-name">{tx('নাম', 'Name')} <span className="text-destructive">*</span></Label>
                <Input
                  id="ts-name"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder={tx('যেমন: রাকিব হাসান', 'e.g. Rakib Hasan')}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ts-role">{tx('পরিচয় (বাংলা)', 'Role (Bangla)')}</Label>
                <Input
                  id="ts-role"
                  value={form.role}
                  onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                  placeholder={tx('যেমন: এসএসসি পরীক্ষার্থী', 'e.g. SSC Candidate')}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ts-role-en">{tx('পরিচয় (ইংরেজি)', 'Role (English)')}</Label>
                <Input
                  id="ts-role-en"
                  value={form.roleEn}
                  onChange={(e) => setForm((p) => ({ ...p, roleEn: e.target.value }))}
                  placeholder="e.g. SSC Candidate"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ts-rating">{tx('রেটিং', 'Rating')}</Label>
                <div className="flex h-9 items-center gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, rating: n }))}
                      aria-label={`${n}/5`}
                      className="rounded-md p-0.5 transition-transform hover:scale-110"
                    >
                      <Star
                        className={`h-5 w-5 ${n <= form.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="ts-comment">{tx('মতামত', 'Testimonial text')} <span className="text-destructive">*</span></Label>
              <Textarea
                id="ts-comment"
                value={form.comment}
                onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
                rows={4}
                placeholder={tx('শিক্ষার্থীর কথা এখানে লিখুন…', "Write the student's words here…")}
              />
            </div>

            <div className="grid gap-1.5">
              <Label>{tx('ছবি (ঐচ্ছিক)', 'Photo (optional)')}</Label>
              <ImageUpload
                value={form.photoUrl}
                onChange={(v) => setForm((p) => ({ ...p, photoUrl: v }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ts-order">{tx('প্রদর্শনের ক্রম', 'Display order')}</Label>
                <Input
                  id="ts-order"
                  type="number"
                  min={0}
                  value={form.order}
                  onChange={(e) => setForm((p) => ({ ...p, order: parseInt(e.target.value, 10) || 0 }))}
                />
                <p className="text-[11px] text-muted-foreground">{tx('ছোট সংখ্যা আগে দেখাবে', 'Lower numbers show first')}</p>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch
                  id="ts-active"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
                />
                <Label htmlFor="ts-active" className="text-sm">
                  {form.isActive ? tx('সাইটে দেখানো হবে', 'Visible on site') : tx('লুকানো থাকবে', 'Hidden')}
                </Label>
              </div>
            </div>

            {/* Live preview */}
            <div className="rounded-2xl border bg-muted/30 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {tx('প্রিভিউ', 'Preview')}
              </p>
              <figure className="rounded-xl border bg-card p-4">
                <Stars rating={form.rating} />
                <blockquote className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  “{form.comment || tx('মতামত এখানে দেখাবে…', 'The testimonial text appears here…')}”
                </blockquote>
                <figcaption className="mt-3 flex items-center gap-2 border-t pt-3">
                  <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {form.photoUrl ? (
                      <Image src={form.photoUrl} alt={form.name || '—'} width={32} height={32} className="h-full w-full object-cover" />
                    ) : (
                      (form.name || '?').charAt(0).toUpperCase()
                    )}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{form.name || tx('নাম', 'Name')}</span>
                    <span className="block text-xs text-muted-foreground">
                      {(lang === 'bn' ? form.role : form.roleEn) || (lang === 'bn' ? form.roleEn : form.role)}
                    </span>
                  </span>
                </figcaption>
              </figure>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
                {t('cancel')}
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? t('loading') : t('save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

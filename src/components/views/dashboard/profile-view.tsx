'use client'

/**
 * Profile — account card (avatar/identity), 100% completion meter, full
 * edit form (avatar upload, name, email, phone, class, institution),
 * security summary and logout.
 *
 * 100% completion (name · email · phone · class · institution · photo) is
 * REQUIRED before buying any paid course/suggestion — enforced again
 * server-side on every purchase API.
 */
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  BadgeCheck,
  Camera,
  Loader2,
  LogOut,
  Mail,
  Phone,
  Save,
  School,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUI } from '@/store/ui-store'
import { useAuth, type SessionUser } from '@/store/auth-store'
import { apiPut } from '@/lib/api-client'
import { CLASS_OPTIONS, classLabel, missingProfileFields, PROFILE_FIELD_LABELS, profileCompletion, type ClassKey } from '@/lib/student-classes'
import { roleLabel } from '@/lib/roles'

function initials(name: string | null | undefined) {
  if (!name) return 'PS'
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'PS'
  )
}

export default function ProfileView() {
  const { t, tx, lang } = useUI()
  const { user, status, setUser, logout } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [studentClass, setStudentClass] = useState<ClassKey | ''>('')
  const [institution, setInstitution] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(user?.name ?? '')
    setEmail(user?.email ?? '')
    setPhone(user?.phone ?? '')
    setStudentClass((user?.studentClass as ClassKey | undefined) ?? '')
    setInstitution(user?.institution ?? '')
    setAvatarUrl(user?.avatarUrl ?? null)
  }, [user])

  if (status === 'loading' || (!user && status !== 'unauthenticated')) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-10 text-center text-sm text-muted-foreground">
        {t('required_login')}
      </div>
    )
  }

  const preview: SessionUser = {
    ...user,
    name: name || user.name,
    email: email || user.email,
    phone: phone || user.phone,
    studentClass: studentClass || user.studentClass,
    institution: institution || user.institution,
    avatarUrl,
  }
  const completion = profileCompletion(preview)
  const missing = missingProfileFields(preview)

  /**
   * Upload → the API persists the avatarUrl immediately and returns the fresh
   * session user. Refreshing the auth store here is the SINGLE source of
   * truth: the completion meter and every "complete your profile" gate
   * (profile page, checkout, dashboard) reflect 100% the moment the photo
   * lands — no reload, no extra Save step that could be missed.
   */
  const handleAvatarChange = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 4 * 1024 * 1024) {
      toast.error(tx('ছবির সর্বোচ্চ সাইজ ৪ MB।', 'Maximum image size is 4 MB.'))
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/auth/avatar', { method: 'POST', body: fd, credentials: 'include' })
      /* API envelope: { ok, data: { url, size, user, completion } } — read url
         from data (the previous code read json.url at top level, so a
         SUCCESSFUL upload always surfaced as "Upload failed"). */
      const json = (await res.json()) as {
        ok: boolean
        data?: { url?: string; size?: number; user?: SessionUser }
        error?: string
      }
      if (!res.ok || !json.ok || !json.data?.url) throw new Error(json.error || 'Upload failed')
      setAvatarUrl(json.data.url)
      // Root fix for the persistent "complete your profile" nag: the upload
      // endpoint has already persisted the photo server-side — sync the
      // global session user so EVERY gate sees the updated completion now.
      if (json.data.user) setUser(json.data.user)
      toast.success(
        tx('ছবি আপলোড হয়েছে ও সংরক্ষিত হয়েছে ✓', 'Photo uploaded and saved ✓')
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx('আপলোড ব্যর্থ', 'Upload failed'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(tx('নাম দিতে হবে।', 'Name is required.'))
      return
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error(tx('সঠিক ইমেইল দিন।', 'Enter a valid email.'))
      return
    }
    setSaving(true)
    try {
      const res = await apiPut<{ user: SessionUser; completion: number }>('/api/auth/profile', {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        studentClass: studentClass || undefined,
        institution: institution.trim() || undefined,
        avatarUrl: avatarUrl ?? '',
      })
      if (res?.user) setUser(res.user)
      toast.success(tx('প্রোফাইল আপডেট হয়েছে!', 'Profile updated!'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Identity card */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-2xl border bg-card"
      >
        <div className="grad-brand animate-grad-pan h-24" />
        <div className="-mt-10 px-6 pb-6">
          <div className="relative w-fit">
            <Avatar className="h-20 w-20 border-4 border-white shadow-lg">
              {preview.avatarUrl && <AvatarImage src={preview.avatarUrl} alt={preview.name} />}
              <AvatarFallback className="bg-primary text-2xl font-bold text-primary-foreground">
                {initials(preview.name)}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label={tx('প্রোফাইল ছবি বদলান', 'Change profile photo')}
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => void handleAvatarChange(e.target.files?.[0])}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{preview.name}</h1>
            {user.isVerified && (
              <Badge className="gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                <BadgeCheck className="h-3 w-3" /> {tx('ভেরিফায়েড', 'Verified')}
              </Badge>
            )}
            <Badge variant={user.role === 'STUDENT' ? 'secondary' : 'default'}>
              {roleLabel(user.role, lang)}
            </Badge>
          </div>
          <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {preview.email && (
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4" /> {preview.email}
              </p>
            )}
            {preview.phone && (
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4" /> {preview.phone}
              </p>
            )}
            {preview.studentClass && (
              <p className="flex items-center gap-2">
                <UserRound className="h-4 w-4" /> {classLabel(preview.studentClass, lang)}
              </p>
            )}
            {preview.institution && (
              <p className="flex items-center gap-2">
                <School className="h-4 w-4" /> {preview.institution}
              </p>
            )}
            {!preview.email && !preview.phone && (
              <p className="flex items-center gap-2">
                <UserRound className="h-4 w-4" /> {tx('যোগাযোগের তথ্য যোগ করুন', 'Add contact info below')}
              </p>
            )}
          </div>

          {/* 100% completion meter — required before buying */}
          <div className="mt-4 rounded-xl border bg-muted/40 p-3">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>{tx('প্রোফাইল সম্পূর্ণতা', 'Profile completion')}</span>
              <span className={completion === 100 ? 'text-emerald-600' : 'text-amber-600'}>
                {completion === 100
                  ? tx('১০০% ✓ কেনাকাটার জন্য প্রস্তুত', '100% ✓ Ready for purchases')
                  : `${completion}%`}
              </span>
            </div>
            <Progress value={completion} className="mt-2 h-2" aria-label={tx('প্রোফাইল সম্পূর্ণতা', 'Profile completion')} />
            {completion < 100 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {tx('বাকি আছে:', 'Missing:')}{' '}
                {missing
                  .map((m) => (lang === 'bn' ? PROFILE_FIELD_LABELS[m]?.bn : PROFILE_FIELD_LABELS[m]?.en) ?? m)
                  .join(lang === 'bn' ? ' · ' : ' · ')}
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Edit form */}
      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="text-base font-bold">{tx('প্রোফাইল সম্পাদনা', 'Edit profile')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {tx(
            'সব তথ্য পূরণ করুন — ১০০% সম্পূর্ণ হলেই কোর্স/সাজেশন কেনা যাবে।',
            'Fill in every field — purchases unlock at 100% completion.'
          )}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pf-name">{t('name')}</Label>
            <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={tx('আপনার নাম', 'Your name')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-email">{t('email')}</Label>
            <Input
              id="pf-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              inputMode="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-phone">{t('phone')}</Label>
            <Input
              id="pf-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              inputMode="tel"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{tx('শ্রেণি/বর্ষ', 'Class / year')}</Label>
            <Select value={studentClass || undefined} onValueChange={(v) => setStudentClass(v as ClassKey)}>
              <SelectTrigger aria-label={tx('শ্রেণি নির্বাচন', 'Select class')} className="w-full">
                <SelectValue placeholder={tx('নির্বাচন করুন', 'Select')} />
              </SelectTrigger>
              <SelectContent>
                {CLASS_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {tx(c.bn, c.en)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pf-inst">{tx('স্কুল/কলেজের নাম', 'School / college name')}</Label>
            <Input
              id="pf-inst"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder={tx('যেমন: ঢাকা কলেজ', 'e.g. Dhaka College')}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? t('loading') : t('save')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setName(user.name)
              setEmail(user.email ?? '')
              setPhone(user.phone ?? '')
              setStudentClass((user.studentClass as ClassKey | undefined) ?? '')
              setInstitution(user.institution ?? '')
              setAvatarUrl(user.avatarUrl ?? null)
            }}
          >
            {t('cancel')}
          </Button>
        </div>
      </div>

      {/* Security card */}
      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <ShieldCheck className="h-5 w-5 text-primary" />
          {tx('নিরাপত্তা', 'Security')}
        </h2>
        <Separator className="my-3" />
        <ul className="space-y-2.5 text-sm">
          {(
            [
              tx(
                'HttpOnly JWT কুকি — সেশন টোকেন জাভাস্ক্রিপ্ট দিয়ে পড়া যায় না।',
                'HttpOnly JWT cookie — the session token cannot be read by JavaScript.'
              ),
              tx('সুরক্ষিত ৭ দিনের সেশন — এরপর আবার লগইন লাগবে।', 'Secure 7-day session — you log in again afterwards.'),
              tx('OTP দিয়ে ভেরিফাই করা একাউন্ট।', 'Account verified with OTP.'),
            ] as const
          ).map((line) => (
            <li key={line} className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span className="text-foreground/85">{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Logout */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => void logout()}
        >
          <LogOut className="h-4 w-4" /> {t('logout')}
        </Button>
      </div>
    </div>
  )
}

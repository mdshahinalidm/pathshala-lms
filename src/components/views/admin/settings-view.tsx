'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Building2,
  Copyright,
  FileCode2,
  Gauge,
  Home,
  Hourglass,
  Image as ImageIcon,
  LayoutPanelLeft,
  ListTree,
  Loader2,
  Mail,
  MessageCircle,
  PanelTopOpen,
  Palette,
  Phone,
  ReceiptText,
  Search,
  Send,
  Settings,
  Share2,
  ShieldX,
  Smartphone,
  Trash2,
  TrendingUp,
  Upload,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { apiGet, apiPut, apiSend } from '@/lib/api-client'
import { fmtDateTime } from '@/lib/format'
import { useAuth } from '@/store/auth-store'
import { go, useUI } from '@/store/ui-store'
import { isOwner } from '@/lib/roles'
import { ImageUpload } from '@/components/admin/image-upload'
import { HeaderMenuEditor } from '@/components/admin/header-menu-editor'
import { FooterEditor } from '@/components/admin/footer-editor'

interface SiteSettings {
  brandName: string
  brandNameEn: string
  tagline: string
  taglineEn: string
  marqueeText: string
  supportPhone: string
  supportEmail: string
  address: string
  facebookUrl: string
  instagramUrl: string
  youtubeUrl: string
  linkedinUrl: string
  twitterUrl: string
  tiktokUrl: string
  whatsappNumber: string
  whatsappEnabled: boolean
  whatsappMessage: string
  bkashNumber: string
  nagadNumber: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPass: string
  smtpFrom: string
  smsApiUrl: string
  smsApiKey: string
  smsSenderId: string
  invoicePrefix: string
  invoiceSeq: number
  invoicePad: number
  invoiceNote: string
  popupActive: boolean
  popupTitle: string
  popupMessage: string
  popupImageUrl: string
  popupImageLink: string
  popupButtonText: string
  popupButtonUrl: string
  footerCopyrightBn: string
  footerCopyrightEn: string
  noticeBarEnabled: boolean
  // branding — logos & favicon (upload from here, shown site-wide)
  headerLogoUrl: string
  headerLogoHeight: number
  footerLogoUrl: string
  footerLogoHeight: number
  loginLogoUrl: string
  loginLogoHeight: number
  faviconUrl: string
  faviconSize: number
  seoTitle: string
  seoDescription: string
  seoKeywords: string
  // Home hero variant — 'classic' (1st hero) | 'circular' (2nd, coverflow)
  heroVariant: string
  // Stat-strip overrides (home + about pages). '' = auto (real counts / defaults)
  statStudents: string
  statCourses: string
  statHours: string
  statReviews: string
  // preloader (loading screen) customization
  preloaderEnabled: boolean
  preloaderText: string
  preloaderLogoUrl: string
  // SEO verification & analytics
  googleSiteVerification: string
  bingSiteVerification: string
  gaMeasurementId: string
  // login/registration option toggles + header menu / footer JSON
  otpLoginEnabled: boolean
  otpRegisterEnabled: boolean
  headerMenuConfig: string
  footerConfig: string
  // custom CSS / custom code — raw admin-authored snippets
  customCss: string
  customCode: string
}

const EMPTY_SETTINGS: SiteSettings = {
  brandName: '',
  brandNameEn: '',
  tagline: '',
  taglineEn: '',
  marqueeText: '',
  supportPhone: '',
  supportEmail: '',
  address: '',
  facebookUrl: '',
  instagramUrl: '',
  youtubeUrl: '',
  linkedinUrl: '',
  twitterUrl: '',
  tiktokUrl: '',
  whatsappNumber: '',
  whatsappEnabled: false,
  whatsappMessage: '',
  bkashNumber: '',
  nagadNumber: '',
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  smsApiUrl: '',
  smsApiKey: '',
  smsSenderId: '',
  invoicePrefix: 'INV-PAY',
  invoiceSeq: 1,
  invoicePad: 3,
  invoiceNote: '',
  popupActive: false,
  popupTitle: '',
  popupMessage: '',
  popupImageUrl: '',
  popupImageLink: '',
  popupButtonText: '',
  popupButtonUrl: '',
  footerCopyrightBn: '',
  footerCopyrightEn: '',
  noticeBarEnabled: true,
  headerLogoUrl: '',
  headerLogoHeight: 40,
  footerLogoUrl: '',
  footerLogoHeight: 40,
  loginLogoUrl: '',
  loginLogoHeight: 48,
  faviconUrl: '',
  faviconSize: 64,
  seoTitle: '',
  seoDescription: '',
  seoKeywords: '',
  heroVariant: 'classic',
  statStudents: '',
  statCourses: '',
  statHours: '',
  statReviews: '',
  preloaderEnabled: true,
  preloaderText: '',
  preloaderLogoUrl: '',
  googleSiteVerification: '',
  bingSiteVerification: '',
  gaMeasurementId: '',
  otpLoginEnabled: true,
  otpRegisterEnabled: false,
  headerMenuConfig: '',
  footerConfig: '',
  customCss: '',
  customCode: '',
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

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4.5 w-4.5" />
          </span>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  )
}

/**
 * settings sub-modules. Every topic that used to be one stacked
 * section on the long page is now its own submodule: the nav (sticky sidebar
 * on desktop / scrollable chips on mobile) shows only the selected topic's
 * inputs. `keys` drives the per-submodule "unsaved changes" dot by diffing
 * the live form against the last saved snapshot. Order mirrors the
 * historical page order — nothing moved, nothing removed.
 */
type SubmoduleId =
  | 'brand'
  | 'loginOptions'
  | 'hero'
  | 'stats'
  | 'logos'
  | 'preloader'
  | 'headerMenu'
  | 'footerColumns'
  | 'footerCopyright'
  | 'seo'
  | 'seoVerification'
  | 'customCss'
  | 'customCode'
  | 'contact'
  | 'social'
  | 'whatsapp'
  | 'smtp'
  | 'sms'
  | 'invoice'
  | 'popup'
  | 'payments'

interface SubmoduleDef {
  id: SubmoduleId
  icon: LucideIcon
  bn: string
  en: string
  keys: (keyof SiteSettings)[]
}

const SUBMODULES: SubmoduleDef[] = [
  { id: 'brand', icon: Building2, bn: 'ব্র্যান্ড', en: 'Brand', keys: ['brandName', 'brandNameEn', 'tagline', 'taglineEn', 'marqueeText', 'noticeBarEnabled'] },
  { id: 'loginOptions', icon: Smartphone, bn: 'লগইন ও রেজিস্ট্রেশন অপশন', en: 'Login & registration options', keys: ['otpLoginEnabled', 'otpRegisterEnabled'] },
  { id: 'hero', icon: Home, bn: 'হোম হিরো ভ্যারিয়েন্ট', en: 'Home hero variant', keys: ['heroVariant'] },
  { id: 'stats', icon: TrendingUp, bn: 'স্ট্যাট কাউন্টার', en: 'Stat counters', keys: ['statStudents', 'statCourses', 'statHours', 'statReviews'] },
  {
    id: 'logos',
    icon: ImageIcon,
    bn: 'লোগো ও ব্র্যান্ডিং',
    en: 'Logo & branding',
    keys: ['headerLogoUrl', 'headerLogoHeight', 'footerLogoUrl', 'footerLogoHeight', 'loginLogoUrl', 'loginLogoHeight', 'faviconUrl', 'faviconSize'],
  },
  { id: 'preloader', icon: Hourglass, bn: 'প্রিলোডার', en: 'Preloader', keys: ['preloaderEnabled', 'preloaderText', 'preloaderLogoUrl'] },
  { id: 'headerMenu', icon: ListTree, bn: 'হেডার মেনু', en: 'Header menu', keys: ['headerMenuConfig'] },
  { id: 'footerColumns', icon: LayoutPanelLeft, bn: 'ফুটার কলাম', en: 'Footer columns', keys: ['footerConfig'] },
  { id: 'footerCopyright', icon: Copyright, bn: 'ফুটার কপিরাইট', en: 'Footer copyright', keys: ['footerCopyrightBn', 'footerCopyrightEn'] },
  { id: 'seo', icon: Search, bn: 'SEO সেটিংস', en: 'SEO settings', keys: ['seoTitle', 'seoDescription', 'seoKeywords'] },
  { id: 'seoVerification', icon: Gauge, bn: 'SEO ভেরিফিকেশন ও অ্যানালিটিক্স', en: 'SEO verification & analytics', keys: ['googleSiteVerification', 'bingSiteVerification', 'gaMeasurementId'] },
  { id: 'customCss', icon: Palette, bn: 'কাস্টম CSS', en: 'Custom CSS', keys: ['customCss'] },
  { id: 'customCode', icon: FileCode2, bn: 'কাস্টম কোড', en: 'Custom code', keys: ['customCode'] },
  { id: 'contact', icon: Phone, bn: 'যোগাযোগ', en: 'Contact', keys: ['supportPhone', 'supportEmail', 'address'] },
  { id: 'social', icon: Share2, bn: 'সোশ্যাল মিডিয়া', en: 'Social media', keys: ['facebookUrl', 'instagramUrl', 'youtubeUrl', 'linkedinUrl', 'twitterUrl', 'tiktokUrl'] },
  { id: 'whatsapp', icon: MessageCircle, bn: 'হোয়াটসঅ্যাপ উইজেট', en: 'WhatsApp widget', keys: ['whatsappEnabled', 'whatsappNumber', 'whatsappMessage'] },
  { id: 'smtp', icon: Mail, bn: 'ইমেইল সেটআপ (SMTP)', en: 'Email setup (SMTP)', keys: ['smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'smtpPass', 'smtpFrom'] },
  { id: 'sms', icon: Send, bn: 'SMS সেটআপ', en: 'SMS setup', keys: ['smsApiUrl', 'smsApiKey', 'smsSenderId'] },
  { id: 'invoice', icon: ReceiptText, bn: 'ইনভয়েস আইডি ফরম্যাট', en: 'Invoice ID format', keys: ['invoicePrefix', 'invoiceSeq', 'invoicePad', 'invoiceNote'] },
  { id: 'popup', icon: PanelTopOpen, bn: 'ওয়েবসাইট পপআপ', en: 'Website popup', keys: ['popupActive', 'popupTitle', 'popupMessage', 'popupImageUrl', 'popupImageLink', 'popupButtonText', 'popupButtonUrl'] },
  { id: 'payments', icon: Wallet, bn: 'পেমেন্ট নম্বর', en: 'Payment numbers', keys: ['bkashNumber', 'nagadNumber'] },
]

/** a sub-module pane: renders only when its topic is selected. */
function SubPane({ id, activeId, children }: { id: SubmoduleId; activeId: SubmoduleId; children: React.ReactNode }) {
  if (id !== activeId) return null
  return <>{children}</>
}

/**
 * Testimonials are managed in the dedicated Admin → টেস্টিমোনিয়াল page
 * — /admin/testimonials with photo upload, ordering, bilingual
 * identities and a live preview. Nothing needed here anymore.
 */


function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  helper,
  type = 'text',
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  helper?: string
  type?: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  )
}

/**
 * CodeField — multi-line, monospace text area for admin-authored CODE
 * (e.g. the footer copyright with embedded <a> links). Whatever is saved
 * here is rendered verbatim on the site, so code can be pasted directly.
 */
function CodeField({
  id,
  label,
  value,
  onChange,
  placeholder,
  helper,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  helper?: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        spellCheck={false}
        className="min-h-[72px] font-mono text-xs"
      />
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  )
}

/**
 * BrandImageField — upload / replace / remove a branding image
 * (header logo, footer logo, login logo, favicon) plus a display-size input.
 * Files go through the standard /api/admin/upload endpoint (MediaAsset
 * tracked); only the resulting URL is stored in Site Settings.
 */
function BrandImageField({
  idPrefix,
  label,
  url,
  recommended,
  helper,
  size,
  sizeLabel,
  minSize,
  maxSize,
  defaultSize,
  onUrlChange,
  onSizeChange,
}: {
  idPrefix: string
  label: string
  url: string
  recommended: string
  helper?: string
  onUrlChange: (v: string) => void
  // Size editor is OPTIONAL — the preloader logo renders at a
  // fixed size and has no height column, so it omits these props entirely.
  size?: number
  sizeLabel?: string
  minSize?: number
  maxSize?: number
  defaultSize?: number
  onSizeChange?: (v: string) => void
}) {
  const { tx } = useUI()
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onPicked(file: File | null) {
    if (!file) return
    setUploading(true)
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
      onUrlChange(json.data.url)
      toast.success(tx('ছবি আপলোড হয়েছে — সংরক্ষণ করুন', 'Image uploaded — press Save'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপলোড ব্যর্থ', 'Upload failed'))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const hasSizeEditor = typeof sizeLabel === 'string' && typeof onSizeChange === 'function'
  const clampedSize = hasSizeEditor
    ? Math.min(maxSize ?? 512, Math.max(minSize ?? 16, size || defaultSize || 64))
    : 0

  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* Preview box — checkerboard so transparent PNGs read clearly */}
          <span
            className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background"
            style={{
              backgroundImage:
                'linear-gradient(45deg,#f4f4f5 25%,transparent 25%,transparent 75%,#f4f4f5 75%),linear-gradient(45deg,#f4f4f5 25%,transparent 25%,transparent 75%,#f4f4f5 75%)',
              backgroundSize: '10px 10px',
              backgroundPosition: '0 0,5px 5px',
            }}
          >
            {url ? (
              <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground/50" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <Label className="text-sm font-semibold">{label}</Label>
            <p className="text-[11px] text-muted-foreground">
              {recommended}
            </p>
            {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <input
            ref={inputRef}
            id={`${idPrefix}-file`}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void onPicked(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {url ? tx('বদলান', 'Replace') : tx('আপলোড', 'Upload')}
          </Button>
          {url ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              aria-label={tx('মুছুন', 'Remove')}
              title={tx('মুছুন', 'Remove')}
              onClick={() => onUrlChange('')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
      {hasSizeEditor && (
        <div className="mt-3 grid max-w-52 gap-1.5">
          <Label htmlFor={`${idPrefix}-size`} className="text-xs">
            {sizeLabel} ({tx('পিক্সেল', 'px')})
          </Label>
          <Input
            id={`${idPrefix}-size`}
            type="number"
            inputMode="numeric"
            min={minSize}
            max={maxSize}
            value={clampedSize}
            onChange={(e) => onSizeChange?.(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            {minSize}–{maxSize} px · {tx('ডিফল্ট', 'default')} {defaultSize}px
          </p>
        </div>
      )}
    </div>
  )
}

export default function AdminSettingsView() {
  const { user, status, initialized } = useAuth()
  const { tx, lang } = useUI()

  const [form, setForm] = useState<SiteSettings>(EMPTY_SETTINGS)
  const [savedJson, setSavedJson] = useState<string>(JSON.stringify(EMPTY_SETTINGS))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // active sub-module (which topic's inputs are currently shown)
  const [activeId, setActiveId] = useState<SubmoduleId>('brand')

  const set = useCallback((key: keyof SiteSettings, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const setNum = useCallback((key: keyof SiteSettings, value: string) => {
    const n = parseInt(value, 10)
    setForm((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : 0 }))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const data = await apiGet<Partial<SiteSettings> & { updatedAt?: string }>('/api/settings')
      const next: SiteSettings = { ...EMPTY_SETTINGS }
      const keys = Object.keys(EMPTY_SETTINGS) as (keyof SiteSettings)[]
      const rec = next as unknown as Record<string, unknown>
      keys.forEach((k) => {
        const v = data[k]
        if (typeof v === 'string') rec[k] = v
        else if (typeof v === 'boolean') rec[k] = v
        else if (typeof v === 'number') rec[k] = v
      })
      setForm(next)
      setSavedJson(JSON.stringify(next))
      setUpdatedAt(typeof data.updatedAt === 'string' ? data.updatedAt : null)
    } catch (e) {
      setLoadError(true)
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [tx])

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [load])

  const dirty = JSON.stringify(form) !== savedJson

  // per-submodule "unsaved changes" dots: diff the live form
  // against the last saved snapshot, field by field.
  const dirtyKeys = useMemo(() => {
    let saved: Record<string, unknown> = {}
    try {
      saved = JSON.parse(savedJson) as Record<string, unknown>
    } catch {
      saved = {}
    }
    const set = new Set<string>()
    ;(Object.keys(form) as (keyof SiteSettings)[]).forEach((k) => {
      if (JSON.stringify(form[k]) !== JSON.stringify(saved[k])) set.add(k)
    })
    return set
  }, [form, savedJson])

  async function handleSave() {
    setSaving(true)
    try {
      // Stat overrides: '' → null (auto/real counts), else a plain integer.
      const payload: Record<string, unknown> = { ...form }
      for (const key of ['statStudents', 'statCourses', 'statHours', 'statReviews'] as const) {
        const raw = String(form[key] ?? '').trim()
        const n = parseInt(raw, 10)
        payload[key] = raw === '' || !Number.isFinite(n) ? null : Math.max(0, Math.min(99_999_999, n))
      }
      await apiPut<SiteSettings>('/api/settings', payload)
      setSavedJson(JSON.stringify(form))
      toast.success(tx('সেটিংস সংরক্ষণ করা হয়েছে', 'Settings saved successfully'))
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সংরক্ষণ ব্যর্থ', 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  if (initialized && status !== 'loading' && (!user || !isOwner(user.role))) {
    return <AccessDenied />
  }

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">
          {tx('সাইট সেটিংস', 'Site Settings')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tx(
            'সব সেটিংস আলাদা আলাদা সাবমডিউলে সাজানো — বিষয় বেছে নিয়ে ভেতরের ইনপুটগুলো এডিট করুন',
            'All settings are organized into sub-modules — pick a topic and edit its inputs'
          )}
        </p>
      </div>

      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-2xl" />
          ))}
        </div>
      ) : loadError ? (
        <EmptyState
          icon={<Settings className="h-7 w-7" />}
          title={tx('সেটিংস লোড করা যায়নি', 'Failed to load settings')}
          description={tx('আবার চেষ্টা করুন।', 'Please try again.')}
          actionLabel={tx('রিলোড করুন', 'Reload')}
          onAction={() => void load()}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {/* sub-module navigation: each topic = one submodule.
              Desktop: sticky sidebar list · Mobile: scrollable chip row. */}
          {/* minmax(0,1fr) on mobile — the chip row must be width-constrained
              so overflow-x-auto actually scrolls instead of stretching the grid. */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
            <nav aria-label={tx('সেটিংস সেকশন', 'Settings sections')} className="lg:sticky lg:top-20 lg:self-start">
              <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:rounded-2xl lg:border lg:bg-card lg:p-1.5 lg:shadow-sm">
                {SUBMODULES.map((sm) => {
                  const Icon = sm.icon
                  const active = activeId === sm.id
                  const subDirty = sm.keys.some((k) => dirtyKeys.has(k))
                  return (
                    <button
                      key={sm.id}
                      type="button"
                      onClick={() => setActiveId(sm.id)}
                      aria-current={active ? 'true' : undefined}
                      className={`flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9 lg:whitespace-normal lg:px-3 ${
                        active
                          ? 'border-primary/40 bg-primary/10 font-semibold text-primary'
                          : 'border bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground lg:border-0 lg:bg-transparent'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate lg:truncate-none">{tx(sm.bn, sm.en)}</span>
                      {subDirty && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                          aria-label={tx('অসংরক্ষিত পরিবর্তন', 'Unsaved changes')}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            </nav>

            <div className="min-w-0 space-y-6">
          {/* ── Brand ── */}
          <SubPane id="brand" activeId={activeId}>
          <SectionCard
            icon={Building2}
            title={tx('ব্র্যান্ড', 'Brand')}
            description={tx(
              'সাইটের নাম ও ট্যাগলাইন — হেডার, ফুটার ও SEO-তে ব্যবহৃত হয়',
              'Site name and tagline — used in header, footer and SEO'
            )}
          >
            <Field
              id="brandName"
              label={tx('ব্র্যান্ড নাম (বাংলা)', 'Brand name (Bangla)')}
              value={form.brandName}
              onChange={(v) => set('brandName', v)}
              placeholder="পাঠশালা"
            />
            <Field
              id="brandNameEn"
              label={tx('ব্র্যান্ড নাম (ইংরেজি)', 'Brand name (English)')}
              value={form.brandNameEn}
              onChange={(v) => set('brandNameEn', v)}
              placeholder="PathShala"
            />
            <Field
              id="tagline"
              label={tx('ট্যাগলাইন (বাংলা)', 'Tagline (Bangla)')}
              value={form.tagline}
              onChange={(v) => set('tagline', v)}
              placeholder={tx('শেখো, এগিয়ে যাও', 'Learn, move ahead')}
            />
            <Field
              id="taglineEn"
              label={tx('ট্যাগলাইন (ইংরেজি)', 'Tagline (English)')}
              value={form.taglineEn}
              onChange={(v) => set('taglineEn', v)}
              placeholder="Learn and grow"
            />
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="marqueeText">{tx('মার্কি টেক্সট', 'Marquee text')}</Label>
              <Input
                id="marqueeText"
                value={form.marqueeText}
                onChange={(e) => set('marqueeText', e.target.value)}
                placeholder={tx('স্ক্রলিং বারের লেখা...', 'Scrolling bar text...')}
              />
              <p className="text-xs text-muted-foreground">
                {tx(
                  'হোম পেজের স্ক্রলিং বারে দেখাবে; খালি রাখলে নোটিশ দেখানো হয়',
                  'Shown in the home page scrolling bar; notices are shown when empty'
                )}
              </p>
            </div>
            {/* Home notice bar master switch */}
            <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3 sm:col-span-2">
              <div>
                <Label htmlFor="noticeBarEnabled" className="text-sm font-semibold">
                  {tx('হোম পেজ নোটিশ বার চালু', 'Home page notice bar')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {tx(
                    'বন্ধ করলে হিরো সেকশনের নিচের নোটিশ/মার্কি বারটি লুকিয়ে যাবে',
                    'When off, the notice/marquee bar below the hero section is hidden'
                  )}
                </p>
              </div>
              <Switch
                id="noticeBarEnabled"
                checked={form.noticeBarEnabled}
                onCheckedChange={(v) => setForm((p) => ({ ...p, noticeBarEnabled: v }))}
              />
            </div>
          </SectionCard>
          </SubPane>

          {/* ── Login / registration options ── */}
          <SubPane id="loginOptions" activeId={activeId}>
          <SectionCard
            icon={Smartphone}
            title={tx('লগইন ও রেজিস্ট্রেশন অপশন', 'Login & registration options')}
            description={tx(
              'লগইন/রেজিস্ট্রেশন পেজে কোন কোন OTP অপশন দেখাবে তা নিয়ন্ত্রণ করুন',
              'Control which OTP options appear on the login & registration pages'
            )}
          >
            <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3 sm:col-span-2">
              <div>
                <Label htmlFor="otpLoginEnabled" className="text-sm font-semibold">
                  {tx('OTP দিয়ে লগইন (ফোন/ইমেইল)', 'Login with OTP (phone/email)')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {tx(
                    'চালু থাকলে লগইন পেজে "OTP দিয়ে লগইন করুন" অপশনটি দেখাবে; বন্ধ করলে লুকিয়ে যাবে',
                    'When on, the login page shows the "Log in with OTP" option; when off it is hidden'
                  )}
                </p>
              </div>
              <Switch
                id="otpLoginEnabled"
                checked={form.otpLoginEnabled}
                onCheckedChange={(v) => setForm((p) => ({ ...p, otpLoginEnabled: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3 sm:col-span-2">
              <div>
                <Label htmlFor="otpRegisterEnabled" className="text-sm font-semibold">
                  {tx('ফোন OTP দিয়ে অ্যাকাউন্ট খুলুন', 'Create account with phone OTP')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {tx(
                    'চালু থাকলে রেজিস্ট্রেশনে "ফোন OTP দিয়ে অ্যাকাউন্ট খুলুন" অপশন দেখাবে — শিক্ষার্থী শুধু মোবাইল নম্বর ও OTP দিয়ে অ্যাকাউন্ট খুলতে পারবে (পাসওয়ার্ড ছাড়াই); বন্ধ করলে লুকিয়ে যাবে',
                    'When on, registration shows the "Create account with phone OTP" option — students can open an account with just their mobile number and an OTP (no password); when off it is hidden'
                  )}
                </p>
              </div>
              <Switch
                id="otpRegisterEnabled"
                checked={form.otpRegisterEnabled}
                onCheckedChange={(v) => setForm((p) => ({ ...p, otpRegisterEnabled: v }))}
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {tx(
                'সংরক্ষণের পর লগইন পেজ রিলোড করলেই পরিবর্তন দেখা যাবে।',
                'After saving, reload the login page to see the changes.'
              )}
            </p>
          </SectionCard>
          </SubPane>

          {/* ── Home hero variant — pick which hero renders ── */}
          <SubPane id="hero" activeId={activeId}>
          <SectionCard
            icon={Home}
            title={tx('হোম হিরো ভ্যারিয়েন্ট', 'Home hero variant')}
            description={tx(
              'হোম পেজে কোন হিরো দেখাবে তা বেছে নিন — নির্বাচিত ভ্যারিয়েন্টই শুধু দেখাবে',
              'Choose which hero shows on the home page — only the selected one renders'
            )}
          >
            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
              {(
                [
                  {
                    value: 'classic',
                    title: tx('১ম হিরো — ক্লাসিক', '1st hero — Classic'),
                    sub: tx(
                      'সার্চ, সিটিএ ও ফ্লোটিং কার্ডসহ মূল হিরো',
                      'The original hero with search, CTAs and floating cards'
                    ),
                  },
                  {
                    value: 'circular',
                    title: tx('২য় হিরো — কাভারফ্লো', '2nd hero — Coverflow'),
                    sub: tx(
                      'কোর্স/কম্বো ছবির স্লাইডার — মাঝে বড় কার্ড, দুই পাশে ঝুঁকে থাকা কার্ড',
                      'Course/combo image slider — big center card with side-peek cards'
                    ),
                  },
                ] as const
              ).map((opt) => {
                const selected = form.heroVariant === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => set('heroVariant', opt.value)}
                    className={`rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                        : 'bg-card hover:border-primary/40 hover:bg-accent/40'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                          selected ? 'border-primary' : 'border-muted-foreground/40'
                        }`}
                      >
                        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      <span className="text-sm font-semibold">{opt.title}</span>
                    </span>
                    <span className="mt-1.5 block pl-6 text-xs leading-relaxed text-muted-foreground">
                      {opt.sub}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {tx(
                'পরিবর্তন সংরক্ষণ করার পর হোম পেজ রিলোড করলে নতুন হিরো দেখা যাবে — অন্য হিরোটি এক মুহূর্তের জন্যও ফ্ল্যাশ করবে না।',
                'After saving, reload the home page to see the chosen hero — the other hero never flashes, not even for a moment.'
              )}
            </p>
          </SectionCard>
          </SubPane>

          {/* ── Stat-strip overrides (home + about pages) ── */}
          <SubPane id="stats" activeId={activeId}>
          <SectionCard
            icon={TrendingUp}
            title={tx('স্ট্যাট কাউন্টার (হোম ও আবাউট)', 'Stat counters (home & about)')}
            description={tx(
              'সফল শিক্ষার্থী / মোট কোর্স / ভিডিও ঘণ্টা / রিভিউ সংখ্যা নিজে বসান — খালি রাখলে স্বয়ংক্রিয় সত্যিকারের সংখ্যা দেখাবে',
              'Set the students / courses / hours / reviews counters — leave blank to show automatic real numbers'
            )}
          >
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stat-students">{tx('সফল শিক্ষার্থী', 'Successful students')}</Label>
                <Input
                  id="stat-students"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder={tx('স্বয়ংক্রিয় (১২,৫০০+)', 'auto (12,500+)')}
                  value={form.statStudents}
                  onChange={(e) => set('statStudents', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stat-courses">{tx('মোট কোর্স', 'Total courses')}</Label>
                <Input
                  id="stat-courses"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder={tx('স্বয়ংক্রিয় (প্রকাশিত কোর্স)', 'auto (published courses)')}
                  value={form.statCourses}
                  onChange={(e) => set('statCourses', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stat-hours">{tx('ভিডিও ক্লাস (ঘণ্টা)', 'Video classes (hours)')}</Label>
                <Input
                  id="stat-hours"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder={tx('স্বয়ংক্রিয় (১,২০০+)', 'auto (1,200+)')}
                  value={form.statHours}
                  onChange={(e) => set('statHours', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stat-reviews">{tx('পজিটিভ রিভিউ', 'Positive reviews')}</Label>
                <Input
                  id="stat-reviews"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder={tx('স্বয়ংক্রিয় (অনুমোদিত রিভিউ)', 'auto (approved reviews)')}
                  value={form.statReviews}
                  onChange={(e) => set('statReviews', e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {tx(
                'সংরক্ষণের পর হোম ও আবাউট পেজ রিলোড করলেই নতুন সংখ্যা দেখাবে।',
                'After saving, reload the home/about page to see the new numbers.'
              )}
            </p>
          </SectionCard>
          </SubPane>

          {/* Testimonials now live in the dedicated Admin → টেস্টিমোনিয়াল page */}

          {/* ── Branding: logos & favicon ── */}
          <SubPane id="logos" activeId={activeId}>
          <SectionCard
            icon={ImageIcon}
            title={tx('লোগো ও ব্র্যান্ডিং', 'Logo & branding')}
            description={tx(
              'হেডার, ফুটার, লগইন পেজ ও ব্রাউজার ট্যাবের (favicon) লোগো আপলোড/বদলান/মুছুন — সাথে প্রদর্শনের সাইজ সেট করুন',
              'Upload/replace/remove the header, footer, login-page logos and the browser-tab favicon — with their display sizes'
            )}
          >
            <div className="grid gap-4 sm:col-span-2">
              <p className="rounded-xl border border-dashed bg-background px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                {tx(
                  'প্রস্তাবিত সাইজ — হেডার লোগো: প্রস্থ ১৬০px × উচ্চতা ৪০px (৪:১ অনুপাত, স্বচ্ছ PNG/SVG) · ফুটার লোগো: ১৬০×৪০px · লগইন লোগো: ২৪০×৮০px · ফেভিকন: ৫১২×৫১২px স্কয়ার PNG। খালি (মুছে ফেলা) থাকলে ডিফল্ট পাঠশালা মার্ক দেখাবে। বদলানোর পর নিচের "সংরক্ষণ করুন" চাপুন।',
                  'Recommended sizes — header logo: 160×40px (4:1, transparent PNG/SVG) · footer logo: 160×40px · login logo: 240×80px · favicon: 512×512px square PNG. When empty (removed), the default PathShala mark is shown. Press "Save changes" below after editing.'
                )}
              </p>

              <BrandImageField
                idPrefix="headerLogo"
                label={tx('হেডার লোগো', 'Header logo')}
                url={form.headerLogoUrl}
                size={form.headerLogoHeight}
                sizeLabel={tx('প্রদর্শনের উচ্চতা', 'Display height')}
                recommended={tx('প্রস্তাবিত: ১৬০×৪০px · প্রদর্শন ১৬–২০০px', 'Recommended: 160×40px · display 16–200px')}
                minSize={16}
                maxSize={200}
                defaultSize={40}
                onUrlChange={(v) => set('headerLogoUrl', v)}
                onSizeChange={(v) => setNum('headerLogoHeight', v)}
              />

              <BrandImageField
                idPrefix="footerLogo"
                label={tx('ফুটার লোগো', 'Footer logo')}
                url={form.footerLogoUrl}
                size={form.footerLogoHeight}
                sizeLabel={tx('প্রদর্শনের উচ্চতা', 'Display height')}
                recommended={tx('প্রস্তাবিত: ১৬০×৪০px · প্রদর্শন ১৬–২০০px', 'Recommended: 160×40px · display 16–200px')}
                minSize={16}
                maxSize={200}
                defaultSize={40}
                onUrlChange={(v) => set('footerLogoUrl', v)}
                onSizeChange={(v) => setNum('footerLogoHeight', v)}
              />

              <BrandImageField
                idPrefix="loginLogo"
                label={tx('লগইন পেজের লোগো', 'Login page logo')}
                url={form.loginLogoUrl}
                size={form.loginLogoHeight}
                sizeLabel={tx('প্রদর্শনের উচ্চতা', 'Display height')}
                recommended={tx('প্রস্তাবিত: ২৪০×৮০px · প্রদর্শন ১৬–২৪০px', 'Recommended: 240×80px · display 16–240px')}
                minSize={16}
                maxSize={240}
                defaultSize={48}
                onUrlChange={(v) => set('loginLogoUrl', v)}
                onSizeChange={(v) => setNum('loginLogoHeight', v)}
              />

              <BrandImageField
                idPrefix="favicon"
                label={tx('ফেভিকন (ব্রাউজার ট্যাব আইকন)', 'Favicon (browser tab icon)')}
                url={form.faviconUrl}
                size={form.faviconSize}
                sizeLabel={tx('আইকন সাইজ', 'Icon size')}
                recommended={tx('প্রস্তাবিত: ৫১২×৫১২px স্কয়ার PNG', 'Recommended: 512×512px square PNG')}
                helper={tx(
                  'সেভ করার পর নতুন ট্যাবে দেখা যাবে (ব্রাউজার ক্যাশের জন্য কয়েক মিনিট লাগতে পারে)',
                  'Visible in a new tab after saving (browser cache may take a few minutes)'
                )}
                minSize={16}
                maxSize={512}
                defaultSize={64}
                onUrlChange={(v) => set('faviconUrl', v)}
                onSizeChange={(v) => setNum('faviconSize', v)}
              />
            </div>
          </SectionCard>
          </SubPane>

          {/* ── Preloader / loading screen ── */}
          <SubPane id="preloader" activeId={activeId}>
          <SectionCard
            icon={Hourglass}
            title={tx('প্রিলোডার (লোডিং স্ক্রিন)', 'Preloader (loading screen)')}
            description={tx(
              'পেজ লোড হওয়ার সময় দেখানো স্প্ল্যাশ স্ক্রিন — লোগো ও লেখা নিজের মতো করুন',
              'The splash shown while pages load — customize its logo and text'
            )}
          >
            <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3 sm:col-span-2">
              <div>
                <Label htmlFor="preloaderEnabled" className="text-sm font-semibold">
                  {tx('কাস্টম প্রিলোডার চালু', 'Custom preloader enabled')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {tx(
                    'বন্ধ করলে লোডিং স্ক্রিনে শুধু সাধারণ স্পিনার দেখাবে — কোনো কাস্টম লোগো/লেখা নয়',
                    'When off, the loading screen shows a plain minimal spinner — no custom logo/text'
                  )}
                </p>
              </div>
              <Switch
                id="preloaderEnabled"
                checked={form.preloaderEnabled}
                onCheckedChange={(v) => setForm((p) => ({ ...p, preloaderEnabled: v }))}
              />
            </div>
            <Field
              id="preloaderText"
              label={tx('প্রিলোডার লেখা', 'Preloader text')}
              value={form.preloaderText}
              onChange={(v) => set('preloaderText', v)}
              placeholder="লোড হচ্ছে..."
              helper={tx(
                'খালি রাখলে ডিফল্ট লেখা (লোড হচ্ছে… / Loading…) দেখাবে',
                'Leave empty for the default text (লোড হচ্ছে… / Loading…)'
              )}
            />
            <div className="sm:col-span-2">
              <BrandImageField
                idPrefix="preloaderLogo"
                label={tx('প্রিলোডার লোগো', 'Preloader logo')}
                url={form.preloaderLogoUrl}
                recommended={tx(
                  'প্রস্তাবিত: ২৫৬×২৫৬px স্কয়ার (স্বচ্ছ PNG/SVG) · প্রদর্শন ~৭২px',
                  'Recommended: 256×256px square (transparent PNG/SVG) · displayed at ~72px'
                )}
                helper={tx(
                  'খালি থাকলে ডিফল্ট পাঠশালা আইকন দেখাবে',
                  'When empty, the default PathShala icon is shown'
                )}
                onUrlChange={(v) => set('preloaderLogoUrl', v)}
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {tx(
                'সংরক্ষণের পর যেকোনো পেজ রিলোড করলেই নতুন প্রিলোডার দেখা যাবে।',
                'After saving, reload any page to see the new preloader.'
              )}
            </p>
          </SectionCard>
          </SubPane>

          {/* ── Header menu customization ── */}
          <SubPane id="headerMenu" activeId={activeId}>
          <SectionCard
            icon={ListTree}
            title={tx('হেডার মেনু', 'Header menu')}
            description={tx(
              'সাইট হেডারের মেনু সম্পূর্ণ নিয়ন্ত্রণ করুন — লেবেল/লিংক বদলান, যোগ বা মুছুন, উপর-নিচ সাজান',
              'Full control of the site header menu — edit labels/links, add or remove, reorder'
            )}
          >
            <HeaderMenuEditor
              value={form.headerMenuConfig}
              onChange={(v) => set('headerMenuConfig', v)}
            />
          </SectionCard>
          </SubPane>

          {/* ── Footer columns customization ── */}
          <SubPane id="footerColumns" activeId={activeId}>
          <SectionCard
            icon={LayoutPanelLeft}
            title={tx('ফুটার কলাম', 'Footer columns')}
            description={tx(
              'ফুটারের প্রতিটি কলাম শুরু থেকে শেষ পর্যন্ত সম্পাদনা করুন — বর্ণনা, শিরোনাম, লিংক ও চালু/বন্ধ',
              'Edit every footer column from start to end — description, titles, links and on/off'
            )}
          >
            <FooterEditor
              value={form.footerConfig}
              onChange={(v) => set('footerConfig', v)}
            />
          </SectionCard>
          </SubPane>

          {/* ── Footer copyright ── */}
          <SubPane id="footerCopyright" activeId={activeId}>
          <SectionCard
            icon={Copyright}
            title={tx('ফুটার কপিরাইট', 'Footer copyright')}
            description={tx(
              'ফুটারের নিচের কপিরাইট — কোড (HTML/লিংক) হিসেবে দেওয়া যায়; বাংলা ও ইংরেজি আলাদা। যা দেওয়া হবে তাই সাইটে দেখাবে',
              'The footer copyright — enter it as CODE (HTML/links); separate Bangla and English. Whatever is saved is shown on the site verbatim'
            )}
          >
            <CodeField
              id="footerCopyrightBn"
              label={tx('কপিরাইট (বাংলা)', 'Copyright (Bangla)')}
              value={form.footerCopyrightBn}
              onChange={(v) => set('footerCopyrightBn', v)}
              placeholder={tx(
                '© ২০২৬ পাঠশালা | সর্বস্বত্ব সংরক্ষিত | Developed By <a href="https://…">Md Shahin Ali</a>',
                '© ২০২৬ পাঠশালা | সর্বস্বত্ব সংরক্ষিত | Developed By <a href="https://…">Md Shahin Ali</a>'
              )}
              helper={tx(
                'সাইট বাংলায় থাকলে এটি দেখাবে। কোড (HTML, লিংক) দেওয়া যায় — যা লিখবেন তাই দেখাবে; খালি রাখলে ডিফল্ট',
                'Shown when the site is in Bangla. Accepts CODE (HTML, links) — saved text renders verbatim; empty = default'
              )}
            />
            <CodeField
              id="footerCopyrightEn"
              label={tx('কপিরাইট (ইংরেজি)', 'Copyright (English)')}
              value={form.footerCopyrightEn}
              onChange={(v) => set('footerCopyrightEn', v)}
              placeholder={tx(
                '© 2026 PathShala | All rights reserved | Developed By <a href="https://…">Md Shahin Ali</a>',
                '© 2026 PathShala | All rights reserved | Developed By <a href="https://…">Md Shahin Ali</a>'
              )}
              helper={tx(
                'সাইট ইংরেজিতে থাকলে এটি দেখাবে। কোড (HTML, লিংক) দেওয়া যায় — যা লিখবেন তাই দেখাবে; খালি রাখলে ডিফল্ট',
                'Shown when the site is in English. Accepts CODE (HTML, links) — saved text renders verbatim; empty = default'
              )}
            />
          </SectionCard>
          </SubPane>

          {/* ── SEO ── */}
          <SubPane id="seo" activeId={activeId}>
          <SectionCard
            icon={Search}
            title={tx('SEO সেটিংস', 'SEO settings')}
            description={tx(
              'গুগল/ফেসবুকে দেখানো হোমপেজের ডিফল্ট টাইটেল, বর্ণনা ও কীওয়ার্ড',
              'Homepage default title, description and keywords shown on search engines'
            )}
          >
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="seoTitle">{tx('ডিফল্ট SEO টাইটেল', 'Default SEO title')}</Label>
              <Input
                id="seoTitle"
                maxLength={120}
                value={form.seoTitle}
                onChange={(e) => set('seoTitle', e.target.value)}
                placeholder="পাঠশালা | PathShala — অনলাইন লার্নিং প্ল্যাটফর্ম"
              />
              <p className="text-xs text-muted-foreground">
                {tx(
                  'খালি রাখলে ডিফল্ট টাইটেল ব্যবহৃত হয় · সর্বোচ্চ ১২০ অক্ষর',
                  'Leave empty to use the default title · max 120 characters'
                )}
              </p>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="seoDescription">{tx('ডিফল্ট SEO বর্ণনা', 'Default SEO description')}</Label>
              <Textarea
                id="seoDescription"
                rows={3}
                maxLength={300}
                value={form.seoDescription}
                onChange={(e) => set('seoDescription', e.target.value)}
                placeholder={tx(
                  'বাংলাদেশের সেরা অনলাইন লার্নিং প্ল্যাটফর্ম...',
                  "Bangladesh's best online learning platform..."
                )}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                {tx(
                  'সার্চ রেজাল্টে নিচের বর্ণনা হিসেবে দেখাবে · সর্বোচ্চ ৩০০ অক্ষর',
                  'Shown as the snippet under search results · max 300 characters'
                )}
              </p>
            </div>
            <Field
              id="seoKeywords"
              label={tx('SEO কীওয়ার্ড', 'SEO keywords')}
              value={form.seoKeywords}
              onChange={(v) => set('seoKeywords', v)}
              placeholder="অনলাইন কোর্স, এসএসসি, এইচএসসি, online course"
              helper={tx(
                'কমা দিয়ে আলাদা করুন · সর্বোচ্চ ৩০০ অক্ষর',
                'Comma separated · max 300 characters'
              )}
            />
          </SectionCard>
          </SubPane>

          {/* ── SEO verification & analytics ── */}
          <SubPane id="seoVerification" activeId={activeId}>
          <SectionCard
            icon={Gauge}
            title={tx('SEO ভেরিফিকেশন ও অ্যানালিটিক্স', 'SEO verification & analytics')}
            description={tx(
              'সার্চ কনসোল ভেরিফিকেশন কোড ও Google Analytics 4 — সেভ করলেই সাইটে সংযুক্ত হয়',
              'Search-console verification codes and Google Analytics 4 — injected site-wide once saved'
            )}
          >
            <Field
              id="googleSiteVerification"
              label={tx('গুগল ভেরিফিকেশন কোড', 'Google verification code')}
              value={form.googleSiteVerification}
              onChange={(v) => set('googleSiteVerification', v)}
              placeholder="google-site-verification কোড"
              helper={tx(
                'Google Search Console-এর ডেভেলপারদের জন্য: ভেরিফিকেশন → HTML ট্যাগ-এর content মানটি দিন (পুরো ট্যাগ পেস্ট করলেও চলবে)।',
                'From Google Search Console → Verification → HTML tag: paste the content value (a full pasted tag works too).'
              )}
            />
            <Field
              id="bingSiteVerification"
              label={tx('বিং ভেরিফিকেশন কোড', 'Bing verification code')}
              value={form.bingSiteVerification}
              onChange={(v) => set('bingSiteVerification', v)}
              placeholder="msvalidate.01 কোড"
              helper={tx(
                'Bing Webmaster Tools → My Sites → Crawl Control-এর meta ট্যাগের content মানটি দিন।',
                'From Bing Webmaster Tools → the content value of the msvalidate.01 meta tag.'
              )}
            />
            <Field
              id="gaMeasurementId"
              label={tx('Google Analytics 4 আইডি', 'Google Analytics 4 ID')}
              value={form.gaMeasurementId}
              onChange={(v) => set('gaMeasurementId', v)}
              placeholder="G-XXXXXXXXXX"
              helper={tx(
                'Google Analytics 4 → Admin → Data Streams → ওয়েব স্ট্রিমের Measurement ID (G- দিয়ে শুরু)।',
                'From Google Analytics 4 → Admin → Data Streams → the web-stream Measurement ID (starts with G-).'
              )}
            />
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {tx(
                'সংরক্ষণের পর হোম পেজ রিলোড করলেই ভেরিফিকেশন মেটা ট্যাগ ও GA4 স্ক্রিপ্ট সাইটের সব পেজে যুক্ত হয়ে যাবে।',
                'After saving, reload — the verification meta tags and the GA4 script are injected into every page.'
              )}
            </p>
          </SectionCard>
          </SubPane>

          {/* ── Custom CSS — site-wide admin stylesheet ── */}
          <SubPane id="customCss" activeId={activeId}>
          <SectionCard
            icon={Palette}
            title={tx('কাস্টম CSS', 'Custom CSS')}
            description={tx(
              'পুরো সাইটে প্রযোজ্য নিজের CSS — সেভ করলেই প্রতিটি পেজে লাগু হয়',
              'Site-wide custom CSS — applies to every page once saved'
            )}
          >
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="customCss">{tx('CSS কোড', 'CSS code')}</Label>
              <Textarea
                id="customCss"
                rows={12}
                spellCheck={false}
                value={form.customCss}
                onChange={(e) => set('customCss', e.target.value)}
                placeholder={'.site-footer a:hover {\n  text-decoration: underline;\n}'}
                className="min-h-[240px] font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                {tx(
                  'শুধু CSS লিখুন (<style> ট্যাগ ছাড়া) — প্রতিটি পেজে সবার শেষে লোড হয়, তাই ডিফল্ট স্টাইল ওভাররাইড করা যায়। খালি রাখলে কিছুই যুক্ত হয় না।',
                  'Write plain CSS (no <style> tags) — it loads last on every page, so default styles can be overridden. Leave empty to inject nothing.'
                )}
              </p>
            </div>
          </SectionCard>
          </SubPane>

          {/* ── Custom code — raw HTML/JS before </body> ── */}
          <SubPane id="customCode" activeId={activeId}>
          <SectionCard
            icon={FileCode2}
            title={tx('কাস্টম কোড', 'Custom code')}
            description={tx(
              'HTML/JS স্নিপেট (ট্র্যাকিং পিক্সেল, চ্যাট উইজেট, স্ক্রিপ্ট) — প্রতিটি পেজের </body> এর ঠিক আগে বসে',
              'HTML/JS snippets (tracking pixels, chat widgets, scripts) — placed right before the closing body tag on every page'
            )}
          >
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="customCode">{tx('কোড', 'Code')}</Label>
              <Textarea
                id="customCode"
                rows={12}
                spellCheck={false}
                value={form.customCode}
                onChange={(e) => set('customCode', e.target.value)}
                placeholder={'<script>\n  console.log("Hello from PathShala!");\n</script>'}
                className="min-h-[240px] font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                {tx(
                  'এখানে সেভ করা কোড হুবহু সাইটে এম্বেড হয় — শুধু বিশ্বস্ত সোর্সের কোড ব্যবহার করুন। খালি রাখলে কিছুই যুক্ত হয় না।',
                  'Code saved here is embedded verbatim — use snippets from trusted sources only. Leave empty to inject nothing.'
                )}
              </p>
            </div>
          </SectionCard>
          </SubPane>

          {/* ── Contact ── */}
          <SubPane id="contact" activeId={activeId}>
          <SectionCard
            icon={Phone}
            title={tx('যোগাযোগ', 'Contact')}
            description={tx(
              'কন্টাক্ট পেজ ও ফুটারে দেখানো তথ্য',
              'Information shown on the contact page and footer'
            )}
          >
            <Field
              id="supportPhone"
              label={tx('সাপোর্ট ফোন', 'Support phone')}
              value={form.supportPhone}
              onChange={(v) => set('supportPhone', v)}
              placeholder="+8801XXXXXXXXX"
              type="tel"
            />
            <Field
              id="supportEmail"
              label={tx('সাপোর্ট ইমেইল', 'Support email')}
              value={form.supportEmail}
              onChange={(v) => set('supportEmail', v)}
              placeholder="support@pathshala.com"
              type="email"
            />
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="address">{tx('ঠিকানা', 'Address')}</Label>
              <Textarea
                id="address"
                rows={2}
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder={tx('গুলশান, ঢাকা', 'Gulshan, Dhaka')}
                className="resize-none"
              />
            </div>
          </SectionCard>
          </SubPane>

          {/* ── Social ── */}
          <SubPane id="social" activeId={activeId}>
          <SectionCard
            icon={Share2}
            title={tx('সোশ্যাল মিডিয়া', 'Social media')}
            description={tx(
              'যে লিংকগুলো পূরণ করা হবে শুধু সেগুলোই ফুটারে দেখানো হবে',
              'Only the links you fill in are shown in the footer'
            )}
          >
            <Field
              id="facebookUrl"
              label={tx('ফেসবুক পেজ লিংক', 'Facebook page URL')}
              value={form.facebookUrl}
              onChange={(v) => set('facebookUrl', v)}
              placeholder="https://facebook.com/yourpage"
              helper={tx('পূর্ণ লিংক দিন (https সহ)', 'Use the full URL (with https)')}
            />
            <Field
              id="instagramUrl"
              label={tx('ইনস্টাগ্রাম', 'Instagram')}
              value={form.instagramUrl}
              onChange={(v) => set('instagramUrl', v)}
              placeholder="https://instagram.com/yourpage"
            />
            <Field
              id="youtubeUrl"
              label={tx('ইউটিউব চ্যানেল লিংক', 'YouTube channel URL')}
              value={form.youtubeUrl}
              onChange={(v) => set('youtubeUrl', v)}
              placeholder="https://youtube.com/@yourchannel"
              helper={tx('পূর্ণ লিংক দিন (https সহ)', 'Use the full URL (with https)')}
            />
            <Field
              id="linkedinUrl"
              label={tx('লিংকডইন', 'LinkedIn')}
              value={form.linkedinUrl}
              onChange={(v) => set('linkedinUrl', v)}
              placeholder="https://linkedin.com/company/yourpage"
            />
            <Field
              id="twitterUrl"
              label={tx('X (টুইটার)', 'X (Twitter)')}
              value={form.twitterUrl}
              onChange={(v) => set('twitterUrl', v)}
              placeholder="https://x.com/yourpage"
            />
            <Field
              id="tiktokUrl"
              label={tx('টিকটক', 'TikTok')}
              value={form.tiktokUrl}
              onChange={(v) => set('tiktokUrl', v)}
              placeholder="https://tiktok.com/@yourpage"
            />
          </SectionCard>
          </SubPane>

          {/* ── WhatsApp widget ── */}
          <SubPane id="whatsapp" activeId={activeId}>
          <SectionCard
            icon={MessageCircle}
            title={tx('হোয়াটসঅ্যাপ চ্যাট উইজেট', 'WhatsApp chat widget')}
            description={tx(
              'সাইটের নিচে ভাসমান WhatsApp বাটন — Back-to-Top বাটনের উপরে দেখাবে',
              'Floating WhatsApp button on the site — shown above the Back-to-Top button'
            )}
          >
            <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3 sm:col-span-2">
              <div>
                <Label htmlFor="whatsappEnabled" className="text-sm font-semibold">
                  {tx('হোয়াটসঅ্যাপ বাটন চালু', 'Enable WhatsApp button')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {tx('চালু করলে প্রতিটি পেজে ভাসমান বাটন দেখাবে', 'Shows the floating button on every page when on')}
                </p>
              </div>
              <Switch
                id="whatsappEnabled"
                checked={form.whatsappEnabled}
                onCheckedChange={(v) => setForm((p) => ({ ...p, whatsappEnabled: v }))}
              />
            </div>
            <Field
              id="whatsappNumber"
              label={tx('হোয়াটসঅ্যাপ নম্বর', 'WhatsApp number')}
              value={form.whatsappNumber}
              onChange={(v) => set('whatsappNumber', v)}
              placeholder="8801XXXXXXXXX"
              helper={tx('কান্ট্রি কোড সহ শুধু সংখ্যা দিন', 'Digits only, including country code')}
            />
            <Field
              id="whatsappMessage"
              label={tx('ডিফল্ট মেসেজ', 'Default message')}
              value={form.whatsappMessage}
              onChange={(v) => set('whatsappMessage', v)}
              placeholder={tx('আসসালামু আলাইকুম, আমি কোর্স সম্পর্কে জানতে চাই।', 'Hi, I want to know about the courses.')}
              helper={tx('চ্যাট খুললে এই মেসেজটি আগেই লেখা থাকবে', 'Pre-filled when the chat opens')}
            />
          </SectionCard>
          </SubPane>

          {/* ── Email setup (SMTP) ── */}
          <SubPane id="smtp" activeId={activeId}>
          <SectionCard
            icon={Mail}
            title={tx('ইমেইল সেটআপ (SMTP)', 'Email setup (SMTP)')}
            description={tx(
              'ইমেইল OTP ও নোটিফিকেশন পাঠানোর SMTP কনফিগারেশন — তথ্য শুধু সার্ভারে থাকে',
              'SMTP configuration for email OTP and notifications — credentials stay on the server'
            )}
          >
            <Field
              id="smtpHost"
              label={tx('SMTP হোস্ট', 'SMTP host')}
              value={form.smtpHost}
              onChange={(v) => set('smtpHost', v)}
              placeholder="smtp.gmail.com"
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                id="smtpPort"
                label={tx('পোর্ট', 'Port')}
                value={String(form.smtpPort)}
                onChange={(v) => setForm((p) => ({ ...p, smtpPort: Number(v) || 587 }))}
                placeholder="587"
                type="number"
              />
              <div className="grid content-end gap-1.5 pb-1">
                <Label className="text-sm font-semibold">{tx('SSL/TLS (৪৬৫)', 'SSL/TLS (465)')}</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    id="smtpSecure"
                    checked={form.smtpSecure}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, smtpSecure: v }))}
                  />
                  <span className="text-xs text-muted-foreground">
                    {form.smtpSecure ? tx('চালু (৪৬৫)', 'On (465)') : tx('বন্ধ (৫৮৭ STARTTLS)', 'Off (587 STARTTLS)')}
                  </span>
                </div>
              </div>
            </div>
            <Field
              id="smtpUser"
              label={tx('SMTP ইউজারনেম', 'SMTP username')}
              value={form.smtpUser}
              onChange={(v) => set('smtpUser', v)}
              placeholder="no-reply@pathshala.com"
            />
            <Field
              id="smtpPass"
              label={tx('SMTP পাসওয়ার্ড / অ্যাপ পাসওয়ার্ড', 'SMTP password / app password')}
              value={form.smtpPass}
              onChange={(v) => set('smtpPass', v)}
              placeholder="••••••••"
              type="password"
            />
            <Field
              id="smtpFrom"
              label={tx('ফ্রম ঠিকানা', 'From address')}
              value={form.smtpFrom}
              onChange={(v) => set('smtpFrom', v)}
              placeholder="PathShala <no-reply@pathshala.com>"
              helper={tx('খালি রাখলে ইউজারনেম ব্যবহৃত হয়', 'Falls back to the username when empty')}
            />
          </SectionCard>
          </SubPane>

          {/* ── SMS setup ── */}
          <SubPane id="sms" activeId={activeId}>
          <SectionCard
            icon={Send}
            title={tx('SMS সেটআপ', 'SMS setup')}
            description={tx(
              'SMS OTP-র জন্য গেটওয়ে (SSL Wireless / BulkSMSBD…) — {phone} {message} {token} {sender} প্লেসহোল্ডারসহ URL',
              'SMS gateway for OTPs (SSL Wireless / BulkSMSBD…) — URL with {phone} {message} {token} {sender} placeholders'
            )}
          >
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="smsApiUrl">{tx('গেটওয়ে API URL', 'Gateway API URL')}</Label>
              <Input
                id="smsApiUrl"
                value={form.smsApiUrl}
                onChange={(e) => set('smsApiUrl', e.target.value)}
                placeholder="http://bulksmsbd.net/api/smsapi?api_key={token}&type=text&number={phone}&senderid={sender}&message={message}"
                className="font-mono text-xs"
              />
            </div>
            <Field
              id="smsApiKey"
              label={tx('API কী / টোকেন', 'API key / token')}
              value={form.smsApiKey}
              onChange={(v) => set('smsApiKey', v)}
              placeholder="••••••••"
              type="password"
            />
            <Field
              id="smsSenderId"
              label={tx('সেন্ডার আইডি', 'Sender ID')}
              value={form.smsSenderId}
              onChange={(v) => set('smsSenderId', v)}
              placeholder="88096XXXXXXXX"
            />
          </SectionCard>
          </SubPane>

          {/* ── Invoice format ── */}
          <SubPane id="invoice" activeId={activeId}>
          <SectionCard
            icon={ReceiptText}
            title={tx('ইনভয়েস আইডি ফরম্যাট', 'Invoice ID format')}
            description={tx(
              'নতুন অর্ডারের ইনভয়েস নম্বর এই ফরম্যাটে তৈরি হবে — যেমন INV-PAY-001',
              'New orders get invoice numbers in this format — e.g. INV-PAY-001'
            )}
          >
            <Field
              id="invoicePrefix"
              label={tx('প্রিফিক্স', 'Prefix')}
              value={form.invoicePrefix}
              onChange={(v) => set('invoicePrefix', v)}
              placeholder="INV-PAY"
              helper={tx('ইনভয়েস: প্রিফিক্স-০০১', 'Invoice: prefix-001')}
            />
            <Field
              id="invoicePad"
              label={tx('সংখ্যার প্রস্থ (ডিজিট)', 'Number width (digits)')}
              value={String(form.invoicePad)}
              onChange={(v) => setForm((p) => ({ ...p, invoicePad: Math.min(8, Math.max(1, Number(v) || 3)) }))}
              placeholder="3"
              type="number"
              helper={tx('৩ দিলে INV-PAY-001, ৫ দিলে INV-PAY-00001', '3 → INV-PAY-001, 5 → INV-PAY-00001')}
            />
            <Field
              id="invoiceSeq"
              label={tx('পরবর্তী নম্বর', 'Next number')}
              value={String(form.invoiceSeq)}
              onChange={(v) => setForm((p) => ({ ...p, invoiceSeq: Math.max(1, Number(v) || 1) }))}
              placeholder="1"
              type="number"
              helper={tx('প্রতিটি নতুন ইনভয়েসে স্বয়ংক্রিয়ভাবে বাড়ে', 'Increments automatically with every new invoice')}
            />
            <Field
              id="invoiceNote"
              label={tx('ইনভয়েস ফুটার নোট (ঐচ্ছিক)', 'Invoice footer note (optional)')}
              value={form.invoiceNote}
              onChange={(v) => set('invoiceNote', v)}
              placeholder={tx('যেমন: সকল পেমেন্ট অগ্রিম এবং অফেরতযোগ্য।', 'e.g. All payments are advance and non-refundable.')}
              helper={tx('খালি রাখলে ইনভয়েসে কোনো নোট দেখানো হবে না।', 'Leave empty to show no note on the invoice.')}
            />
          </SectionCard>
          </SubPane>

          {/* ── Website popup ── */}
          <SubPane id="popup" activeId={activeId}>
          <SectionCard
            icon={PanelTopOpen}
            title={tx('ওয়েবসাইট পপআপ', 'Website popup')}
            description={tx(
              'ভিজিটর সাইটে ঢোকার সাথে সাথে পপআপটি দেখানো হবে',
              'Visitors see this popup immediately on their first page load'
            )}
          >
            <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3 sm:col-span-2">
              <div>
                <Label htmlFor="popupActive" className="text-sm font-semibold">
                  {tx('পপআপ চালু', 'Popup active')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {tx('চালু করলে প্রতি ভিজিটর ১২ ঘণ্টায় একবার দেখবে', 'Each visitor sees it once per 12 hours when on')}
                </p>
              </div>
              <Switch
                id="popupActive"
                checked={form.popupActive}
                onCheckedChange={(v) => setForm((p) => ({ ...p, popupActive: v }))}
              />
            </div>
            <Field
              id="popupTitle"
              label={tx('টাইটেল', 'Title')}
              value={form.popupTitle}
              onChange={(v) => set('popupTitle', v)}
              placeholder={tx('🎉 নতুন ব্যাচ শুরু!', '🎉 New batch starting!')}
            />
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{tx('পপআপ ছবি (ঐচ্ছিক)', 'Popup image (optional)')}</Label>
              <ImageUpload
                value={form.popupImageUrl}
                onChange={(v) => set('popupImageUrl', v)}
              />
              <p className="text-xs text-muted-foreground">
                {tx(
                  'আপলোড, মিডিয়া লাইব্রেরি বা URL — যেকোনো ভাবে ছবি দিন।',
                  'Upload, pick from the media library, or paste a URL.'
                )}
              </p>
            </div>
            <Field
              id="popupImageLink"
              label={tx('ছবির লিংক (ঐচ্ছিক) — ছবিতে ক্লিক করলে যাবে', 'Image link (optional) — where the image clicks to')}
              value={form.popupImageLink}
              onChange={(v) => set('popupImageLink', v)}
              placeholder="/courses"
              helper={tx(
                'ভিজিটর ছবিতে ক্লিক করলে এই লিংকে যাবে (যেমন: কোর্স বা কম্বো পেজ)।',
                'Visitors are taken here when they click the popup image (e.g. a course or combo page).'
              )}
            />
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="popupMessage">{tx('মেসেজ', 'Message')}</Label>
              <Textarea
                id="popupMessage"
                rows={3}
                value={form.popupMessage}
                onChange={(e) => set('popupMessage', e.target.value)}
                placeholder={tx('ভর্তি চলছে — আজই এনরোল করুন!', 'Enrollment open — enroll today!')}
                className="resize-none"
              />
            </div>
            <Field
              id="popupButtonText"
              label={tx('বাটন টেক্সট (ঐচ্ছিক)', 'Button text (optional)')}
              value={form.popupButtonText}
              onChange={(v) => set('popupButtonText', v)}
              placeholder={tx('এনরোল করুন', 'Enroll now')}
            />
            <Field
              id="popupButtonUrl"
              label={tx('বাটন URL (ঐচ্ছিক)', 'Button URL (optional)')}
              value={form.popupButtonUrl}
              onChange={(v) => set('popupButtonUrl', v)}
              placeholder="/courses"
            />
          </SectionCard>
          </SubPane>

          {/* ── Payment ── */}
          <SubPane id="payments" activeId={activeId}>
          <SectionCard
            icon={Wallet}
            title={tx('পেমেন্ট নম্বর', 'Payment numbers')}
            description={tx(
              'ম্যানুয়াল পেমেন্টের মোবাইল ব্যাংকিং নম্বর',
              'Mobile banking numbers for manual payments'
            )}
          >
            <Field
              id="bkashNumber"
              label={tx('বিকাশ নম্বর', 'bKash number')}
              value={form.bkashNumber}
              onChange={(v) => set('bkashNumber', v)}
              placeholder="01XXXXXXXXX"
            />
            <Field
              id="nagadNumber"
              label={tx('নগদ নম্বর', 'Nagad number')}
              value={form.nagadNumber}
              onChange={(v) => set('nagadNumber', v)}
              placeholder="01XXXXXXXXX"
            />
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {tx(
                'চেকআউট পেজে শিক্ষার্থীদের দেখানো হবে',
                'Shown to students on the checkout page'
              )}
            </p>
          </SectionCard>
          </SubPane>

          {/* ── Sticky save bar (compact) ── */}
          <Card className="sticky bottom-4 z-10 border-primary/30 shadow-lg shadow-black/5">
            <CardFooter className="flex flex-wrap items-center justify-between gap-2 p-2.5">
              <div className="flex items-center gap-1.5 text-xs">
                {dirty && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-amber-500"
                    aria-label={tx('অসংরক্ষিত পরিবর্তন', 'Unsaved changes')}
                  />
                )}
                <span className="text-muted-foreground">
                  {dirty
                    ? tx('অসংরক্ষিত পরিবর্তন আছে', 'You have unsaved changes')
                    : tx('সব পরিবর্তন সংরক্ষিত', 'All changes saved')}
                </span>
                {updatedAt && (
                  <span className="hidden text-[11px] text-muted-foreground/70 md:inline">
                    · {tx('শেষ সংরক্ষণ', 'Last saved')}: {fmtDateTime(updatedAt, lang)}
                  </span>
                )}
              </div>
              <Button
                onClick={() => void handleSave()}
                disabled={!dirty || saving}
                size="sm"
                className="h-8 gap-1.5 px-4 text-xs font-bold"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {tx('সংরক্ষণ করুন', 'Save changes')}
              </Button>
            </CardFooter>
          </Card>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

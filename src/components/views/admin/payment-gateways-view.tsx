'use client'

/**
 * AdminPaymentGatewaysView — setup EVERY payment gateway.
 *
 * Built-ins (bKash / SSLCommerz / Rocket / Manual): each card shows the
 * gateway's official API credential fields (from its developer docs),
 * LIVE/SANDBOX/OFF mode, enable toggle and manual-payment instructions.
 *
 * CUSTOM gateways (full freedom): the admin can add ANY live payment
 * gateway — name, uploaded logo (media library / upload), generic live
 * integration (hosted payment-page URL template OR JSON API endpoint with
 * auth headers) and checkout instructions. Custom gateways behave exactly
 * like the built-in LIVE gateways on checkout (redirect → callback →
 * auto-unlock) and can be edited or deleted here.
 *
 * Config is stored in the PaymentGateway table and NEVER leaves the admin
 * surface — the public checkout API only exposes names/logos/instructions.
 */
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  ExternalLink,
  Info,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { useUI } from '@/store/ui-store'
import { DateStamp } from '@/components/admin/date-stamp'
import { apiGet, apiSend } from '@/lib/api-client'
import { GATEWAY_CATALOG, gatewayLogo, type GatewayField } from '@/lib/payment-gateways'
import { ImageUpload } from '@/components/admin/image-upload'

interface GatewayRow {
  id: string
  code: string
  name: string
  mode: string
  enabled: boolean
  isManual: boolean
  isCustom: boolean
  logoUrl: string | null
  config: string
  instructions: string
  instructionsEn: string
  logoEmoji: string
  updatedAt: string
}

/** Generic live-integration fields for CUSTOM gateways (mirrors initiate API). */
const CUSTOM_FIELDS: GatewayField[] = [
  {
    key: 'payment_url',
    bn: 'পেমেন্ট পেজ URL (টেমপ্লেট)',
    en: 'Payment page URL (template)',
    type: 'text',
    helpBn:
      'গেটওয়ের হোস্টেড চেকআউট লিংক দিন — প্লেসহোল্ডার: {amount} {orderId} {trxId} {invoice} {callback} {name} {phone} {email} {course} {site}',
    helpEn:
      'Hosted checkout link of the gateway — placeholders: {amount} {orderId} {trxId} {invoice} {callback} {name} {phone} {email} {course} {site}',
  },
  {
    key: 'api_url',
    bn: 'API এন্ডপয়েন্ট URL',
    en: 'API endpoint URL',
    type: 'text',
    helpBn:
      'JSON API হলে স্ট্যান্ডার্ড পেলোড (amount, orderId, invoiceNo, customer, callbackUrl…) এখানে POST হবে।',
    helpEn:
      'For a JSON API, a standard payload (amount, orderId, invoiceNo, customer, callbackUrl…) is POSTed here.',
  },
  {
    key: 'api_method',
    bn: 'HTTP মেথড',
    en: 'HTTP method',
    type: 'text',
    helpBn: 'ডিফল্ট POST',
    helpEn: 'Default POST',
  },
  {
    key: 'api_key',
    bn: 'API কী',
    en: 'API key',
    type: 'password',
  },
  {
    key: 'api_secret',
    bn: 'API সিক্রেট',
    en: 'API secret',
    type: 'password',
  },
  {
    key: 'auth_header_name',
    bn: 'অথ হেডার নাম',
    en: 'Auth header name',
    type: 'text',
    helpBn: 'ডিফল্ট: Authorization',
    helpEn: 'Default: Authorization',
  },
  {
    key: 'auth_header_value',
    bn: 'অথ হেডার ভ্যালু',
    en: 'Auth header value',
    type: 'text',
    helpBn: 'ডিফল্ট: Bearer {api_key} — {api_key}/{api_secret} প্লেসহোল্ডার চলে।',
    helpEn: 'Default: Bearer {api_key} — {api_key}/{api_secret} placeholders supported.',
  },
  {
    key: 'extra_header_name',
    bn: 'অতিরিক্ত হেডার নাম',
    en: 'Extra header name',
    type: 'text',
  },
  {
    key: 'extra_header_value',
    bn: 'অতিরিক্ত হেডার ভ্যালু',
    en: 'Extra header value',
    type: 'text',
    helpBn: '{api_key}/{api_secret} প্লেসহোল্ডার চলে।',
    helpEn: '{api_key}/{api_secret} placeholders supported.',
  },
  {
    key: 'currency',
    bn: 'কারেন্সি',
    en: 'Currency',
    type: 'text',
    helpBn: 'ডিফল্ট BDT',
    helpEn: 'Default BDT',
  },
  {
    key: 'response_url_field',
    bn: 'রেসপন্স URL ফিল্ড (dot-path)',
    en: 'Response URL field (dot-path)',
    type: 'text',
    helpBn:
      'যেমন: url · data.checkout_url — খালি রাখলে কমন ফিল্ড (url/redirectUrl/checkout_url/GatewayPageURL…) অটো-ডিটেক্ট হবে।',
    helpEn:
      'e.g. url · data.checkout_url — empty auto-detects common keys (url/redirectUrl/checkout_url/GatewayPageURL…).',
  },
]

type Draft = {
  config: Record<string, string>
  instructions: string
  instructionsEn: string
  mode: string
  enabled: boolean
}

export default function AdminPaymentGatewaysView() {
  const { tx, lang } = useUI()
  const [rows, setRows] = useState<GatewayRow[] | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  // ── Custom gateway create/edit dialog ──
  const [dlgOpen, setDlgOpen] = useState(false)
  const [dlgCode, setDlgCode] = useState<string | null>(null) // null = create
  const [dlgName, setDlgName] = useState('')
  const [dlgLogo, setDlgLogo] = useState('')
  const [dlgConfig, setDlgConfig] = useState<Record<string, string>>({})
  const [dlgInstr, setDlgInstr] = useState('')
  const [dlgInstrEn, setDlgInstrEn] = useState('')
  const [dlgSaving, setDlgSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<GatewayRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ gateways: GatewayRow[] }>('/api/admin/payment-gateways')
      setRows(data.gateways)
    } catch {
      toast.error(tx('লোড করা যায়নি', 'Failed to load'))
      setRows([])
    }
  }, [tx])

  useEffect(() => {
    void load()
  }, [load])

  const draftFor = (row: GatewayRow): Draft => {
    return (
      drafts[row.code] ?? {
        config: safeJson(row.config),
        instructions: row.instructions,
        instructionsEn: row.instructionsEn,
        mode: row.mode,
        enabled: row.enabled,
      }
    )
  }

  const patchDraft = (code: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({
      ...prev,
      [code]: { ...draftFor(rows!.find((r) => r.code === code)!), ...prev[code], ...patch },
    }))

  async function save(row: GatewayRow) {
    const d = draftFor(row)
    setSaving(row.code)
    try {
      await apiSend('/api/admin/payment-gateways', 'PUT', {
        code: row.code,
        isCustom: row.isCustom || undefined,
        name: row.isCustom ? row.name : undefined,
        mode: d.mode,
        enabled: d.enabled,
        config: d.config,
        instructions: d.instructions,
        instructionsEn: d.instructionsEn,
      })
      toast.success(tx(`${row.name} সেভ হয়েছে ✓`, `${row.name} saved ✓`))
      await load()
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[row.code]
        return next
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সেভ ব্যর্থ', 'Save failed'))
    } finally {
      setSaving(null)
    }
  }

  function openCreateDialog() {
    setDlgCode(null)
    setDlgName('')
    setDlgLogo('')
    setDlgConfig({})
    setDlgInstr('')
    setDlgInstrEn('')
    setDlgOpen(true)
  }

  function openEditDialog(row: GatewayRow) {
    setDlgCode(row.code)
    setDlgName(row.name)
    setDlgLogo(row.logoUrl ?? '')
    setDlgConfig(safeJson(row.config))
    setDlgInstr(row.instructions)
    setDlgInstrEn(row.instructionsEn)
    setDlgOpen(true)
  }

  async function saveDialog() {
    if (!dlgName.trim()) {
      toast.error(tx('গেটওয়ের নাম আবশ্যক', 'Gateway name is required'))
      return
    }
    setDlgSaving(true)
    try {
      await apiSend('/api/admin/payment-gateways', 'PUT', {
        ...(dlgCode ? { code: dlgCode } : {}),
        isCustom: true,
        name: dlgName.trim(),
        logoUrl: dlgLogo || null,
        config: dlgConfig,
        instructions: dlgInstr,
        instructionsEn: dlgInstrEn,
      })
      toast.success(
        dlgCode
          ? tx('কাস্টম গেটওয়ে আপডেট হয়েছে ✓', 'Custom gateway updated ✓')
          : tx('কাস্টম গেটওয়ে যোগ হয়েছে ✓ — কার্ড থেকে মোড ও চালু করুন', 'Custom gateway added ✓ — set its mode and enable it from the card')
      )
      setDlgOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('সেভ ব্যর্থ', 'Save failed'))
    } finally {
      setDlgSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiSend('/api/admin/payment-gateways', 'DELETE', { code: deleteTarget.code })
      toast.success(tx(`"${deleteTarget.name}" মুছে ফেলা হয়েছে`, `"${deleteTarget.name}" deleted`))
      setDeleteTarget(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('ডিলিট ব্যর্থ', 'Delete failed'))
    } finally {
      setDeleting(false)
    }
  }

  if (rows === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const bn = lang === 'bn'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{tx('পেমেন্ট গেটওয়ে সেটআপ', 'Payment Gateway Setup')}</h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'বাংলাদেশের গেটওয়ের অফিসিয়াল API তথ্য দিয়ে লাইভ করুন, যেকোনো কাস্টম লাইভ গেটওয়ে যোগ করুন, অথবা ম্যানুয়াল ইনভয়েস সিস্টেম চালু রাখুন।',
              'Configure gateways with their official API credentials, add ANY custom live gateway, or keep the manual invoice system.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            {tx('API কী শুধু এই প্যানেলে সংরক্ষিত', 'API keys stay inside this panel')}
          </Badge>
          <Button onClick={openCreateDialog} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {tx('কাস্টম গেটওয়ে যোগ করুন', 'Add custom gateway')}
          </Button>
        </div>
      </div>

      {/* Live notice */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/8 p-3.5 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-amber-800 dark:text-amber-200">
          {tx(
            'LIVE মোডে যেতে হলে প্রতিটি গেটওয়ের অফিসিয়াল ডেভেলপার ড্যাশবোর্ড থেকে API ক্রেডেনশিয়াল নিয়ে এখানে বসান — এন্ডপয়েন্ট ও পেলোড অফিসিয়াল ডকস অনুযায়ী প্রস্তুত। কাস্টম গেটওয়ে Payment URL টেমপ্লেট বা JSON API দিয়ে একদম লাইভ গেটওয়ের মতোই কাজ করে। SANDBOX মোডে ডেমো গেটওয়ে স্ক্রিন চলবে।',
            'To go LIVE, paste each gateway\'s official API credentials — endpoints and payloads are pre-wired per the official docs. Custom gateways work exactly like live gateways via a Payment URL template or a JSON API. SANDBOX mode runs the demo gateway screen.'
          )}
        </p>
      </div>

      {/* Gateway cards */}
      <div className="grid gap-4">
        {rows.map((row, i) => {
          const catalog = GATEWAY_CATALOG.find((g) => g.code === row.code)
          const d = draftFor(row)
          const dirty = drafts[row.code] !== undefined
          const fields = row.isCustom ? CUSTOM_FIELDS : (catalog?.fields ?? [])
          const brandLogo = row.logoUrl || gatewayLogo(row.code)
          return (
            <motion.div
              key={row.code}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.25) }}
            >
              <Card className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Gateway logo — uploaded for custom, official asset for built-ins */}
                    {brandLogo ? (
                      <img src={brandLogo} alt="" aria-hidden className="h-7 w-28 shrink-0 object-contain" />
                    ) : (
                      <span className="grad-brand flex h-11 w-11 items-center justify-center rounded-2xl text-xl text-white shadow-md">
                        {row.logoEmoji}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        {row.name}
                        {row.isCustom && (
                          <Badge variant="outline" className="border-primary/40 text-primary">
                            {tx('কাস্টম', 'CUSTOM')}
                          </Badge>
                        )}
                        {row.mode === 'LIVE' && (
                          <Badge className="gap-1 bg-emerald-500 hover:bg-emerald-500">
                            <Sparkles className="h-3 w-3" /> LIVE
                          </Badge>
                        )}
                        {row.mode === 'SANDBOX' && (
                          <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                            SANDBOX
                          </Badge>
                        )}
                        <DateStamp
                          iso={(row as { createdAt?: string }).createdAt}
                          label={tx('তৈরির তারিখ', 'Created at')}
                          className="ml-auto text-right"
                        />
                        {row.mode === 'OFF' && (
                          <Badge variant="secondary">OFF</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {row.isCustom ? (
                          <span className="text-xs">
                            {tx(
                              'কাস্টম লাইভ গেটওয়ে — চেকআউটে বিল্ট-ইন লাইভ গেটওয়ের মতোই কাজ করে (রিডাইরেক্ট → কলব্যাক → অটো আনলক)।',
                              'Custom live gateway — works on checkout exactly like built-in live gateways (redirect → callback → auto unlock).'
                            )}
                          </span>
                        ) : catalog?.docsUrl ? (
                          <a
                            href={catalog.docsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            {tx('অফিসিয়াল API ডকস', 'Official API docs')} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-xs">{tx('কোনো API লাগে না — ইনভয়েস ভিত্তিক', 'No API needed — invoice based')}</span>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-4">
                      <Tabs value={d.mode} onValueChange={(v) => patchDraft(row.code, { mode: v })}>
                        <TabsList className="h-9">
                          <TabsTrigger value="LIVE" className="px-3 text-xs">LIVE</TabsTrigger>
                          <TabsTrigger value="SANDBOX" className="px-3 text-xs">SANDBOX</TabsTrigger>
                          <TabsTrigger value="OFF" className="px-3 text-xs">OFF</TabsTrigger>
                        </TabsList>
                      </Tabs>
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <Switch
                          checked={d.enabled}
                          onCheckedChange={(v) => patchDraft(row.code, { enabled: v === true })}
                          aria-label={tx('চেকআউটে চালু', 'Enable on checkout')}
                        />
                        {tx('চেকআউটে চালু', 'Enabled')}
                      </label>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Config fields (official API credentials / generic custom) */}
                  {fields.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {fields.map((f) => (
                        <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                          <Label className="text-xs">
                            {bn ? f.bn : f.en} {f.required ? <span className="text-destructive">*</span> : null}
                          </Label>
                          {f.type === 'textarea' ? (
                            <Textarea
                              rows={2}
                              className="mt-1 font-mono text-xs"
                              value={d.config[f.key] ?? ''}
                              onChange={(e) => patchDraft(row.code, { config: { ...d.config, [f.key]: e.target.value } })}
                              placeholder={`${f.en}…`}
                            />
                          ) : (
                            <Input
                              type={f.type === 'password' ? 'password' : 'text'}
                              autoComplete="off"
                              className="mt-1 font-mono text-xs"
                              value={d.config[f.key] ?? ''}
                              onChange={(e) => patchDraft(row.code, { config: { ...d.config, [f.key]: e.target.value } })}
                              placeholder={`${f.en}…`}
                            />
                          )}
                          {(bn ? f.helpBn : f.helpEn) ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">{bn ? f.helpBn : f.helpEn}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Instructions editor (manual invoice + custom gateways) */}
                  {(row.isManual || row.isCustom) && (
                    <div className="grid gap-3">
                      <div>
                        <Label className="text-xs">{tx('চেকআউটে দেখানো নির্দেশনা (বাংলা)', 'Checkout instructions (Bangla)')}</Label>
                        <Textarea
                          rows={3}
                          className="mt-1"
                          value={d.instructions}
                          onChange={(e) => patchDraft(row.code, { instructions: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{tx('নির্দেশনা (ইংরেজি)', 'Instructions (English)')}</Label>
                        <Textarea
                          rows={2}
                          className="mt-1"
                          value={d.instructionsEn}
                          onChange={(e) => patchDraft(row.code, { instructionsEn: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {catalog && (bn ? catalog.noteBn : catalog.noteEn) ? (
                    <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      <Lock className="mr-1 inline h-3 w-3" />
                      {bn ? catalog.noteBn : catalog.noteEn}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {row.isCustom && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => openEditDialog(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {tx('নাম ও লোগো এডিট', 'Edit name & logo')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {tx('ডিলিট', 'Delete')}
                        </Button>
                      </>
                    )}
                    <Button size="sm" className="gap-1.5" disabled={saving === row.code} onClick={() => void save(row)}>
                      {saving === row.code ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {dirty ? tx('পরিবর্তন সেভ করুন', 'Save changes') : tx('সেভ', 'Save')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* ── Custom gateway create/edit dialog ── */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {dlgCode
                ? tx('কাস্টম গেটওয়ে এডিট করুন', 'Edit custom gateway')
                : tx('নতুন কাস্টম পেমেন্ট গেটওয়ে', 'New custom payment gateway')}
            </DialogTitle>
            <DialogDescription>
              {tx(
                'যেকোনো লাইভ পেমেন্ট গেটওয়ে এখানে যোগ করুন — নাম, লোগো (আপলোড বা মিডিয়া লাইব্রেরি), লাইভ ইন্টিগ্রেশন ও নির্দেশনা। চেকআউটে বিল্ট-ইন লাইভ গেটওয়ের মতোই দেখাবে ও কাজ করবে।',
                'Add ANY live payment gateway — name, logo (upload or media library), live integration and instructions. It appears and works on checkout exactly like a built-in live gateway.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>
                  {tx('গেটওয়ের নাম', 'Gateway name')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={dlgName}
                  onChange={(e) => setDlgName(e.target.value)}
                  placeholder={tx('যেমন: AamarPay, Portwallet…', 'e.g. AamarPay, Portwallet…')}
                />
              </div>
              <div className="grid gap-2">
                <Label>{tx('গেটওয়ে লোগো', 'Gateway logo')}</Label>
                {dlgLogo ? (
                  <div className="flex items-center gap-3">
                    <img src={dlgLogo} alt="" aria-hidden className="h-9 w-24 shrink-0 rounded-lg border bg-white object-contain p-1" />
                    <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setDlgLogo('')}>
                      {tx('সরান', 'Remove')}
                    </Button>
                  </div>
                ) : null}
                <ImageUpload value={dlgLogo} onChange={setDlgLogo} />
              </div>
            </div>

            <div className="rounded-2xl border bg-muted/25 p-4">
              <p className="mb-3 text-sm font-semibold">
                {tx('লাইভ ইন্টিগ্রেশন কনফিগারেশন', 'Live integration configuration')}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {CUSTOM_FIELDS.map((f) => (
                  <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                    <Label className="text-xs">
                      {bn ? f.bn : f.en} {f.required ? <span className="text-destructive">*</span> : null}
                    </Label>
                    {f.type === 'textarea' ? (
                      <Textarea
                        rows={2}
                        className="mt-1 font-mono text-xs"
                        value={dlgConfig[f.key] ?? ''}
                        onChange={(e) => setDlgConfig((p) => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={`${f.en}…`}
                      />
                    ) : (
                      <Input
                        type={f.type === 'password' ? 'password' : 'text'}
                        autoComplete="off"
                        className="mt-1 font-mono text-xs"
                        value={dlgConfig[f.key] ?? ''}
                        onChange={(e) => setDlgConfig((p) => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={`${f.en}…`}
                      />
                    )}
                    {(bn ? f.helpBn : f.helpEn) ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">{bn ? f.helpBn : f.helpEn}</p>
                    ) : null}
                  </div>
                ))}
              </div>
              <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                <Lock className="mr-1 inline h-3 w-3" />
                {tx(
                  'দুইভাবে লাইভ করা যায়: (১) শুধু Payment URL টেমপ্লেট দিন — ইউজার সরাসরি গেটওয়ের পেজে যাবে; অথবা (২) API এন্ডপয়েন্ট + কী দিন — সার্ভার JSON পেলোড পাঠিয়ে চেকআউট URL নেবে। দুটোই দিলে Payment URL আগে ব্যবহৃত হবে।',
                  'Two ways to go live: (1) just a Payment URL template — the user goes straight to the gateway page; or (2) an API endpoint + key — the server POSTs a JSON payload and reads the checkout URL. If both are set, Payment URL wins.'
                )}
              </p>
            </div>

            <div className="grid gap-3">
              <div>
                <Label className="text-xs">{tx('চেকআউটে দেখানো নির্দেশনা (বাংলা)', 'Checkout instructions (Bangla)')}</Label>
                <Textarea rows={3} className="mt-1" value={dlgInstr} onChange={(e) => setDlgInstr(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{tx('নির্দেশনা (ইংরেজি)', 'Instructions (English)')}</Label>
                <Textarea rows={2} className="mt-1" value={dlgInstrEn} onChange={(e) => setDlgInstrEn(e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgOpen(false)}>
              {tx('বাতিল', 'Cancel')}
            </Button>
            <Button className="gap-1.5" disabled={dlgSaving} onClick={() => void saveDialog()}>
              {dlgSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {dlgCode ? tx('আপডেট করুন', 'Update') : tx('যোগ করুন', 'Add gateway')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm (custom only) ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tx('কাস্টম গেটওয়ে মুছে ফেলবেন?', 'Delete this custom gateway?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `"${deleteTarget?.name ?? ''}" স্থায়ীভাবে মুছে যাবে — চেকআউটে আর দেখাবে না। পুরনো অর্ডারের রেকর্ড অক্ষত থাকবে।`,
                `"${deleteTarget?.name ?? ''}" will be permanently removed and will no longer appear on checkout. Past order records stay intact.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tx('বাতিল', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : tx('ডিলিট করুন', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function safeJson(s: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(s || '{}')
    if (parsed && typeof parsed === 'object') {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        out[k] = typeof v === 'string' ? v : JSON.stringify(v)
      }
      return out
    }
    return {}
  } catch {
    return {}
  }
}

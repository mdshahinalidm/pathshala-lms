'use client'

/**
 * FooterEditor — edit EVERY footer column from the admin panel:
 * the brand description and each link column's title, links, order and
 * on/off switch. Edits serialize to a JSON string saved in
 * SiteSetting.footerConfig through the normal Settings "Save changes"
 * button. "Reset to default" clears the override so the built-in footer
 * renders again — the site is never broken.
 *
 * The Contact column content (phone / email / address / socials) is edited
 * in the existing "যোগাযোগ" and "সোশ্যাল মিডিয়া" cards — only its title
 * and visibility live here.
 */
import { ArrowDown, ArrowUp, LayoutPanelLeft, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useUI } from '@/store/ui-store'
import {
  DEFAULT_FOOTER_CONFIG,
  NAV_LIMITS,
  parseFooterConfig,
  type FooterColumnConfig,
  type FooterConfig,
  type FooterLinkItem,
} from '@/lib/nav-config'

/** Column display names + whether the column carries a link list. */
const COLUMN_META: Record<string, { bn: string; en: string; hasLinks: boolean }> = {
  quick: { bn: 'কুইক লিংক', en: 'Quick Links', hasLinks: true },
  classes: { bn: 'ক্লাস', en: 'Classes', hasLinks: true },
  tools: { bn: 'মিনি টুলস', en: 'Mini Tools', hasLinks: true },
  essential: { bn: 'প্রয়োজনীয় লিংক', en: 'Essential Links', hasLinks: true },
  contact: { bn: 'যোগাযোগ', en: 'Contact', hasLinks: false },
}

export function FooterEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (json: string) => void
}) {
  const { tx } = useUI()

  /** Saved config, or the built-in footer pre-filled for editing. */
  const cfg: FooterConfig = parseFooterConfig(value) ?? DEFAULT_FOOTER_CONFIG

  const commit = (next: FooterConfig) => onChange(JSON.stringify(next))

  const setAbout = (patch: Partial<FooterConfig>) =>
    commit({ ...cfg, ...patch })

  const updateColumn = (i: number, patch: Partial<FooterColumnConfig>) =>
    commit({ ...cfg, columns: cfg.columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) })

  const updateLink = (ci: number, li: number, patch: Partial<FooterLinkItem>) =>
    commit({
      ...cfg,
      columns: cfg.columns.map((c, idx) =>
        idx === ci && c.links
          ? { ...c, links: c.links.map((l, lIdx) => (lIdx === li ? { ...l, ...patch } : l)) }
          : c,
      ),
    })

  const moveLink = (ci: number, li: number, dir: -1 | 1) => {
    const col = cfg.columns[ci]
    if (!col?.links) return
    const j = li + dir
    if (j < 0 || j >= col.links.length) return
    const next = [...col.links]
    ;[next[li], next[j]] = [next[j], next[li]]
    updateColumn(ci, { links: next })
  }

  const removeLink = (ci: number, li: number) => {
    const col = cfg.columns[ci]
    if (!col?.links) return
    updateColumn(ci, { links: col.links.filter((_, idx) => idx !== li) })
  }

  const addLink = (ci: number) => {
    const col = cfg.columns[ci]
    if (!col || col.links === undefined) return
    updateColumn(ci, {
      links: [
        ...(col.links ?? []),
        { labelBn: '', labelEn: '', href: '/' },
      ],
    })
  }

  return (
    <div className="space-y-4 sm:col-span-2">
      <p className="rounded-xl border border-dashed bg-background px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        {tx(
          'ফুটারের প্রতিটি কলাম শুরু থেকে শেষ পর্যন্ত সম্পাদনা করুন — ব্র্যান্ড বর্ণনা, কলামের শিরোনাম, লিংক (যোগ/মুছে/সাজানো) এবং প্রতিটি কলাম চালু/বন্ধ। বন্ধ করা কলাম সাইটে দেখা যাবে না। পরিবর্তনের পর নিচের "সংরক্ষণ করুন" চাপুন।',
          'Edit every footer column from start to end — brand description, column titles, links (add/remove/reorder) and each column on/off. Turned-off columns disappear from the site. Press "Save changes" below.'
        )}
      </p>

      {/* ── Brand description ── */}
      <div className="rounded-xl border bg-muted/30 p-3">
        <p className="mb-2 text-sm font-semibold">
          {tx('ব্র্যান্ড বর্ণনা (১ম কলাম)', 'Brand description (1st column)')}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">{tx('বাংলা', 'Bangla')}</Label>
            <Textarea
              rows={3}
              maxLength={NAV_LIMITS.aboutMax}
              value={cfg.aboutTextBn}
              onChange={(e) => setAbout({ aboutTextBn: e.target.value })}
              placeholder={DEFAULT_FOOTER_CONFIG.aboutTextBn}
              className="resize-none text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">{tx('ইংরেজি', 'English')}</Label>
            <Textarea
              rows={3}
              maxLength={NAV_LIMITS.aboutMax}
              value={cfg.aboutTextEn}
              onChange={(e) => setAbout({ aboutTextEn: e.target.value })}
              placeholder={DEFAULT_FOOTER_CONFIG.aboutTextEn}
              className="resize-none text-sm"
            />
          </div>
        </div>
      </div>

      {/* ── Columns ── */}
      {cfg.columns.map((column, ci) => {
        const meta = COLUMN_META[column.key]
        return (
          <div key={column.key} className="rounded-xl border bg-muted/30 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                {tx(meta?.bn ?? column.key, meta?.en ?? column.key)}
              </p>
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={column.enabled}
                  onCheckedChange={(v) => updateColumn(ci, { enabled: v })}
                  aria-label={tx('কলাম দেখান/লুকান', 'Show/hide column')}
                />
                <span className="text-[11px] text-muted-foreground">
                  {column.enabled ? tx('চালু', 'On') : tx('বন্ধ — সাইটে লুকানো', 'Off — hidden on site')}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {tx('শিরোনাম (বাংলা)', 'Title (Bangla)')}
                </Label>
                <Input
                  value={column.titleBn}
                  maxLength={NAV_LIMITS.titleMax}
                  onChange={(e) => updateColumn(ci, { titleBn: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {tx('শিরোনাম (ইংরেজি)', 'Title (English)')}
                </Label>
                <Input
                  value={column.titleEn}
                  maxLength={NAV_LIMITS.titleMax}
                  onChange={(e) => updateColumn(ci, { titleEn: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Link list (contact column has none — its content is edited above) */}
            {meta?.hasLinks && column.links && (
              <div className="mt-3 space-y-2">
                {column.links.map((link, li) => (
                  <div key={`${column.key}-link-${li}`} className="flex flex-wrap items-end gap-2 rounded-lg border bg-background p-2">
                    <div className="grid flex-1 gap-1 sm:grid-cols-[1fr_1fr_1.2fr]">
                      <div className="grid gap-1">
                        <Label className="text-[11px] text-muted-foreground">{tx('লেবেল (বাংলা)', 'Label (Bangla)')}</Label>
                        <Input
                          value={link.labelBn}
                          maxLength={NAV_LIMITS.labelMax}
                          onChange={(e) => updateLink(ci, li, { labelBn: e.target.value })}
                          className="h-8 text-sm"
                          aria-label={tx('লিংক লেবেল (বাংলা)', 'Link label (Bangla)')}
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[11px] text-muted-foreground">{tx('লেবেল (ইংরেজি)', 'Label (English)')}</Label>
                        <Input
                          value={link.labelEn}
                          maxLength={NAV_LIMITS.labelMax}
                          onChange={(e) => updateLink(ci, li, { labelEn: e.target.value })}
                          className="h-8 text-sm"
                          aria-label={tx('লিংক লেবেল (ইংরেজি)', 'Link label (English)')}
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[11px] text-muted-foreground">{tx('লিংক', 'Link')}</Label>
                        <Input
                          value={link.href}
                          maxLength={NAV_LIMITS.hrefMax}
                          onChange={(e) => updateLink(ci, li, { href: e.target.value })}
                          className="h-8 font-mono text-xs"
                          placeholder="/courses"
                          aria-label={tx('লিংক URL', 'Link URL')}
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={li === 0}
                        onClick={() => moveLink(ci, li, -1)}
                        aria-label={tx('উপরে নিন', 'Move up')}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={li === column.links.length - 1}
                        onClick={() => moveLink(ci, li, 1)}
                        aria-label={tx('নিচে নিন', 'Move down')}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeLink(ci, li)}
                        aria-label={tx('মুছুন', 'Remove')}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => addLink(ci)}
                  disabled={column.links.length >= NAV_LIMITS.linksPerColumn}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {tx('লিংক যোগ করুন', 'Add link')}
                </Button>
              </div>
            )}

            {column.key === 'contact' && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {tx(
                  'এই কলামের ফোন/ইমেইল/ঠিকানা উপরের "যোগাযোগ" কার্ডে এবং সোশ্যাল আইকন "সোশ্যাল মিডিয়া" কার্ডে সম্পাদনা করুন।',
                  "Edit this column's phone/email/address in the \"যোগাযোগ\" card above, and the social icons in \"সোশ্যাল মিডিয়া\"."
                )}
              </p>
            )}
          </div>
        )
      })}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => onChange('')}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {tx('ডিফল্ট ফুটারে ফিরুন', 'Reset to default footer')}
        </Button>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <LayoutPanelLeft className="h-3 w-3" aria-hidden />
          {tx('ফুটার কাস্টমাইজেশন', 'Footer customization')}
        </span>
      </div>
    </div>
  )
}

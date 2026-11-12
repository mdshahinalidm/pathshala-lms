'use client'

/**
 * HeaderMenuEditor — add / remove / edit / reorder the site
 * header menu from the admin panel. Edits serialize to a JSON string that
 * is saved in SiteSetting.headerMenuConfig through the normal Settings
 * "Save changes" button. "Reset to default" clears the override (empty
 * string) so the built-in menu renders again — the site is never broken.
 */
import { ArrowDown, ArrowUp, ListTree, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useUI } from '@/store/ui-store'
import {
  DEFAULT_HEADER_MENU,
  NAV_LIMITS,
  parseHeaderMenu,
  type NavItemConfig,
} from '@/lib/nav-config'

export function HeaderMenuEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (json: string) => void
}) {
  const { tx } = useUI()

  /** Saved config, or the built-in menu pre-filled for editing. */
  const items: NavItemConfig[] = parseHeaderMenu(value) ?? DEFAULT_HEADER_MENU

  const commit = (next: NavItemConfig[]) => onChange(JSON.stringify(next))

  const update = (i: number, patch: Partial<NavItemConfig>) =>
    commit(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    commit(next)
  }

  const remove = (i: number) => commit(items.filter((_, idx) => idx !== i))

  const add = () =>
    commit([
      ...items,
      {
        labelBn: '',
        labelEn: '',
        href: '/',
        enabled: true,
      },
    ])

  return (
    <div className="space-y-3 sm:col-span-2">
      <p className="rounded-xl border border-dashed bg-background px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        {tx(
          'হেডারের মেনু আইটেমগুলো বদলান / যোগ করুন / মুছুন / উপর-নিচ সাজান। পরিবর্তনের পর নিচের "সংরক্ষণ করুন" চাপলেই সাইটের হেডার ও মোবাইল মেনু আপডেট হবে।',
          'Edit / add / remove / reorder the header menu items. Press "Save changes" below and the site header + mobile menu update instantly.'
        )}
      </p>

      <div className="space-y-2">
        {items.map((item, i) => (
          <div
            key={`${item.href}-${i}`}
            className="rounded-xl border bg-muted/30 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">
                {i + 1}
              </span>
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">
                    {tx('লেবেল (বাংলা)', 'Label (Bangla)')}
                  </Label>
                  <Input
                    value={item.labelBn}
                    maxLength={NAV_LIMITS.labelMax}
                    onChange={(e) => update(i, { labelBn: e.target.value })}
                    placeholder={tx('হোম', 'Home')}
                    className="h-8 text-sm"
                    aria-label={tx('মেনু লেবেল বাংলা', 'Menu label Bangla')}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">
                    {tx('লেবেল (ইংরেজি)', 'Label (English)')}
                  </Label>
                  <Input
                    value={item.labelEn}
                    maxLength={NAV_LIMITS.labelMax}
                    onChange={(e) => update(i, { labelEn: e.target.value })}
                    placeholder="Home"
                    className="h-8 text-sm"
                    aria-label={tx('মেনু লেবেল ইংরেজি', 'Menu label English')}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">
                    {tx('লিংক (URL/পাথ)', 'Link (URL/path)')}
                  </Label>
                  <Input
                    value={item.href}
                    maxLength={NAV_LIMITS.hrefMax}
                    onChange={(e) => update(i, { href: e.target.value })}
                    placeholder="/courses"
                    className="h-8 font-mono text-xs"
                    aria-label={tx('মেনু লিংক', 'Menu link')}
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <div className="mr-1 flex items-center gap-1.5">
                  <Switch
                    checked={item.enabled}
                    onCheckedChange={(v) => update(i, { enabled: v })}
                    aria-label={tx('দেখান/লুকান', 'Show/hide')}
                  />
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">
                    {item.enabled ? tx('চালু', 'On') : tx('লুকানো', 'Hidden')}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={tx('উপরে নিন', 'Move up')}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={i === items.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={tx('নিচে নিন', 'Move down')}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => remove(i)}
                  aria-label={tx('মুছুন', 'Remove')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={add}
          disabled={items.length >= NAV_LIMITS.headerItems}
        >
          <Plus className="h-3.5 w-3.5" />
          {tx('মেনু আইটেম যোগ করুন', 'Add menu item')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => onChange('')}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {tx('ডিফল্ট মেনুতে ফিরুন', 'Reset to default menu')}
        </Button>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <ListTree className="h-3 w-3" aria-hidden />
          {items.length}/{NAV_LIMITS.headerItems}
        </span>
      </div>
    </div>
  )
}

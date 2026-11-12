'use client'

/**
 * Admin data-tools — shared building blocks for "every section is selectable,
 * deletable and click-to-inspect" + the dual horizontal scrollbar:
 *  - useBulkSelection()  selection state helper
 *  - BulkBar             floating action bar for selected rows
 *  - SelectAll / RowBox  checkbox cells
 *  - DetailsDialog       generic key-value details popup (row click → details)
 *  - ScrollX             wrapper that shows a HORIZONTAL scrollbar at BOTH
 *                        the top AND the bottom (synced) for wide tables
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, Trash2, X } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUI } from '@/store/ui-store'

/* ── Bulk selection ──────────────────────────────────────────────── */

export function useBulkSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback((ids: string[]) => {
    setSelected((prev) => {
      if (ids.length > 0 && ids.every((id) => prev.has(id))) {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      }
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
  }, [])

  const clear = useCallback(() => setSelected(new Set()), [])
  const isSelected = useCallback((id: string) => selected.has(id), [selected])

  return {
    selected: Array.from(selected),
    toggle,
    toggleAll,
    clear,
    isSelected,
    count: selected.size,
  }
}

export function SelectAll({
  ids,
  isSelected,
  onToggleAll,
}: {
  ids: string[]
  isSelected: (id: string) => boolean
  onToggleAll: (ids: string[]) => void
}) {
  const all = ids.length > 0 && ids.every(isSelected)
  return (
    <Checkbox
      checked={all}
      onCheckedChange={() => onToggleAll(ids)}
      aria-label="Select all"
      className="align-middle"
    />
  )
}

export function RowBox({
  id,
  isSelected,
  onToggle,
}: {
  id: string
  isSelected: (id: string) => boolean
  onToggle: (id: string) => void
}) {
  return (
    <span role="cell" className="px-1" onClick={(e) => e.stopPropagation()}>
      <Checkbox
        checked={isSelected(id)}
        onCheckedChange={() => onToggle(id)}
        aria-label="Select row"
      />
    </span>
  )
}

export function BulkBar({
  count,
  deleting,
  onDelete,
  onClear,
  extra,
  confirmMessage,
}: {
  count: number
  deleting?: boolean
  /** Called AFTER the built-in confirm dialog is accepted. */
  onDelete: () => void
  onClear: () => void
  extra?: ReactNode
  confirmMessage?: string
}) {
  const { t, tx } = useUI()
  const [confirming, setConfirming] = useState(false)
  if (count === 0) return null
  return (
    <>
      <div className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit items-center gap-3 rounded-2xl border bg-background/95 px-4 py-2.5 shadow-2xl backdrop-blur">
        <span className="grad-brand flex h-8 min-w-8 items-center justify-center rounded-xl px-2 text-sm font-bold text-white">
          {count}
        </span>
        <span className="text-sm font-medium">{tx('টি নির্বাচিত', 'selected')}</span>
        {extra}
        <Button
          size="sm"
          variant="destructive"
          className="gap-1.5"
          disabled={deleting}
          onClick={() => setConfirming(true)}
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {t('delete')}
        </Button>
        <Button size="sm" variant="ghost" className="gap-1" onClick={onClear}>
          <X className="h-4 w-4" /> {tx('বাতিল', 'Clear')}
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('নির্বাচিতগুলো মুছে ফেলবেন?', 'Delete the selected items?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMessage ??
                tx(
                  `${count} টি আইটেম স্থায়ীভাবে মুছে যাবে — এটি ফেরানো যাবে না।`,
                  `${count} item(s) will be permanently deleted. This cannot be undone.`
                )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                setConfirming(false)
                onDelete()
              }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/* ── Row details dialog ──────────────────────────────────────────── */

export interface DetailField {
  label: string
  value: ReactNode
}

export function DetailsDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  fields,
  actions,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  subtitle?: string
  fields: DetailField[]
  actions?: ReactNode
}) {
  const { t } = useUI()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6">{title}</DialogTitle>
          {subtitle ? <DialogDescription>{subtitle}</DialogDescription> : null}
        </DialogHeader>
        <dl className="divide-y rounded-xl border">
          {fields.map((f, i) => (
            <div key={i} className="flex gap-3 px-3 py-2.5 text-sm odd:bg-muted/30">
              <dt className="w-36 shrink-0 font-medium text-muted-foreground">{f.label}</dt>
              <dd className="min-w-0 flex-1 break-words">{f.value ?? '—'}</dd>
            </div>
          ))}
        </dl>
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
        <Button variant="outline" className="mt-1" onClick={() => onOpenChange(false)}>
          {t('cancel')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

/* ── Dual horizontal scrollbar (top + bottom, synced) ────────────── */

export function ScrollX({ children, className = '' }: { children: ReactNode; className?: string }) {
  const topRef = useRef<HTMLDivElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const syncing = useRef(false)
  const [wide, setWide] = useState(false)
  const [sw, setSw] = useState(0)

  const measure = useCallback(() => {
    const box = boxRef.current
    if (!box) return
    setWide(box.scrollWidth > box.clientWidth + 8)
    setSw(box.scrollWidth)
  }, [])

  useEffect(() => {
    measure()
    const box = boxRef.current
    if (!box) return
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [measure])

  const syncFromTop = () => {
    if (syncing.current) return
    syncing.current = true
    if (boxRef.current && topRef.current) boxRef.current.scrollLeft = topRef.current.scrollLeft
    syncing.current = false
  }
  const syncFromBox = () => {
    if (syncing.current) return
    syncing.current = true
    if (boxRef.current && topRef.current) topRef.current.scrollLeft = boxRef.current.scrollLeft
    syncing.current = false
  }

  return (
    <div className={`relative ${className}`}>
      {/* Top scrollbar (mirrored) */}
      <div
        ref={topRef}
        onScroll={syncFromTop}
        className="scrollbar-thin overflow-x-auto"
        style={{ height: wide ? 12 : 0, marginBottom: wide ? 2 : 0 }}
        aria-hidden
      >
        <div style={{ height: 1, width: sw || '100%' }} />
      </div>
      <div ref={boxRef} onScroll={syncFromBox} className="scrollbar-thin overflow-x-auto">
        {children}
      </div>
    </div>
  )
}

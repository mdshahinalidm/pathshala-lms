'use client'

/**
 * ListEditor — reorderable list of short strings (benefits, requirements, …).
 * Each row: Input + ArrowUp/ArrowDown/Trash2. Caller owns the array state.
 */
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUI } from '@/store/ui-store'

export function ListEditor({
  items,
  onChange,
  placeholder,
  addLabel,
}: {
  items: string[]
  onChange: (items: string[]) => void
  placeholder?: string
  addLabel: string
}) {
  const { tx } = useUI()

  function update(index: number, value: string) {
    onChange(items.map((it, i) => (i === index ? value : it)))
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const tmp = next[index]
    next[index] = next[target]
    next[target] = tmp
    onChange(next)
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function add() {
    onChange([...items, ''])
  }

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          {tx('এখনো কিছু যোগ করা হয়নি', 'Nothing added yet')}
        </p>
      )}

      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={item}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
            aria-label={`${tx('আইটেম', 'Item')} ${i + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={i === 0}
            onClick={() => move(i, -1)}
            aria-label={tx('উপরে সরান', 'Move up')}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={i === items.length - 1}
            onClick={() => move(i, 1)}
            aria-label={tx('নিচে সরান', 'Move down')}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
            onClick={() => remove(i)}
            aria-label={tx('মুছুন', 'Remove')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={add}>
        <Plus className="h-4 w-4" /> {addLabel}
      </Button>
    </div>
  )
}

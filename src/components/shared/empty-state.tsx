'use client'

import { Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
      <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/15 via-violet-500/10 to-amber-500/15 text-primary ring-1 ring-primary/15">
        <span aria-hidden className="grad-brand absolute -top-px left-1/2 h-1 w-8 -translate-x-1/2 rounded-b-full" />
        {icon ?? <Inbox className="h-7 w-7" />}
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {actionLabel && onAction && (
        <Button className="mt-2" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  )
}

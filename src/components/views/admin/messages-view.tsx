'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { ChevronDown, Inbox, Mail, Reply, ShieldX, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
import { EmptyState } from '@/components/shared/empty-state'
import { apiDelete, apiGet, apiPatch, apiSend } from '@/lib/api-client'
import { digitsBn, fmtStampText } from '@/lib/format'
import { DateStamp } from '@/components/admin/date-stamp'
import { useAuth } from '@/store/auth-store'
import { go, useUI } from '@/store/ui-store'
import {
  BulkBar,
  DetailsDialog,
  RowBox,
  ScrollX,
  SelectAll,
  useBulkSelection,
} from '@/components/admin/data-tools'
import { isPanelRole, isOwner } from '@/lib/roles'

interface ContactMessage {
  id: string
  name: string
  email: string
  phone: string | null
  subject: string
  message: string
  isRead: boolean
  createdAt: string
}

interface MessagesPayload {
  messages: ContactMessage[]
  unreadCount?: number
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

export default function AdminMessagesView() {
  const { user, status, initialized } = useAuth()
  const { tx, lang } = useUI()

  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ContactMessage | null>(null)

  const bulk = useBulkSelection()
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [details, setDetails] = useState<ContactMessage | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<MessagesPayload>('/api/admin/messages')
      const list = Array.isArray(data) ? (data as unknown as ContactMessage[]) : (data.messages ?? [])
      setMessages(list)
      const unread =
        typeof data?.unreadCount === 'number'
          ? data.unreadCount
          : list.filter((m) => !m.isRead).length
      setUnreadCount(unread)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [tx])

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [load])

  function toggleRow(m: ContactMessage) {
    const next = expandedId === m.id ? null : m.id
    setExpandedId(next)
    if (next !== null && !m.isRead) {
      void markRead(m)
    }
  }

  async function markRead(m: ContactMessage) {
    try {
      await apiPatch(`/api/admin/messages/${m.id}`, { isRead: true })
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, isRead: true } : x)))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপডেট ব্যর্থ', 'Update failed'))
    }
  }

  async function bulkDelete() {
    setBulkDeleting(true)
    try {
      const r = await apiSend<{ deleted: number }>('/api/admin/bulk-delete', 'POST', {
        resource: 'messages',
        ids: bulk.selected,
      })
      toast.success(tx(`${r.deleted} টি মেসেজ মুছে ফেলা হয়েছে`, `${r.deleted} message(s) deleted`))
      bulk.clear()
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await apiDelete(`/api/admin/messages/${deleteTarget.id}`)
      toast.success(tx('মেসেজ মুছে ফেলা হয়েছে', 'Message deleted'))
      if (!deleteTarget.isRead) setUnreadCount((c) => Math.max(0, c - 1))
      if (expandedId === deleteTarget.id) setExpandedId(null)
      setMessages((prev) => prev.filter((x) => x.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    }
  }

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return <AccessDenied />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{tx('ইনবক্স', 'Inbox')}</h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'যোগাযোগ ফর্ম থেকে আসা মেসেজ দেখুন ও উত্তর দিন',
              'View and reply to contact form messages'
            )}
          </p>
        </div>
        {messages.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SelectAll
              ids={messages.map((m) => m.id)}
              isSelected={bulk.isSelected}
              onToggleAll={bulk.toggleAll}
            />
            <span>{tx('সব নির্বাচন', 'Select all')}</span>
          </div>
        )}
        {unreadCount > 0 && (
          <Badge className="gap-1.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            <Mail className="h-3.5 w-3.5" />
            {lang === 'bn' ? digitsBn(unreadCount) : unreadCount}{' '}
            {tx('টি অপঠিত', 'unread')}
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-7 w-7" />}
          title={tx('ইনবক্স খালি', 'Inbox is empty')}
          description={tx(
            'কেউ যোগাযোগ ফর্মে মেসেজ দিলে এখানে দেখা যাবে।',
            'Messages from the contact form will appear here.'
          )}
        />
      ) : (
        <ScrollX>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-2"
          >
          {messages.map((m) => {
            const expanded = expandedId === m.id
            return (
              <Card
                key={m.id}
                className={m.isRead ? 'transition-colors' : 'border-primary/30 bg-primary/5 transition-colors'}
              >
                <CardContent className="p-4">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    onClick={() => toggleRow(m)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleRow(m)
                      }
                    }}
                    className="cursor-pointer space-y-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center gap-2">
                      <RowBox id={m.id} isSelected={bulk.isSelected} onToggle={bulk.toggle} />
                      {!m.isRead && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      )}
                      <h3
                        className="min-w-0 flex-1 cursor-pointer truncate text-sm font-bold hover:underline"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDetails(m)
                        }}
                      >
                        {m.subject || tx('কোনো বিষয় নেই', 'No subject')}
                      </h3>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span
                        className="cursor-pointer font-medium text-foreground hover:underline"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDetails(m)
                        }}
                      >
                        {m.name}
                      </span>
                      {m.email && <span>· {m.email}</span>}
                      {m.phone && <span>· {m.phone}</span>}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p
                        className={`min-w-0 flex-1 text-sm text-muted-foreground ${expanded ? '' : 'line-clamp-1'}`}
                      >
                        {m.message}
                      </p>
                      <DateStamp iso={m.createdAt} />
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                          <a
                            href={`mailto:${m.email}?subject=Re: ${encodeURIComponent(m.subject || 'আপনার মেসেজ')}`}
                          >
                            <Button variant="outline" size="sm" className="gap-2">
                              <Reply className="h-4 w-4" />
                              {tx('উত্তর দিন', 'Reply')}
                            </Button>
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-2 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(m)}
                          >
                            <Trash2 className="h-4 w-4" />
                            {tx('মুছুন', 'Delete')}
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            )
          })}
          </motion.div>
        </ScrollX>
      )}

      {/* ── Message details dialog (subject/name click) ── */}
      <DetailsDialog
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        title={details?.subject || tx('কোনো বিষয় নেই', 'No subject')}
        subtitle={details?.name}
        fields={[
          { label: tx('নাম', 'Name'), value: details?.name || '—' },
          { label: tx('ইমেইল', 'Email'), value: details?.email || '—' },
          { label: tx('ফোন', 'Phone'), value: details?.phone || '—' },
          { label: tx('বিষয়', 'Subject'), value: details?.subject || '—' },
          { label: tx('মেসেজ', 'Message'), value: details?.message || '—' },
          {
            label: tx('তারিখ', 'Date'),
            value: details ? fmtStampText(details.createdAt) : '—',
          },
          {
            label: tx('পড়া হয়েছে', 'Read status'),
            value: details
              ? details.isRead
                ? tx('পঠিত', 'Read')
                : tx('অপঠিত', 'Unread')
              : '—',
          },
        ]}
      />

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('মেসেজ মুছে ফেলবেন?', 'Delete this message?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                'মেসেজটি স্থায়ীভাবে মুছে যাবে — পরে আর পুনরুদ্ধার করা যাবে না।',
                'The message will be permanently deleted and cannot be recovered.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tx('বাতিল', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              {tx('মুছুন', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkBar
        count={bulk.count}
        deleting={bulkDeleting}
        onDelete={() => void bulkDelete()}
        onClear={bulk.clear}
      />
    </div>
  )
}

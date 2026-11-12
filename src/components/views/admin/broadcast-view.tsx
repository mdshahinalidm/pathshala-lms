'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Check,
  Info,
  Loader2,
  Search,
  Send,
  ShieldX,
  Users,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/shared/empty-state'
import { apiGet, apiPost } from '@/lib/api-client'
import { digitsBn } from '@/lib/format'
import { CLASS_OPTIONS, classLabel, type ClassKey } from '@/lib/student-classes'
import { useAuth } from '@/store/auth-store'
import { go, useUI } from '@/store/ui-store'
import { isPanelRole } from '@/lib/roles'

interface AdminUserLite {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  role: 'STUDENT' | 'ADMIN'
}

type Audience = 'all' | 'classes' | 'specific'

const MAX_RECIPIENTS = 20
const BODY_LIMIT = 300

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

export default function AdminBroadcastView() {
  const { user, status, initialized } = useAuth()
  const { tx, lang } = useUI()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('')
  const [audience, setAudience] = useState<Audience>('all')
  const [targetClasses, setTargetClasses] = useState<ClassKey[]>([])

  const [search, setSearch] = useState('')
  const [results, setResults] = useState<AdminUserLite[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [selected, setSelected] = useState<AdminUserLite[]>([])

  const [sending, setSending] = useState(false)

  const num = useCallback((n: number | string) => (lang === 'bn' ? digitsBn(n) : String(n)), [lang])

  const loadUsers = useCallback(async (q: string) => {
    setLoadingUsers(true)
    try {
      const url = q.trim()
        ? `/api/admin/users?q=${encodeURIComponent(q.trim())}`
        : '/api/admin/users'
      const data = await apiGet<AdminUserLite[]>(url)
      setResults(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('ইউজার লোড করা যায়নি', 'Failed to load users'))
    } finally {
      setLoadingUsers(false)
    }
  }, [tx])

  useEffect(() => {
    if (audience !== 'specific') return
    const timer = setTimeout(() => void loadUsers(search), 350)
    return () => clearTimeout(timer)
  }, [search, audience, loadUsers])

  function isSelected(u: AdminUserLite): boolean {
    return selected.some((s) => s.id === u.id)
  }

  function toggleUser(u: AdminUserLite) {
    if (isSelected(u)) {
      setSelected((prev) => prev.filter((s) => s.id !== u.id))
      return
    }
    if (selected.length >= MAX_RECIPIENTS) {
      toast.error(
        tx(`সর্বোচ্চ ${digitsBn(MAX_RECIPIENTS)} জন নির্বাচন করা যাবে`, `You can select up to ${MAX_RECIPIENTS} recipients`)
      )
      return
    }
    setSelected((prev) => [...prev, u])
  }

  async function handleSend() {
    const trimmedTitle = title.trim()
    const trimmedBody = body.trim()
    if (trimmedTitle.length < 3 || trimmedTitle.length > 120) {
      toast.error(
        tx('শিরোনাম ৩ থেকে ১২০ অক্ষরের মধ্যে দিন', 'Title must be between 3 and 120 characters')
      )
      return
    }
    if (!trimmedBody) {
      toast.error(tx('মেসেজ লিখুন', 'Message body is required'))
      return
    }
    if (trimmedBody.length > BODY_LIMIT) {
      toast.error(
        tx(`মেসেজ সর্বোচ্চ ${digitsBn(BODY_LIMIT)} অক্ষরের হতে হবে`, `Message must be at most ${BODY_LIMIT} characters`)
      )
      return
    }
    if (audience === 'classes' && targetClasses.length === 0) {
      toast.error(tx('অন্তত একটি শ্রেণি/বর্ষ নির্বাচন করুন', 'Select at least one class/year'))
      return
    }
    if (audience === 'specific' && selected.length === 0) {
      toast.error(tx('অন্তত একজন প্রাপক নির্বাচন করুন', 'Select at least one recipient'))
      return
    }

    setSending(true)
    try {
      const payload: {
        title: string
        body: string
        link?: string
        userIds?: string[]
        targetClasses?: ClassKey[]
      } = {
        title: trimmedTitle,
        body: trimmedBody,
      }
      const trimmedLink = link.trim()
      if (trimmedLink) payload.link = trimmedLink
      if (audience === 'specific') payload.userIds = selected.map((u) => u.id)
      if (audience === 'classes') payload.targetClasses = targetClasses

      const res = await apiPost<{ notifiedCount?: number }>('/api/admin/broadcast', payload)
      const count = typeof res?.notifiedCount === 'number' ? res.notifiedCount : 0
      toast.success(
        tx(`${digitsBn(count)} জনকে পাঠানো হয়েছে`, `Notification sent to ${count} recipients`)
      )
      setTitle('')
      setBody('')
      setLink('')
      setAudience('all')
      setTargetClasses([])
      setSelected([])
      setSearch('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('পাঠানো ব্যর্থ', 'Failed to send'))
    } finally {
      setSending(false)
    }
  }

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return <AccessDenied />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">
          {tx('ঘোষণা ব্রডকাস্ট', 'Broadcast Announcement')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tx(
            'শিক্ষার্থীদের নোটিফিকেশনে ঘোষণা পাঠান',
            'Send announcements to student notifications'
          )}
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mx-auto max-w-2xl"
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Send className="h-4.5 w-4.5" />
              </span>
              {tx('ঘোষণা পাঠান', 'Send announcement')}
            </CardTitle>
            <CardDescription>
              {tx(
                'শিরোনাম, বার্তা ও প্রাপক নির্ধারণ করুন',
                'Compose the title, message and audience'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Alert className="border-primary/30 bg-primary/5">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                {tx(
                  'ঘোষণা সব শিক্ষার্থীর নোটিফিকেশনে যাবে।',
                  'The announcement will be delivered to student notifications.'
                )}
              </AlertDescription>
            </Alert>

            <div className="grid gap-1.5">
              <Label htmlFor="bc-title">
                {tx('শিরোনাম', 'Title')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="bc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tx('যেমন: নতুন কোর্স প্রকাশিত হয়েছে', 'e.g. New course published')}
                maxLength={140}
              />
              <p className="text-xs text-muted-foreground">
                {tx('৩–১২০ অক্ষর', '3–120 characters')}
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="bc-body">
                {tx('বার্তা', 'Message')} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="bc-body"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={tx('ঘোষণার বিস্তারিত লিখুন...', 'Write the announcement details...')}
                className="resize-none"
              />
              <p
                className={`text-xs ${body.length > BODY_LIMIT ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
              >
                {num(body.length)} / {num(BODY_LIMIT)}
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="bc-link">{tx('লিংক (ঐচ্ছিক)', 'Link (optional)')}</Label>
              <Input
                id="bc-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="/notices"
              />
              <p className="text-xs text-muted-foreground">
                {tx(
                  "'/notices' বা '/courses' এর মতো ইন-অ্যাপ লিংক দিন",
                  "Use an in-app link like '/notices' or '/courses'"
                )}
              </p>
            </div>

            <Separator />

            <div className="grid gap-3">
              <Label>{tx('প্রাপক', 'Audience')}</Label>
              <RadioGroup
                value={audience}
                onValueChange={(v) => setAudience(v as Audience)}
                className="gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="aud-all" />
                  <Label htmlFor="aud-all" className="font-normal">
                    {tx('সব শিক্ষার্থী', 'All students')}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="classes" id="aud-classes" />
                  <Label htmlFor="aud-classes" className="font-normal">
                    {tx('নির্দিষ্ট শ্রেণি/বর্ষ', 'Specific classes/years')}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="specific" id="aud-specific" />
                  <Label htmlFor="aud-specific" className="font-normal">
                    {tx('নির্দিষ্ট ইউজার', 'Specific users')}
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {audience === 'classes' && (
              <div className="grid gap-2 rounded-xl border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  {tx(
                    'যে শ্রেণি/বর্ষের শিক্ষার্থীরা নোটিশ পাবেন তা নির্বাচন করুন:',
                    'Select which class(es)/year(s) will receive this notice:'
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CLASS_OPTIONS.map((c) => {
                    const active = targetClasses.includes(c.value)
                    return (
                      <button
                        key={c.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setTargetClasses((prev) =>
                            active ? prev.filter((k) => k !== c.value) : [...prev, c.value]
                          )
                        }
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'bg-card hover:bg-accent'
                        }`}
                      >
                        {tx(c.bn, c.en)}
                      </button>
                    )
                  })}
                </div>
                {targetClasses.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {tx(
                      `নির্বাচিত: ${targetClasses.map((c) => classLabel(c, lang)).join(', ')}`,
                      `Selected: ${targetClasses.map((c) => classLabel(c, 'en')).join(', ')}`
                    )}
                  </p>
                )}
              </div>
            )}

            {audience === 'specific' && (
              <div className="grid gap-3 rounded-xl border bg-muted/30 p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={tx('নাম, ইমেইল বা ফোন দিয়ে খুঁজুন...', 'Search by name, email or phone...')}
                    className="pl-9"
                    aria-label={tx('ইউজার খুঁজুন', 'Search users')}
                  />
                </div>

                {selected.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selected.map((u) => (
                      <Badge key={u.id} variant="secondary" className="gap-1 py-1 pe-1">
                        <span className="max-w-40 truncate">{u.name}</span>
                        <button
                          type="button"
                          onClick={() => setSelected((prev) => prev.filter((s) => s.id !== u.id))}
                          className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-foreground/10"
                          aria-label={`${u.name} — ${tx('বাদ দিন', 'remove')}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="max-h-64 overflow-y-auto rounded-lg border bg-card [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
                  {loadingUsers ? (
                    <div className="space-y-2 p-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full rounded-lg" />
                      ))}
                    </div>
                  ) : results.length === 0 ? (
                    <EmptyState
                      icon={<Users className="h-6 w-6" />}
                      title={tx('কোনো ইউজার পাওয়া যায়নি', 'No users found')}
                    />
                  ) : (
                    <ul className="divide-y">
                      {results.map((u) => {
                        const active = isSelected(u)
                        return (
                          <li key={u.id}>
                            <label
                              htmlFor={`user-${u.id}`}
                              className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
                            >
                              <Checkbox
                                id={`user-${u.id}`}
                                checked={active}
                                onCheckedChange={() => toggleUser(u)}
                                aria-label={u.name}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                                  {u.name || '—'}
                                  {u.role === 'ADMIN' && (
                                    <Badge variant="outline" className="px-1 py-0 text-[10px]">
                                      {tx('অ্যাডমিন', 'Admin')}
                                    </Badge>
                                  )}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {u.email ?? u.phone ?? '—'}
                                </p>
                              </div>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {tx(
                    `সর্বোচ্চ ${digitsBn(MAX_RECIPIENTS)} জন নির্বাচন করা যাবে। নির্বাচিত: ${digitsBn(selected.length)}`,
                    `Up to ${MAX_RECIPIENTS} recipients. Selected: ${selected.length}`
                  )}
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={() => void handleSend()}
                disabled={sending}
                className="gap-2 sm:min-w-40"
                size="lg"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {tx('পাঠিয়ে দিন', 'Send now')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

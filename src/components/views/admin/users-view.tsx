'use client'

/**
 * AdminControlView — Admin → "অ্যাডমিন কন্ট্রোল" (formerly Users).
 *
 * THE staff management hub: only panel accounts (ADMIN / MANAGER /
 * MODERATOR) live here. The owner creates moderators/managers/admins with
 * their own user+pass (stored in the database), promotes/demotes, blocks,
 * resets passwords and removes staff. Nobody outside this panel can manage
 * the site — and staff accounts can ONLY be created here by the owner.
 *
 * Student accounts deliberately live in the "শিক্ষার্থী" (Students) section.
 */
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  BadgeCheck,
  Ban,
  GraduationCap,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Search,
  ShieldCheck,
  ShieldX,
  Trash2,
  UserCog,
  UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { apiDelete, apiGet, apiPost, apiSend } from '@/lib/api-client'
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
import { isOwner } from '@/lib/roles'

interface AdminUser {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  role: 'STUDENT' | 'ADMIN' | 'MANAGER' | 'MODERATOR'
  isVerified: boolean
  isBlocked: boolean
  createdAt: string
  _count?: { enrollments: number; orders: number }
}

type StaffRole = 'ADMIN' | 'MANAGER' | 'MODERATOR'

const STAFF_ROLES: StaffRole[] = ['MODERATOR', 'MANAGER', 'ADMIN']

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

function roleBadgeClass(role: string): string {
  if (role === 'ADMIN') {
    return 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
  }
  if (role === 'MANAGER') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
  }
  if (role === 'MODERATOR') {
    return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300'
  }
  return 'bg-secondary text-secondary-foreground'
}

function roleLabelText(role: string, tx: (bn: string, en: string) => string): string {
  if (role === 'ADMIN') return tx('অ্যাডমিন', 'Admin')
  if (role === 'MANAGER') return tx('ম্যানেজার', 'Manager')
  if (role === 'MODERATOR') return tx('মডারেটর', 'Moderator')
  return tx('শিক্ষার্থী', 'Student')
}

export default function AdminUsersView() {
  const { user, status, initialized } = useAuth()
  const { t, tx, lang } = useUI()

  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [chips, setChips] = useState<{
    admins: number
    managers: number
    moderators: number
    blocked: number
  } | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  // Staff creation (owner only)
  const [showStaff, setShowStaff] = useState(false)
  const [mgName, setMgName] = useState('')
  const [mgEmail, setMgEmail] = useState('')
  const [mgPass, setMgPass] = useState('')
  const [mgRole, setMgRole] = useState<StaffRole>('MODERATOR')
  const [mgBusy, setMgBusy] = useState(false)
  // Password reset (owner only)
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [resetPass, setResetPass] = useState('')
  const [resetBusy, setResetBusy] = useState(false)

  const bulk = useBulkSelection()
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [details, setDetails] = useState<AdminUser | null>(null)

  const load = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const url = q.trim()
        ? `/api/admin/users?staff=1&q=${encodeURIComponent(q.trim())}`
        : '/api/admin/users?staff=1'
      const data = await apiGet<AdminUser[]>(url)
      setUsers(data)
      setChips({
        admins: data.filter((u) => u.role === 'ADMIN').length,
        managers: data.filter((u) => u.role === 'MANAGER').length,
        moderators: data.filter((u) => u.role === 'MODERATOR').length,
        blocked: data.filter((u) => u.isBlocked).length,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('লোড করা যায়নি', 'Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => void load(search), search ? 400 : 0)
    return () => clearTimeout(timer)
  }, [search, load])

  async function patchUser(u: AdminUser, body: Record<string, unknown>, successMsg: string) {
    setBusyId(u.id)
    try {
      await apiSend(`/api/admin/users/${u.id}`, 'PATCH', body)
      toast.success(successMsg)
      void load(search)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('আপডেট ব্যর্থ', 'Update failed'))
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    try {
      await apiDelete(`/api/admin/users/${deleteTarget.id}`)
      toast.success(tx('অ্যাকাউন্ট মুছে ফেলা হয়েছে', 'Account deleted'))
      setDeleteTarget(null)
      void load(search)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setBusyId(null)
    }
  }

  async function bulkDelete() {
    setBulkDeleting(true)
    try {
      const r = await apiSend<{ deleted: number }>('/api/admin/bulk-delete', 'POST', {
        resource: 'users',
        ids: bulk.selected,
      })
      toast.success(tx(`${r.deleted} টি অ্যাকাউন্ট মুছে ফেলা হয়েছে`, `${r.deleted} account(s) deleted`))
      bulk.clear()
      await load(search)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  async function handleCreateStaff() {
    if (mgName.trim().length < 2) {
      toast.error(tx('নাম দিন', 'Enter a name'))
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mgEmail.trim())) {
      toast.error(tx('সঠিক ইমেইল দিন', 'Enter a valid email'))
      return
    }
    if (mgPass.length < 8 || !/[A-Za-z]/.test(mgPass) || !/\d/.test(mgPass)) {
      toast.error(
        tx(
          'পাসওয়ার্ড কমপক্ষে ৮ অক্ষর — অক্ষর + সংখ্যা',
          'Password must be 8+ chars with a letter and a digit'
        )
      )
      return
    }
    setMgBusy(true)
    try {
      await apiPost('/api/admin/users', {
        name: mgName.trim(),
        email: mgEmail.trim(),
        password: mgPass,
        role: mgRole,
      })
      toast.success(
        tx(
          `${roleLabelText(mgRole, tx)} তৈরি হয়েছে — /admin থেকে লগইন করবে।`,
          `${roleLabelText(mgRole, tx)} created — they can log in via /admin.`
        )
      )
      setShowStaff(false)
      setMgName('')
      setMgEmail('')
      setMgPass('')
      setMgRole('MODERATOR')
      void load(search)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('তৈরি ব্যর্থ', 'Creation failed'))
    } finally {
      setMgBusy(false)
    }
  }

  async function handleResetPassword() {
    if (!resetTarget) return
    if (resetPass.length < 8 || !/[A-Za-z]/.test(resetPass) || !/\d/.test(resetPass)) {
      toast.error(
        tx(
          'পাসওয়ার্ড কমপক্ষে ৮ অক্ষর — অক্ষর + সংখ্যা',
          'Password must be 8+ chars with a letter and a digit'
        )
      )
      return
    }
    setResetBusy(true)
    try {
      await apiSend(`/api/admin/users/${resetTarget.id}`, 'PATCH', { password: resetPass })
      toast.success(tx('পাসওয়ার্ড রিসেট হয়েছে', 'Password has been reset'))
      setResetTarget(null)
      setResetPass('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('রিসেট ব্যর্থ', 'Reset failed'))
    } finally {
      setResetBusy(false)
    }
  }

  if (initialized && status !== 'loading' && (!user || !isOwner(user.role))) {
    return <AccessDenied />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">
            {tx('অ্যাডমিন কন্ট্রোল', 'Admin Control')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'স্টাফ ব্যবস্থাপনা — অ্যাডমিন, ম্যানেজার ও মডারেটর এখান থেকেই তৈরি হয়; এখানকার অ্যাকাউন্টই কেবল সাইট পরিচালনা করতে পারে। শিক্ষার্থীরা "শিক্ষার্থী" সেকশনে।',
              'Staff management — admins, managers and moderators are created here; only these accounts can run the site. Students live in the Students section.'
            )}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tx('নাম বা ইমেইল খুঁজুন...', 'Search name or email...')}
              className="pl-9"
            />
          </div>
          <Button className="gap-2" onClick={() => setShowStaff(true)}>
            <UserPlus className="h-4 w-4" />
            {tx('স্টাফ যোগ করুন', 'Add staff')}
          </Button>
        </div>
      </div>

      {/* Stats chips */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: ShieldCheck,
            label: tx('অ্যাডমিন', 'Admins'),
            value: chips ? digitsBn(chips.admins) : '—',
            tint: 'var(--chart-2)',
          },
          {
            icon: UserCog,
            label: tx('ম্যানেজার', 'Managers'),
            value: chips ? digitsBn(chips.managers) : '—',
            tint: 'var(--chart-5)',
          },
          {
            icon: GraduationCap,
            label: tx('মডারেটর', 'Moderators'),
            value: chips ? digitsBn(chips.moderators) : '—',
            tint: 'var(--chart-3)',
          },
          {
            icon: Ban,
            label: tx('ব্লকড', 'Blocked'),
            value: chips ? digitsBn(chips.blocked) : '—',
            tint: 'var(--chart-4)',
          },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: `color-mix(in oklab, ${c.tint} 14%, transparent)`,
                  color: c.tint,
                }}
              >
                <c.icon className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-lg font-bold leading-tight">{c.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          title={
            search
              ? tx('কিছু পাওয়া যায়নি', 'Nothing found')
              : tx('কোনো স্টাফ অ্যাকাউন্ট নেই', 'No staff accounts')
          }
          description={
            search
              ? tx('অন্য কীওয়ার্ড দিয়ে খুঁজে দেখুন।', 'Try a different keyword.')
              : tx(
                  '"স্টাফ যোগ করুন" দিয়ে মডারেটর/ম্যানেজার তৈরি করুন।',
                  'Use "Add staff" to create moderators/managers.'
                )
          }
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card>
            <CardContent className="p-0">
              <ScrollX>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <SelectAll
                        ids={users.map((u) => u.id)}
                        isSelected={bulk.isSelected}
                        onToggleAll={bulk.toggleAll}
                      />
                    </TableHead>
                    <TableHead className="min-w-[180px]">{tx('স্টাফ', 'Staff')}</TableHead>
                    <TableHead>{tx('যোগাযোগ', 'Contact')}</TableHead>
                    <TableHead>{tx('রোল', 'Role')}</TableHead>
                    <TableHead>{tx('ভেরিফাইড', 'Verified')}</TableHead>
                    <TableHead>{tx('ব্লকড', 'Blocked')}</TableHead>
                    <TableHead>{t('date')}</TableHead>
                    <TableHead className="text-right">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const isSelf = user?.id === u.id
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <RowBox id={u.id} isSelected={bulk.isSelected} onToggle={bulk.toggle} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                                {(u.name || '?').charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <span
                              className="cursor-pointer text-sm font-semibold hover:underline"
                              onClick={() => setDetails(u)}
                            >
                              {u.name || '—'}
                            </span>
                            {isSelf && (
                              <Badge variant="outline" className="text-[10px]">
                                {tx('আপনি', 'You')}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-xs text-muted-foreground">
                            {u.email && <span>{u.email}</span>}
                            {u.phone && <span>{u.phone}</span>}
                            {!u.email && !u.phone && <span>—</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={roleBadgeClass(u.role)}>
                            {roleLabelText(u.role, tx)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {u.isVerified ? (
                            <Badge className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              <BadgeCheck className="h-3 w-3" /> {tx('ভেরিফাইড', 'Verified')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              {tx('অভেরিফাইড', 'Unverified')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={u.isBlocked}
                            disabled={busyId === u.id || isSelf}
                            onCheckedChange={(v) =>
                              void patchUser(
                                u,
                                { isBlocked: v },
                                v
                                  ? tx('অ্যাকাউন্ট ব্লক করা হয়েছে', 'Account blocked')
                                  : tx('আনব্লক করা হয়েছে', 'Account unblocked')
                              )
                            }
                            aria-label={tx('ব্লকড', 'Blocked')}
                          />
                        </TableCell>
                        <TableCell>
                          <DateStamp iso={u.createdAt} label={tx('তৈরির তারিখ', 'Created at')} />
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={busyId === u.id}
                                aria-label={t('actions')}
                              >
                                {busyId === u.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel>{tx('রোল বদলান', 'Change role')}</DropdownMenuLabel>
                              {STAFF_ROLES.filter((r) => r !== u.role).map((r) => (
                                <DropdownMenuItem
                                  key={r}
                                  disabled={isSelf}
                                  onClick={() =>
                                    void patchUser(
                                      u,
                                      { role: r },
                                      tx(
                                        `রোল পরিবর্তন: ${roleLabelText(r, tx)}`,
                                        `Role changed: ${roleLabelText(r, tx)}`
                                      )
                                    )
                                  }
                                >
                                  <UserCog className="h-4 w-4" />
                                  {tx(
                                    `${roleLabelText(r, tx)} করুন`,
                                    `Make ${roleLabelText(r, tx)}`
                                  )}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              {!u.isVerified && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    void patchUser(
                                      u,
                                      { isVerified: true },
                                      tx('ভেরিফাই করা হয়েছে', 'Account verified')
                                    )
                                  }
                                >
                                  <BadgeCheck className="h-4 w-4" />
                                  {tx('ভেরিফাই করুন', 'Verify account')}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => {
                                  setResetPass('')
                                  setResetTarget(u)
                                }}
                              >
                                <KeyRound className="h-4 w-4" />
                                {tx('পাসওয়ার্ড রিসেট', 'Reset password')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                disabled={isSelf}
                                onClick={() => setDeleteTarget(u)}
                              >
                                <Trash2 className="h-4 w-4" />
                                {t('delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </ScrollX>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Staff details dialog (row click) ── */}
      <DetailsDialog
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        title={details?.name || '—'}
        subtitle={details?.email ?? undefined}
        fields={[
          { label: tx('নাম', 'Name'), value: details?.name || '—' },
          { label: tx('ইমেইল', 'Email'), value: details?.email || '—' },
          { label: tx('ফোন', 'Phone'), value: details?.phone || '—' },
          {
            label: tx('রোল', 'Role'),
            value: details ? roleLabelText(details.role, tx) : '—',
          },
          {
            label: tx('ভেরিফাইড', 'Verified'),
            value: details
              ? details.isVerified
                ? tx('ভেরিফাইড', 'Verified')
                : tx('অভেরিফাইড', 'Unverified')
              : '—',
          },
          {
            label: tx('ব্লকড', 'Blocked'),
            value: details ? (details.isBlocked ? tx('হ্যাঁ', 'Yes') : tx('না', 'No')) : '—',
          },
          {
            label: tx('যোগদানের তারিখ', 'Joined'),
            value: details
              ? new Date(details.createdAt).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB')
              : '—',
          },
        ]}
        actions={
          <Button
            variant="destructive"
            className="gap-2"
            disabled={!!details && user?.id === details.id}
            onClick={() => {
              const u = details
              setDetails(null)
              if (u) setDeleteTarget(u)
            }}
          >
            <Trash2 className="h-4 w-4" />
            {t('delete')}
          </Button>
        }
      />

      {/* ── Staff creation dialog ── */}
      <Dialog open={showStaff} onOpenChange={setShowStaff}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tx('স্টাফ অ্যাকাউন্ট যোগ করুন', 'Add a staff account')}</DialogTitle>
            <DialogDescription>
              {tx(
                'মডারেটর / ম্যানেজার / অ্যাডমিন — সাইট পরিচালনার জন্য ইউজার+পাসওয়ার্ড তৈরি করুন। সরাসরি ডেটাবেজে সংরক্ষিত হবে; /admin গেট দিয়ে লগইন করবে।',
                'Moderator / Manager / Admin — create a user+pass for site management. Stored directly in the database; they log in via the /admin gate.'
              )}
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mg-name">{t('name')}</Label>
              <Input id="mg-name" value={mgName} onChange={(e) => setMgName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mg-email">{t('email')}</Label>
              <Input id="mg-email" type="email" value={mgEmail} onChange={(e) => setMgEmail(e.target.value)} placeholder="staff@pathshala.com" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mg-pass">{tx('পাসওয়ার্ড', 'Password')}</Label>
              <Input id="mg-pass" type="password" value={mgPass} onChange={(e) => setMgPass(e.target.value)} placeholder={tx('কমপক্ষে ৮ অক্ষর — অক্ষর + সংখ্যা', '8+ chars — letter + digit')} />
            </div>
            <div className="grid gap-1.5">
              <Label>{tx('ভূমিকা', 'Role')}</Label>
              <Select value={mgRole} onValueChange={(v) => setMgRole(v as StaffRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MODERATOR">{tx('মডারেটর (মডারেশন)', 'Moderator (moderation)')}</SelectItem>
                  <SelectItem value="MANAGER">{tx('ম্যানেজার (কনটেন্ট+মডারেশন)', 'Manager (content + moderation)')}</SelectItem>
                  <SelectItem value="ADMIN">{tx('অ্যাডমিন (সম্পূর্ণ)', 'Admin (full)')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {mgRole === 'MODERATOR' &&
                  tx(
                    'মডারেটর অর্ডার/শিক্ষার্থী/মেসেজ/রিভিউ/ক্রয় দেখতে ও মডারেট করতে পারবে, কিন্তু কনটেন্ট (কোর্স/কুইজ/নোটিশ) তৈরি বা বদলাতে পারবে না।',
                    'Moderators can view & moderate orders/students/messages/reviews/purchases but cannot create or change content (courses/quizzes/notices).'
                  )}
                {mgRole === 'MANAGER' &&
                  tx(
                    'ম্যানেজার কনটেন্ট ও মডারেশন সব পারবে, কিন্তু ইউজার/সেটিংস/গেটওয়ে/কুপন পরিবর্তন করতে পারবে না।',
                    'Managers can manage content and moderation but cannot change users, settings, gateways or coupons.'
                  )}
                {mgRole === 'ADMIN' &&
                  tx(
                    'অ্যাডমিন সম্পূর্ণ নিয়ন্ত্রণ পাবে — স্টাফ তৈরি, সেটিংস, গেটওয়ে সহ সবকিছু।',
                    'Admins get full control — staff creation, settings, gateways and everything else.'
                  )}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStaff(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void handleCreateStaff()} disabled={mgBusy} className="gap-2">
              {mgBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {tx('তৈরি করুন', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Password reset dialog ── */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(o) => {
          if (!o) setResetTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tx('পাসওয়ার্ড রিসেট', 'Reset password')}</DialogTitle>
            <DialogDescription>
              {tx(
                `"${resetTarget?.name ?? ''}"-এর নতুন পাসওয়ার্ড দিন — পুরনো ডিভাইসগুলো স্বয়ংক্রিয়ভাবে লগ-আউট হয়ে যাবে।`,
                `Set a new password for "${resetTarget?.name ?? ''}" — their older devices will be logged out automatically.`
              )}
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <div className="grid gap-1.5">
            <Label htmlFor="reset-pass">{tx('নতুন পাসওয়ার্ড', 'New password')}</Label>
            <Input
              id="reset-pass"
              type="password"
              value={resetPass}
              onChange={(e) => setResetPass(e.target.value)}
              placeholder={tx('কমপক্ষে ৮ অক্ষর — অক্ষর + সংখ্যা', '8+ chars — letter + digit')}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void handleResetPassword()} disabled={resetBusy} className="gap-2">
              {resetBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {tx('রিসেট করুন', 'Reset')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('অ্যাকাউন্ট মুছে ফেলবেন?', 'Delete this account?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                `"${deleteTarget?.name ?? ''}" (${roleLabelText(deleteTarget?.role ?? '', tx)})-এর অ্যাকাউন্ট স্থায়ীভাবে মুছে যাবে এবং সে আর প্যানেলে ঢুকতে পারবে না।`,
                `"${deleteTarget?.name ?? ''}" (${roleLabelText(deleteTarget?.role ?? '', tx)}) will be permanently deleted and can no longer access the panel.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              {t('delete')}
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

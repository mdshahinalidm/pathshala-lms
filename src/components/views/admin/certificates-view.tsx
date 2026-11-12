'use client'

/**
 * AdminCertificatesView — read-only registry of every certificate issued by
 * the platform (auto-issued at 100% course completion). Search by student or
 * serial, stat chips for totals. API: GET /api/certificates?scope=all
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Award,
  CalendarDays,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import {
  BulkBar,
  DetailsDialog,
  RowBox,
  ScrollX,
  SelectAll,
  useBulkSelection,
  type DetailField,
} from '@/components/admin/data-tools'
import { apiGet, apiSend } from '@/lib/api-client'
import { digitsBn, fmtStampText } from '@/lib/format'
import { DateStamp } from '@/components/admin/date-stamp'
import { useAuth } from '@/store/auth-store'
import { go, useUI } from '@/store/ui-store'
import { isPanelRole } from '@/lib/roles'

interface AdminCertificateRow {
  id: string
  serial: string
  studentName: string
  courseTitle: string
  issuedAt: string
  course: { id: string; title: string; slug: string } | null
  user?: { id: string; name: string; email: string | null } | null
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

export default function AdminCertificatesView() {
  const { user, status, initialized } = useAuth()
  const { tx, lang } = useUI()

  const [certs, setCerts] = useState<AdminCertificateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [copiedSerial, setCopiedSerial] = useState<string | null>(null)
  const bulk = useBulkSelection()
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [details, setDetails] = useState<AdminCertificateRow | null>(null)

  const num = (n: number | string) => (lang === 'bn' ? digitsBn(n) : String(n))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<AdminCertificateRow[]>('/api/certificates?scope=all')
      setCerts(data)
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

  const q = searchInput.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return certs
    return certs.filter(
      (c) =>
        c.studentName.toLowerCase().includes(q) ||
        c.serial.toLowerCase().includes(q) ||
        c.courseTitle.toLowerCase().includes(q)
    )
  }, [certs, q])

  const stats = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const thisMonth = certs.filter((c) => new Date(c.issuedAt).getTime() >= monthStart).length
    return { total: certs.length, thisMonth }
  }, [certs])

  function copySerial(serial: string) {
    navigator.clipboard
      .writeText(serial)
      .then(() => {
        setCopiedSerial(serial)
        setTimeout(() => setCopiedSerial((cur) => (cur === serial ? null : cur)), 1500)
        toast.success(tx('সিরিয়াল কপি হয়েছে', 'Serial copied'))
      })
      .catch(() => toast.error(tx('কপি করা যায়নি', 'Copy failed')))
  }

  async function bulkDelete() {
    setBulkDeleting(true)
    try {
      const res = await apiSend<{ deleted: number }>('/api/admin/bulk-delete', 'POST', {
        resource: 'certificates',
        ids: bulk.selected,
      })
      toast.success(
        tx(
          `${num(res.deleted)} টি সার্টিফিকেট মুছে ফেলা হয়েছে`,
          `${res.deleted} certificate(s) deleted`
        )
      )
      bulk.clear()
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tx('মুছে ফেলা যায়নি', 'Delete failed'))
    } finally {
      setBulkDeleting(false)
    }
  }

  if (initialized && status !== 'loading' && (!user || !isPanelRole(user.role))) {
    return <AccessDenied />
  }

  const detailsFields: DetailField[] = details
    ? [
        { label: tx('সিরিয়াল', 'Serial'), value: details.serial },
        { label: tx('শিক্ষার্থী', 'Student'), value: details.studentName },
        { label: tx('কোর্স', 'Course'), value: details.courseTitle },
        {
          label: tx('ইস্যুর তারিখ', 'Issued'),
          value: fmtStampText(details.issuedAt),
        },
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{tx('সার্টিফিকেট রেজিস্টার', 'Certificate Registry')}</h1>
          <p className="text-sm text-muted-foreground">
            {tx(
              'কোর্স ১০০% সম্পন্ন করলেই স্বয়ংক্রিয়ভাবে সার্টিফিকেট ইস্যু হয়',
              'Certificates are auto-issued at 100% course completion'
            )}
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {tx('রিফ্রেশ', 'Refresh')}
        </Button>
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium">
          <Award className="h-3.5 w-3.5 text-primary" />
          {tx(`মোট ইস্যু: ${num(stats.total)}`, `Total issued: ${num(stats.total)}`)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium">
          <CalendarDays className="h-3.5 w-3.5 text-primary" />
          {tx(`এই মাসে: ${num(stats.thisMonth)}`, `This month: ${num(stats.thisMonth)}`)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          {tx('প্রতিটি সিরিয়াল /verify/<serial> এ যাচাইযোগ্য', 'Every serial verifiable at /verify/<serial>')}
        </span>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={tx('শিক্ষার্থী / সিরিয়াল দিয়ে খুঁজুন…', 'Search by student / serial…')}
          className="pl-9"
          aria-label={tx('সার্টিফিকেট সার্চ', 'Search certificates')}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Award className="h-7 w-7" />}
          title={q ? tx('কোনো সার্টিফিকেট মেলেনি', 'No certificates match') : tx('কোনো সার্টিফিকেট নেই', 'No certificates yet')}
          description={
            q
              ? tx('অন্য নাম বা সিরিয়াল দিয়ে খুঁজে দেখুন।', 'Try another name or serial.')
              : tx(
                  'শিক্ষার্থীরা কোর্স ১০০% শেষ করলে এখানে দেখা যাবে।',
                  'They will appear here once students complete courses.'
                )
          }
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden rounded-2xl border bg-card"
        >
          <ScrollX>
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <SelectAll
                      ids={filtered.map((c) => c.id)}
                      isSelected={bulk.isSelected}
                      onToggleAll={bulk.toggleAll}
                    />
                  </TableHead>
                  <TableHead>{tx('শিক্ষার্থী', 'Student')}</TableHead>
                  <TableHead>{tx('কোর্স', 'Course')}</TableHead>
                  <TableHead>{tx('সিরিয়াল', 'Serial')}</TableHead>
                  <TableHead>{tx('ইস্যুর তারিখ', 'Issued')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetails(c)}>
                    <TableCell>
                      <RowBox id={c.id} isSelected={bulk.isSelected} onToggle={bulk.toggle} />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{c.studentName}</p>
                      {c.user?.email && (
                        <p className="text-xs text-muted-foreground">{c.user.email}</p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <p className="truncate">{c.courseTitle}</p>
                    </TableCell>
                    <TableCell>
                      <div
                        className="flex cursor-pointer items-center gap-1.5"
                        onClick={() => setDetails(c)}
                      >
                        <code className="rounded bg-muted px-2 py-1 text-xs font-bold tracking-wide">
                          {c.serial}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation()
                            copySerial(c.serial)
                          }}
                          aria-label={tx(`সিরিয়াল ${c.serial} কপি করুন`, `Copy serial ${c.serial}`)}
                        >
                          {copiedSerial === c.serial ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell><DateStamp iso={c.issuedAt} label={tx('ইস্যুর তারিখ', 'Issued')} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollX>
        </motion.div>
      )}

      {/* ── Certificate details dialog ── */}
      <DetailsDialog
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        title={details?.serial ?? ''}
        subtitle={tx('সার্টিফিকেট বিবরণ', 'Certificate details')}
        fields={detailsFields}
      />

      {/* ── Bulk selection bar ── */}
      <BulkBar
        count={bulk.count}
        deleting={bulkDeleting}
        onDelete={() => void bulkDelete()}
        onClear={bulk.clear}
      />
    </div>
  )
}

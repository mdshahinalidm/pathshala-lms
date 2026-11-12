'use client'

/**
 * AdminShell — full-height sidebar rail (wide 300px layout, classic deep
 * gradient style with per-group color tones).
 * Groups: Overview / Catalog / Communication / Users & Payments / Site Management.
 * Live badges (pending orders, unread messages) via GET /api/admin/badges (60s poll).
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import {
  Award,
  BarChart3,
  BookOpen,
  ClipboardList,
  FileCheck2,
  FileText,
  Globe,
  GraduationCap,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquareQuote,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  SearchCheck,
  Send,
  Settings,
  Shapes,
  ShieldCheck,
  Star,
  Sun,
  Tags,
  Ticket,
  Users,
  Video,
  Wallet,
  FileImage,
  PenLine,
  type LucideIcon,
  UsersRound,
  ShoppingBag,
  UserCheck,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { apiGet } from '@/lib/api-client'
import { digitsBn } from '@/lib/format'
import { useHashRoute } from '@/hooks/use-hash-route'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'

type BadgeKey = 'pendingOrders' | 'unreadMessages' | 'pendingPurchases'

/** Rotating gradient tone per nav group (classic colorful sidebar style). */
const GROUP_TONES = ['grad-emerald', 'grad-violet', 'grad-amber', 'grad-rose', 'grad-cyan']

/**
 * Header quick actions (dashboard top strip) — one-click jump into the
 * most-used create flows. Rendered immediately beside the "Admin Control
 * Panel" badge on the left end of the header bar, on lg+ screens; hidden
 * on smaller viewports (sidebar still has them).
 */
const HEADER_QUICK_ACTIONS = [
  { hash: '/admin/courses?new=1', bn: 'নতুন কোর্স', en: 'New course' },
  { hash: '/admin/quizzes?new=1', bn: 'নতুন কুইজ', en: 'New quiz' },
  { hash: '/admin/notices?new=1', bn: 'নোটিশ', en: 'Notice' },
  { hash: '/admin/broadcast?new=1', bn: 'ঘোষণা পাঠান', en: 'Send broadcast' },
] as const

interface NavItem {
  hash: string
  bn: string
  en: string
  icon: LucideIcon
  badge?: BadgeKey
  /** Hide from MANAGER (site manager) — OWNER-only surfaces. */
  ownerOnly?: boolean
  /** Minimum panel role — 'manager' hides the item from MODERATOR. */
  minRole?: 'MODERATOR' | 'MANAGER'
}

const ROLE_RANK: Record<string, number> = { MODERATOR: 1, MANAGER: 2, ADMIN: 3 }

function roleVisible(item: NavItem, role: string | undefined): boolean {
  if (item.ownerOnly) return role === 'ADMIN'
  if (item.minRole && item.minRole !== 'MODERATOR') {
    const rank = ROLE_RANK[role ?? ''] ?? 0
    if (rank < ROLE_RANK[item.minRole]) return false
  }
  return true
}

interface NavGroup {
  bn: string
  en: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    bn: 'ওভারভিউ',
    en: 'Overview',
    items: [
      { hash: '/admin/dashboard', bn: 'ড্যাশবোর্ড', en: 'Dashboard', icon: LayoutDashboard },
      // Orders sits directly below the Dashboard (top of the panel) per spec.
      { hash: '/admin/orders', bn: 'অর্ডার', en: 'Orders', icon: ReceiptText, badge: 'pendingOrders' },
      // Students sits directly below Orders per spec.
      { hash: '/admin/students', bn: 'শিক্ষার্থী', en: 'Students', icon: UsersRound },
      // Analytics — dedicated charts page, directly below Students.
      { hash: '/admin/analytics', bn: 'অ্যানালিটিক্স', en: 'Analytics', icon: BarChart3, minRole: 'MANAGER' },
    ],
  },
  {
    bn: 'কম্বো অফার',
    en: 'Combo Offer',
    items: [
      // Combo Offer — its own section directly ABOVE Courses:
      // every type of combo (course / exam / suggestion) is created here.
      { hash: '/admin/combos', bn: 'কম্বো অফার', en: 'Combo offers', icon: Package, minRole: 'MANAGER' },
    ],
  },
  {
    bn: 'ক্যাটালগ',
    en: 'Catalog',
    items: [
      { hash: '/admin/courses', bn: 'কোর্স', en: 'Courses', icon: BookOpen, minRole: 'MANAGER' },
      { hash: '/admin/instructors', bn: 'ইন্সট্রাক্টর', en: 'Instructors', icon: UserCheck, minRole: 'MANAGER' },
      { hash: '/admin/categories', bn: 'ক্যাটাগরি', en: 'Categories', icon: Tags, minRole: 'MANAGER' },
      { hash: '/admin/subjects', bn: 'সাবজেক্ট', en: 'Subjects', icon: Shapes, minRole: 'MANAGER' },
      { hash: '/admin/media', bn: 'মিডিয়া লাইব্রেরি', en: 'Media Library', icon: FileImage, minRole: 'MANAGER' },
      { hash: '/admin/quizzes', bn: 'কুইজ', en: 'Quizzes', icon: ClipboardList, minRole: 'MANAGER' },
      // MCQ/live exam manager — "এক্সাম (MCQ)" to distinguish from written exams
      { hash: '/admin/exams', bn: 'এক্সাম (MCQ)', en: 'Exams (MCQ)', icon: FileCheck2, minRole: 'MANAGER' },
      // WRITTEN/THEORY exams — create/manage (no MCQ, answer-sheet based)
      { hash: '/admin/written-exams', bn: 'লিখিত পরীক্ষা', en: 'Written Exams', icon: PenLine, minRole: 'MANAGER' },
      // Result Center — review submissions, annotate, mark, publish
      { hash: '/admin/exam-results', bn: 'রেজাল্ট সেন্টার', en: 'Result Center', icon: Award, minRole: 'MANAGER' },
      { hash: '/admin/live', bn: 'লাইভ ক্লাস', en: 'Live Classes', icon: Video, minRole: 'MANAGER' },
    ],
  },
  {
    bn: 'সাজেশনস',
    en: 'Suggestions',
    items: [
      // সাজেশনস সেকশন — সাজেশন / ক্যাটাগরি / পারচেজ (সাব-সেকশন স্ট্রাকচার)
      { hash: '/admin/suggestions', bn: 'সাজেশন', en: 'Suggestion', icon: FileText, minRole: 'MANAGER' },
      { hash: '/admin/suggestion-categories', bn: 'ক্যাটাগরি', en: 'Categories', icon: Tags, minRole: 'MANAGER' },
      { hash: '/admin/purchases', bn: 'পারচেজ', en: 'Purchase', icon: ShoppingBag, badge: 'pendingPurchases' },
    ],
  },
  {
    bn: 'কমিউনিকেশন',
    en: 'Communication',
    items: [
      { hash: '/admin/notices', bn: 'নোটিশ', en: 'Notices', icon: Megaphone, minRole: 'MANAGER' },
      { hash: '/admin/broadcast', bn: 'ব্রডকাস্ট', en: 'Broadcast', icon: Send, minRole: 'MANAGER' },
      { hash: '/admin/messages', bn: 'মেসেজ', en: 'Messages', icon: Inbox, badge: 'unreadMessages' },
    ],
  },
  {
    bn: 'ইউজার ও পেমেন্ট',
    en: 'Users & Payments',
    items: [
      { hash: '/admin/users', bn: 'অ্যাডমিন কন্ট্রোল', en: 'Admin Control', icon: Users, ownerOnly: true },
      { hash: '/admin/coupons', bn: 'কুপন', en: 'Coupons', icon: Ticket, ownerOnly: true },
      { hash: '/admin/payment-gateways', bn: 'পেমেন্ট গেটওয়ে', en: 'Payment Gateways', icon: Wallet, ownerOnly: true },
    ],
  },
  {
    bn: 'সাইট ম্যানেজমেন্ট',
    en: 'Site Management',
    items: [
      { hash: '/admin/reviews', bn: 'রিভিউ', en: 'Reviews', icon: Star },
      // Home-page curated testimonials — dedicated manager page.
      { hash: '/admin/testimonials', bn: 'টেস্টিমোনিয়াল', en: 'Testimonials', icon: MessageSquareQuote, minRole: 'MANAGER' },
      { hash: '/admin/settings', bn: 'সেটিংস', en: 'Settings', icon: Settings, ownerOnly: true },
    ],
  },
  {
    // SEO Center — live site-wide SEO analytics (Overview / On-Page /
    // Technical / Sitemap & Robots as in-module sub-tabs).
    bn: 'SEO সেন্টার',
    en: 'SEO Center',
    items: [
      { hash: '/admin/seo-center', bn: 'SEO সেন্টার', en: 'SEO Center', icon: SearchCheck },
    ],
  },
]

interface AdminBadges {
  pendingOrders: number
  unreadMessages: number
  pendingPurchases: number
}

function badgeCount(badges: AdminBadges | null, key: BadgeKey): number {
  if (!badges) return 0
  const v = badges[key]
  return typeof v === 'number' && v > 0 ? v : 0
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { lang, t, tx, toggleLang } = useUI()
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const route = useHashRoute()
  const [open, setOpen] = useState(false)
  // mount-gate the mobile Sheet so SSR HTML matches the first client
  // render (prevents extension-induced aria-controls hydration mismatches).
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration UI gate (matches SSR HTML)
    setMounted(true)
  }, [])
  const [badges, setBadges] = useState<AdminBadges | null>(null)
  // Collapsible sidebar — DEFAULT OPEN, toggle persists across reloads.
  const [sidebarOpen, setSidebarOpen] = useState(true)
  useEffect(() => {
    const saved = window.localStorage.getItem('ps-admin-sidebar')
    if (saved === 'closed') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore persisted UI pref after hydration
      setSidebarOpen(false)
    }
  }, [])
  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      window.localStorage.setItem('ps-admin-sidebar', prev ? 'closed' : 'open')
      return !prev
    })
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await apiGet<AdminBadges>('/api/admin/badges')
        if (!cancelled) setBadges(data)
      } catch {
        if (!cancelled) setBadges(null)
      }
    }
    void load()
    const timer = setInterval(() => {
      void load()
    }, 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  function isActive(target: string): boolean {
    if (route.path === target) return true
    return route.path.startsWith(`${target}/`)
  }

  const SidebarContent = (
    <div className="flex h-full flex-col text-white">
      <Link href="/" prefetch className="flex items-center gap-2 px-2 py-1">
        <span className="grad-brand flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md shadow-black/30">
          <GraduationCap className="h-5 w-5" />
        </span>
        <span className="flex flex-col leading-none">
          <span className="text-lg font-bold">{t('brand')}</span>
          <span className="text-[10px] text-white/60">{t('nav_admin')}</span>
        </span>
      </Link>

      <nav
        className="mt-4 flex flex-1 flex-col gap-4 overflow-y-auto pb-2"
        aria-label="Admin navigation"
      >
        {NAV_GROUPS.map((group, gi) => {
          const visibleItems = group.items.filter((item) => roleVisible(item, user?.role))
          if (visibleItems.length === 0) return null
          return (
          <div key={group.en} className="space-y-1">
            <p
              className={`flex items-center gap-2 px-3 text-[10px] font-semibold tracking-wider text-white/45 uppercase ${
                gi === 0 ? '' : 'pt-1'
              }`}
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${GROUP_TONES[gi % GROUP_TONES.length]}`} />
              {lang === 'bn' ? group.bn : group.en}
            </p>
            {visibleItems.map((item) => {
              const target = item.hash
              const active = isActive(target)
              const count = item.badge ? badgeCount(badges, item.badge) : 0
              return (
                <Link
                  key={item.hash}
                  href={item.hash}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all ${
                    active
                      ? `${GROUP_TONES[gi % GROUP_TONES.length]} font-semibold text-white shadow-md`
                      : 'font-medium text-white/75 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full bg-white/90"
                    />
                  )}
                  <item.icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{lang === 'bn' ? item.bn : item.en}</span>
                  {count > 0 && (
                    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400/25 px-1.5 py-0.5 text-[10px] leading-none font-bold text-amber-200">
                      {digitsBn(count)}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
          )
        })}
      </nav>

      <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-3">
        <Link
          href="/"
          prefetch
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"
        >
          <Home className="h-[18px] w-[18px]" /> {t('nav_home')}
        </Link>
        <button
          onClick={() => logout()}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-300 hover:bg-rose-500/15"
        >
          <LogOut className="h-[18px] w-[18px]" /> {t('logout')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Full-height sidebar rail (desktop) — edge-to-edge fixed left, wide
          300px layout with the classic deep-gradient style + rainbow top bar. */}
      {sidebarOpen && (
        <aside
          className="sidebar-deep fixed inset-y-0 left-0 z-40 hidden w-[300px] flex-col overflow-hidden p-4 shadow-xl shadow-black/20 lg:flex"
          aria-label="Admin sidebar"
        >
          <div aria-hidden className="rainbow-bar absolute inset-x-0 top-0 h-1" />
          {SidebarContent}
        </aside>
      )}

      <div className={`flex min-h-screen flex-col ${sidebarOpen ? 'lg:ml-[300px]' : ''}`}>
      <header className="sticky top-0 z-40">
        <div aria-hidden className="rainbow-bar h-1 w-full" />
        <div className="border-b bg-background/85 backdrop-blur-lg">
        <div className="flex h-14 items-center gap-3 px-3.5">
          {!mounted ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 lg:hidden"
              aria-label="Menu"
              onClick={() => setOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          ) : (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="sidebar-deep w-72 overflow-y-auto p-4">
              <SheetTitle className="sr-only">{t('nav_admin')}</SheetTitle>
              {SidebarContent}
            </SheetContent>
          </Sheet>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="hidden h-9 w-9 rounded-full lg:inline-flex"
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            title={sidebarOpen ? 'সাইডবার লুকান' : 'সাইডবার দেখান'}
          >
            {sidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
          </Button>
          <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
            <span className="grad-brand inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-white shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5" />
              {tx('অ্যাডমিন কন্ট্রোল প্যানেল', 'Admin Control Panel')}
            </span>
            {/* Quick actions sit right beside the panel badge — one row:
                [Admin Control Panel] [+ New course] [+ New quiz] [+ Notice]
                [+ Send broadcast] (per spec). Hidden on smaller viewports
                (the sidebar still has them). */}
            <div className="hidden items-center gap-1 lg:flex">
              {HEADER_QUICK_ACTIONS.map((qa) => (
                <Link
                  key={qa.hash}
                  href={qa.hash}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {tx(qa.bn, qa.en)}
                </Link>
              ))}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden text-sm font-medium sm:block">{user?.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLang}
              className="h-9 gap-1.5 rounded-full px-2.5 font-semibold"
            >
              <Globe className="h-4 w-4" /> {lang === 'bn' ? 'EN' : 'বাং'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="h-9 w-9 rounded-full"
              aria-label="Toggle theme"
            >
              <Sun className="h-4 w-4 dark:hidden" />
              <Moon className="hidden h-4 w-4 dark:block" />
            </Button>
          </div>
        </div>
        </div>
      </header>

        <div className="mx-auto w-full max-w-[1600px] flex-1 px-3.5 py-6">
          <main className="pb-8">{children}</main>
        </div>

      <footer className="mt-auto">
        <div aria-hidden className="rainbow-bar h-1 w-full" />
        <div className="border-t bg-background">
          <div className="mx-auto max-w-[1440px] px-3.5 py-3 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} {t('brand')} {t('nav_admin')} ·{' '}
            {tx('সকল সিস্টেম স্বাভাবিক', 'All systems operational')}
          </div>
        </div>
      </footer>
      </div>
    </div>
  )
}

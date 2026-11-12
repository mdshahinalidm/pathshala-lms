'use client'

/**
 * DashboardShell — student dashboard chrome.
 * Uses the SAME SiteHeader + SiteFooter as the rest of the site (per spec:
 * header top + footer bottom on every page except /admin), plus the
 * dashboard's own sidebar navigation with a mobile drawer.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { GraduationCap, BookOpen, ClipboardList, Bell, User, Home,
  Menu, LogOut, ShieldCheck, Video, FileText, Megaphone, PenLine, Award } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { useUI } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { useHashRoute } from '@/hooks/use-hash-route'
import { SiteHeader } from './site-header'
import { SiteFooter } from './site-footer'
import { BackToTop } from './back-to-top'
import { isPanelRole } from '@/lib/roles'

const ITEMS = [
  { hash: '/dashboard', key: 'my_courses', icon: BookOpen, tone: 'grad-emerald' },
  { hash: '/dashboard/exams', key: 'exams', icon: ClipboardList, tone: 'grad-violet' },
  // WRITTEN exams (purchase → server timer → answer-sheet photos)
  { hash: '/dashboard/written-exams', key: 'written_exams', icon: PenLine, tone: 'grad-amber' },
  { hash: '/dashboard/exam-results', key: 'exam_results', icon: Award, tone: 'grad-emerald' },
  { hash: '/dashboard/live', key: 'live', icon: Video, tone: 'grad-rose' },
  { hash: '/dashboard/suggestions', key: 'my_suggestions', icon: FileText, tone: 'grad-amber' },
  { hash: '/dashboard/notices', key: 'notice_board', icon: Megaphone, tone: 'grad-cyan' },
  { hash: '/dashboard/notifications', key: 'notifications', icon: Bell, tone: 'grad-cyan' },
  { hash: '/dashboard/profile', key: 'profile', icon: User, tone: 'grad-orange' },
]

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { t } = useUI()
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  // mount-gate the mobile Sheet so SSR HTML matches the first client
  // render (prevents extension-induced aria-controls hydration mismatches).
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration UI gate (matches SSR HTML)
    setMounted(true)
  }, [])
  const route = useHashRoute()
  const pathname = route.path

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <Link href="/" className="flex items-center gap-2 px-2 py-1">
        <span className="grad-brand flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md shadow-emerald-500/30">
          <GraduationCap className="h-5 w-5" />
        </span>
        <span className="grad-text-brand text-lg font-bold">{t('brand')}</span>
      </Link>
      {/* Colorful account card */}
      <div className="grad-violet mt-4 rounded-2xl p-3 text-white shadow-md shadow-violet-500/25">
        <div className="text-[11px] text-white/75">{t('my_account')}</div>
        <div className="truncate text-sm font-bold">{user?.name}</div>
        <div aria-hidden className="mt-2 h-1 w-full rounded-full bg-white/25">
          <span className="block h-1 w-2/3 rounded-full bg-white/90" />
        </div>
      </div>
      <nav className="mt-4 flex flex-col gap-1" aria-label="Dashboard navigation">
        {ITEMS.map((item) => {
          const active = pathname === item.hash || pathname.startsWith(`${item.hash}/`)
          return (
            <Link
              key={item.hash}
              href={item.hash}
              prefetch
              onClick={() => setOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? `${item.tone} text-white shadow-md`
                  : 'text-foreground/75 hover:bg-sidebar-accent hover:text-foreground'
              }`}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {t(item.key)}
            </Link>
          )
        })}
        {isPanelRole(user?.role) && (
          <Link
            href="/admin/dashboard"
            prefetch
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/75 transition-colors hover:bg-sidebar-accent"
          >
            <ShieldCheck className="h-[18px] w-[18px]" />
            {t('nav_admin')}
          </Link>
        )}
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t pt-3">
        <Link href="/" prefetch className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/75 hover:bg-sidebar-accent">
          <Home className="h-[18px] w-[18px]" /> {t('nav_home')}
        </Link>
        <button
          onClick={() => logout()}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          <LogOut className="h-[18px] w-[18px]" /> {t('logout')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      {/* Site-wide header (same as public pages) */}
      <SiteHeader />

      {/* Mobile-only slim bar: opens the dashboard sidebar drawer
          (the site header's mobile menu opens site navigation) */}
      <div className="sticky top-[4.25rem] z-40 border-b bg-background/90 backdrop-blur-lg lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3.5 py-2">
          {!mounted ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-xl"
              aria-label={t('nav_dashboard')}
              onClick={() => setOpen(true)}
            >
              <Menu className="h-4 w-4" />
              <span className="grad-text-brand text-sm font-bold">{t('nav_dashboard')}</span>
            </Button>
          ) : (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2 rounded-xl" aria-label={t('nav_dashboard')}>
                <Menu className="h-4 w-4" />
                <span className="grad-text-brand text-sm font-bold">{t('nav_dashboard')}</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 overflow-y-auto p-4">
              <SheetTitle className="sr-only">{t('nav_dashboard')}</SheetTitle>
              {SidebarContent}
            </SheetContent>
          </Sheet>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-3.5 py-6">
        {/* Desktop sidebar */}
        <aside className="sticky top-[5rem] hidden h-[calc(100vh-6.5rem)] w-60 shrink-0 overflow-y-auto rounded-2xl border bg-sidebar p-4 text-sidebar-foreground lg:block">
          {SidebarContent}
        </aside>
        <main className="min-w-0 flex-1 pb-8">{children}</main>
      </div>

      {/* Site-wide footer (same as public pages) */}
      <SiteFooter />
      <BackToTop />
    </div>
  )
}

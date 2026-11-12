'use client'

/**
 * SiteHeader — the ONE site-wide header used everywhere EXCEPT /admin.
 * (Public pages, student dashboard, login/register, tools — all share it,
 * so students always see site navigation + account menu + theme/lang toggles.)
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { GraduationCap, Search, Menu, Globe, LogOut, LayoutDashboard, ShieldCheck, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useUI, go } from '@/store/ui-store'
import { useAuth } from '@/store/auth-store'
import { isPanelRole } from '@/lib/roles'
import { usePublicSettings } from '@/hooks/use-public-settings'
import { parseHeaderMenu, DEFAULT_HEADER_MENU, type NavItemConfig } from '@/lib/nav-config'

function NavLinks({
  items,
  onNavigate,
}: {
  items: { href: string; label: string }[]
  onNavigate?: () => void
}) {
  return (
    <>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          prefetch
          onClick={onNavigate}
          // Menu text: black + bold (per spec) — hover keeps the accent tint.
          className="text-sm font-bold text-foreground transition-colors hover:text-primary hover:bg-accent px-3 py-2 rounded-lg"
        >
          {item.label}
        </Link>
      ))}
    </>
  )
}

export function SiteHeader() {
  const { t, lang, toggleLang } = useUI()
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const settings = usePublicSettings()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // admin-customized header menu (falls back to the built-in NAV
  // whose bilingual labels mirror the dictionary exactly — pixel-identical
  // rendering). The same items feed the desktop nav and the mobile sheet.
  const headerItems = useMemo(() => {
    const custom = parseHeaderMenu(settings.headerMenuConfig)
    const list: NavItemConfig[] = custom ?? DEFAULT_HEADER_MENU
    return list
      .filter((i) => i.enabled)
      .map((i) => ({ href: i.href, label: lang === 'bn' ? i.labelBn : i.labelEn }))
  }, [settings.headerMenuConfig, lang])
  // Radix dialogs render useId-based aria-controls in SSR HTML.
  // Browser extensions that mutate the DOM before hydration turn that into
  // a hydration attribute mismatch. Rendering the mobile Sheet only after
  // mount keeps server HTML and first client render identical.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration UI gate (matches SSR HTML)
    setMounted(true)
  }, [])

  // admin-uploaded header logo (falls back to the brand mark).
  const headerLogo = settings.headerLogoUrl.trim()
  const headerLogoPx = Math.min(200, Math.max(16, settings.headerLogoHeight || 40))

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault()
    go(`#/courses?q=${encodeURIComponent(search)}`)
  }

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Rainbow accent strip */}
      <div aria-hidden className="rainbow-bar h-1 w-full" />
      <div className="border-b bg-background/85 backdrop-blur-lg supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-3.5">
          {/* Logo */}
          <Link href="/" prefetch className="flex shrink-0 items-center gap-2" aria-label="PathShala home">
            {headerLogo ? (
              <img
                src={headerLogo}
                alt={t('brand')}
                className="w-auto max-w-[180px] object-contain"
                style={{ height: `${headerLogoPx}px` }}
              />
            ) : (
              <>
                <span className="grad-brand flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md shadow-emerald-500/30">
                  <GraduationCap className="h-5 w-5" />
                </span>
                <span className="hidden flex-col leading-none sm:flex">
                  <span className="grad-text-brand text-lg font-bold tracking-tight">{t('brand')}</span>
                  <span className="text-[10px] text-muted-foreground">{t('brandTag')}</span>
                </span>
              </>
            )}
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex lg:items-center lg:gap-0.5" aria-label="Main navigation">
            <NavLinks items={headerItems} />
          </nav>

          {/* Search */}
          <form onSubmit={doSearch} className="ml-auto hidden max-w-xs flex-1 md:block" role="search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('search_placeholder')}
                className="h-9 rounded-full bg-muted pl-9 text-sm"
                aria-label={t('search')}
              />
            </div>
          </form>

          {/* Right actions */}
          <div className="ml-auto flex items-center gap-1.5 md:ml-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLang}
              className="h-9 gap-1.5 rounded-full px-2.5 font-semibold"
              aria-label="Toggle language"
            >
              <Globe className="h-4 w-4" />
              {lang === 'bn' ? 'EN' : 'বাং'}
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

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="ml-1 rounded-full outline-none ring-primary focus-visible:ring-2" aria-label={t('my_account')}>
                    <Avatar className="h-9 w-9 border">
                      <AvatarFallback className="grad-violet text-sm font-semibold text-white">
                        {user.name
                          .trim()
                          .split(/\s+/)
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase() || 'PS'}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>
                    <div className="text-sm font-semibold">{user.name}</div>
                    <div className="truncate text-xs font-normal text-muted-foreground">
                      {user.email || user.phone}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => go('#/dashboard')}>
                    <LayoutDashboard className="mr-2 h-4 w-4" /> {t('nav_dashboard')}
                  </DropdownMenuItem>
                  {isPanelRole(user.role) && (
                    <DropdownMenuItem onClick={() => go('/admin/dashboard')}>
                      <ShieldCheck className="mr-2 h-4 w-4" /> {t('nav_admin')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => logout()} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" /> {t('logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Button variant="ghost" size="sm" className="h-9 rounded-full font-semibold" onClick={() => go('#/login')}>
                  {t('login')}
                </Button>
                <Button size="sm" className="h-9 rounded-full font-semibold" onClick={() => go('#/register')}>
                  {t('register')}
                </Button>
              </div>
            )}

            {/* Mobile menu (mounted post-hydration — see the note above) */}
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
              <SheetContent side="right" className="w-72 overflow-y-auto">
                <SheetTitle className="flex items-center gap-2">
                  {headerLogo ? (
                    <img
                      src={headerLogo}
                      alt={t('brand')}
                      className="w-auto max-w-[140px] object-contain"
                      style={{ height: `${Math.min(56, headerLogoPx)}px` }}
                    />
                  ) : (
                    <>
                      <span className="grad-brand flex h-8 w-8 items-center justify-center rounded-lg text-white">
                        <GraduationCap className="h-4 w-4" />
                      </span>
                      {t('brand')}
                    </>
                  )}
                </SheetTitle>
                <nav className="mt-4 flex flex-col gap-1" aria-label="Mobile navigation">
                  <NavLinks items={headerItems} onNavigate={() => setOpen(false)} />
                </nav>
                <div className="mt-4 border-t pt-4">
                  {user ? (
                    <div className="flex flex-col gap-2">
                      <Button variant="outline" className="justify-start" onClick={() => { go('#/dashboard'); setOpen(false) }}>
                        <LayoutDashboard className="mr-2 h-4 w-4" /> {t('nav_dashboard')}
                      </Button>
                      {isPanelRole(user.role) && (
                        <Button variant="outline" className="justify-start" onClick={() => { go('/admin/dashboard'); setOpen(false) }}>
                          <ShieldCheck className="mr-2 h-4 w-4" /> {t('nav_admin')}
                        </Button>
                      )}
                      <Button variant="destructive" className="justify-start" onClick={() => { logout(); setOpen(false) }}>
                        <LogOut className="mr-2 h-4 w-4" /> {t('logout')}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <Button onClick={() => { go('#/login'); setOpen(false) }}>{t('login')}</Button>
                      <Button variant="outline" onClick={() => { go('#/register'); setOpen(false) }}>{t('register')}</Button>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

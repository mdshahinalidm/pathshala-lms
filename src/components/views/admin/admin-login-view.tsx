'use client'

/**
 * AdminLoginView — THE dedicated /admin login screen.
 *
 * Split-panel design: left = brand/value panel, right = secure login form.
 * On successful ADMIN login the browser hard-navigates to ?next=… (or
 * /admin/dashboard) so every server component immediately sees the fresh
 * session cookie. Non-admin credentials are rejected with a clear message.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  Lock,
  LogIn,
  ShieldCheck,
  UserCog,
  Globe,
  BarChart3,
  BookOpen,
  ClipboardList,
  Megaphone,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUI } from '@/store/ui-store'
import { apiPost } from '@/lib/api-client'
import { isPanelRole } from '@/lib/roles'
import { usePublicSettings } from '@/hooks/use-public-settings'

const ADMIN_DEMO = {
  identifier: 'admin@pathshala.com',
  password: 'Admin@1234',
}

const PANEL_FEATURES = [
  { icon: BarChart3, bn: 'রিয়েল-টাইম সেলস ও অ্যানালিটিক্স', en: 'Real-time sales & analytics' },
  { icon: BookOpen, bn: 'কোর্স, অধ্যায় ও লেসন ম্যানেজার', en: 'Course, chapter & lesson manager' },
  { icon: ClipboardList, bn: 'কুইজ ও লাইভ এক্সাম ইঞ্জিন', en: 'Quiz & live exam engine' },
  { icon: Megaphone, bn: 'নোটিশ, সাজেশন ও ব্রডকাস্ট', en: 'Notices, suggestions & broadcast' },
  { icon: Users, bn: 'ইউজার ও পেমেন্ট অডিট', en: 'Users & payment audit' },
]

interface LoginResponse {
  user: {
    id: string
    name: string
    role: 'STUDENT' | 'ADMIN'
  }
}

/**
 * the login card uses the admin-uploaded login logo
 * (Settings → লোগো ও ব্র্যান্ডিং → লগইন পেজের লোগো) when set; empty URL falls
 * back to the built-in graduation-cap mark. Height comes from the saved
 * loginLogoHeight (default 48).
 */
function LoginLogo({ url, heightPx, fallbackClassName, imgClassName }: { url: string; heightPx: number; fallbackClassName: string; imgClassName?: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt="PathShala"
        style={{ height: `${heightPx}px` }}
        className={`w-auto max-w-[220px] object-contain ${imgClassName ?? ''}`}
      />
    )
  }
  return (
    <span className={`grad-brand flex items-center justify-center rounded-2xl text-white shadow-md shadow-emerald-500/30 ${fallbackClassName}`}>
      <GraduationCap className="h-6 w-6" />
    </span>
  )
}

export default function AdminLoginView() {
  const { lang, tx, toggleLang } = useUI()
  const settings = usePublicSettings()
  const searchParams = useSearchParams()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // ?next=… is set by the edge guard when an admin sub-route was requested.
  const [nextPath, setNextPath] = useState<string | null>(null)
  useEffect(() => {
    const n = searchParams.get('next')
    // Only allow same-origin relative paths (open-redirect protection).
    // Additionally, only honor real panel sub-paths: ?next=/admin/login is
    // a middleware artifact from the /admin/login alias — honoring it would
    // send the user back to the alias instead of the panel.
    if (
      n &&
      n.startsWith('/admin/') &&
      n !== '/admin/login' &&
      !n.startsWith('//')
    )
      setNextPath(n)
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setFormError('')

    if (!identifier.trim() || !password) {
      setFormError(tx('ইমেইল ও পাসওয়ার্ড দিন', 'Enter your email and password'))
      return
    }

    setSubmitting(true)
    try {
      const res = await apiPost<LoginResponse>('/api/auth/login', {
        identifier: identifier.trim(),
        password,
      })
      if (!isPanelRole(res.user.role)) {
        // The shared login endpoint set the session cookie — do NOT keep a
        // non-admin session alive after a rejected admin-panel attempt.
        try {
          await apiPost('/api/auth/logout')
        } catch {
          /* ignore */
        }
        setFormError(
          tx(
            'এই একাউন্টে অ্যাডমিন প্রবেশাধিকার নেই। অনুগ্রহ করে অ্যাডমিন একাউন্ট দিয়ে লগইন করুন।',
            'This account has no admin access. Please log in with an admin account.'
          )
        )
        return
      }
      // Hard navigation → server components pick up the fresh session cookie.
      window.location.replace(nextPath ?? '/admin/dashboard')
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : tx('লগইন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।', 'Login failed. Please try again.')
      )
    } finally {
      setSubmitting(false)
    }
  }

  const fillDemo = () => {
    setIdentifier(ADMIN_DEMO.identifier)
    setPassword(ADMIN_DEMO.password)
    setFormError('')
  }

  // admin-configurable login logo (empty → default mark).
  const loginLogo = settings.loginLogoUrl.trim()
  const loginLogoPx = Math.min(240, Math.max(16, settings.loginLogoHeight || 48))

  return (
    <div className="hero-mesh flex min-h-screen items-center justify-center px-3.5 py-8">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative grid w-full max-w-4xl overflow-hidden rounded-3xl border bg-card shadow-xl lg:grid-cols-[1.05fr_1fr]"
      >
        <div aria-hidden className="rainbow-bar absolute inset-x-0 top-0 z-10 h-1" />
        {/* ── LEFT: brand / value panel ── */}
        <div className="sidebar-deep relative hidden flex-col justify-between p-8 text-white lg:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                'radial-gradient(600px 300px at 20% 0%, rgba(16,185,129,0.35), transparent 60%), radial-gradient(500px 300px at 100% 100%, rgba(245,158,11,0.25), transparent 60%)',
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-3">
              <LoginLogo url={loginLogo} heightPx={loginLogoPx} fallbackClassName="h-11 w-11" />
              <div className="leading-tight">
                <p className="text-lg font-extrabold">{tx('পাঠশালা', 'PathShala')}</p>
                <p className="text-xs text-white/60">{tx('অ্যাডমিন কন্ট্রোল প্যানেল', 'Admin Control Panel')}</p>
              </div>
            </div>

            <h1 className="mt-10 text-2xl font-extrabold leading-snug">
              {tx('পুরো ওয়েবসাইট এক জায়গা থেকে ম্যানেজ করুন', 'Manage the entire website from one place')}
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/65">
              {tx(
                'কোর্স আপলোড, লেসন, কুইজ, এক্সাম, সাজেশন, নোটিশ, ইউজার ও পেমেন্ট — সবকিছুর পূর্ণ নিয়ন্ত্রণ।',
                'Courses, lessons, quizzes, exams, suggestions, notices, users & payments — full control.'
              )}
            </p>

            <ul className="mt-8 space-y-3.5">
              {PANEL_FEATURES.map((f) => (
                <li key={f.en} className="flex items-center gap-3 text-sm text-white/85">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10">
                    <f.icon className="h-4 w-4 text-emerald-300" />
                  </span>
                  {lang === 'bn' ? f.bn : f.en}
                </li>
              ))}
            </ul>
          </div>

          <p className="relative mt-8 inline-flex items-center gap-2 text-xs text-white/50">
            <ShieldCheck className="h-4 w-4" />
            {tx('JWT সুরক্ষিত সেশন · সকল অ্যাকশন অডিটেড', 'JWT-secured session · all actions audited')}
          </p>
        </div>

        {/* ── RIGHT: login form ── */}
        <div className="p-6 sm:p-10">
          <div className="mb-8 flex flex-col items-center gap-2 text-center lg:items-start lg:text-left">
            <LoginLogo url={loginLogo} heightPx={loginLogoPx} fallbackClassName="h-12 w-12 lg:hidden" imgClassName="lg:hidden" />
            <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
              <UserCog className="h-5 w-5 text-primary" />
              {tx('অ্যাডমিন লগইন', 'Admin Login')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {tx('অ্যাডমিন প্যানেলে প্রবেশ করতে লগইন করুন', 'Sign in to enter the admin panel')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="admin-identifier">
                {tx('ইমেইল বা ফোন', 'Email or phone')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="admin-identifier"
                type="text"
                autoComplete="username"
                placeholder="admin@pathshala.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="admin-password">
                {tx('পাসওয়ার্ড', 'Password')} <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? tx('পাসওয়ার্ড লুকান', 'Hide password') : tx('পাসওয়ার্ড দেখুন', 'Show password')}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {formError && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <Button type="submit" className="w-full gap-2" size="lg" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {submitting ? tx('প্রবেশ হচ্ছে...', 'Signing in...') : tx('প্যানেলে প্রবেশ করুন', 'Enter Panel')}
            </Button>
          </form>

          {/* Demo credentials (sandbox demo mode) */}
          <div className="mt-6 rounded-xl border border-dashed bg-muted/50 p-3.5 text-xs">
            <p className="mb-1.5 flex items-center gap-1.5 font-semibold">
              <Lock className="h-3.5 w-3.5 text-primary" />
              {tx('ডেমো লগইন তথ্য', 'Demo login credentials')}
            </p>
            <p className="text-muted-foreground">
              {tx('ইমেইল:', 'Email:')} <span className="font-mono font-semibold text-foreground">{ADMIN_DEMO.identifier}</span>
              <br />
              {tx('পাসওয়ার্ড:', 'Password:')}{' '}
              <span className="font-mono font-semibold text-foreground">{ADMIN_DEMO.password}</span>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2.5 h-7 gap-1.5 text-xs"
              onClick={fillDemo}
            >
              {tx('অটো-ফিল করুন', 'Auto-fill')}
            </Button>
          </div>

          <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
            <Link href="/" className="inline-flex items-center gap-1 hover:text-foreground">
              ← {tx('ওয়েবসাইটে ফিরুন', 'Back to website')}
            </Link>
            {/* C fix: this used to be a STATIC label — clicking did
                nothing. It is now a real toggle wired to useUI().toggleLang,
                so the whole login UI switches between বাংলা and English. */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleLang}
              className="h-8 gap-1.5 rounded-full px-2.5 text-xs font-semibold"
              aria-label="Toggle language"
            >
              <Globe className="h-3.5 w-3.5" />
              {lang === 'bn' ? 'বাংলা' : 'English'}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

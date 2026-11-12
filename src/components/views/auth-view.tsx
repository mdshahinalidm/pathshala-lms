'use client'

/**
 * AuthView — login / register with OTP verification flow.
 * Reads route.path (#/login | #/register) and ?next= for post-login redirect.
 * Demo: devOtp returned by API (no SMS gateway) is displayed in a dashed alert.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  GraduationCap,
  Eye,
  EyeOff,
  Loader2,
  KeyRound,
  LogIn,
  Smartphone,
  UserPlus,
  ShieldQuestion,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'
import { useUI, go } from '@/store/ui-store'
import { useAuth, type SessionUser } from '@/store/auth-store'
import { useHashRoute } from '@/hooks/use-hash-route'
import { usePublicSettings } from '@/hooks/use-public-settings'
import { apiPost } from '@/lib/api-client'
import { CLASS_OPTIONS, type ClassKey } from '@/lib/student-classes'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type AuthResponse = { user: SessionUser } | { needsOtp: true; identifier: string; devOtp?: string }

interface RegisterPayload {
  name: string
  email?: string
  phone?: string
  password: string
  studentClass?: ClassKey
}

/** Phone-OTP registration (passwordless) — step-1 payload. */
interface RegisterOtpPayload {
  name: string
  phone: string
  studentClass: ClassKey
  email?: string
}

const DEMO_ACCOUNTS = [
  { label: 'অ্যাডমিন (Admin)', identifier: 'admin@pathshala.com', password: 'Admin@1234' },
  { label: 'শিক্ষার্থী (Student)', identifier: 'rakib@pathshala.com', password: 'Student@123' },
]

export default function AuthView() {
  const { t, tx } = useUI()
  const route = useHashRoute()
  const { user, status, setUser } = useAuth()
  const settings = usePublicSettings()

  // admin-uploaded login page logo (falls back to the brand mark).
  const loginLogo = settings.loginLogoUrl.trim()
  const loginLogoPx = Math.min(240, Math.max(16, settings.loginLogoHeight || 48))

  const mode: 'login' | 'register' = route.path === '/register' ? 'register' : 'login'
  const nextParam = route.query.get('next')

  // ── Form state ──
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [studentClass, setStudentClass] = useState<ClassKey | ''>('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  // ── OTP step state ──
  const [otpStep, setOtpStep] = useState(false)
  const [otpFlow, setOtpFlow] = useState<'login' | 'register' | 'register-otp'>('login')
  const [otpIdentifier, setOtpIdentifier] = useState('')
  const [otpDevCode, setOtpDevCode] = useState('')
  const [otpCode, setOtpCode] = useState('')
  // Login sub-variant: classic password login OR passwordless OTP login
  const [loginVariant, setLoginVariant] = useState<'password' | 'otp'>('password')
  // Register sub-variant: classic form OR passwordless phone-OTP
  const [regVariant, setRegVariant] = useState<'form' | 'otp'>('form')
  const [regOtpName, setRegOtpName] = useState('')
  const [regOtpPhone, setRegOtpPhone] = useState('')
  const [regOtpEmail, setRegOtpEmail] = useState('')
  const [regOtpClass, setRegOtpClass] = useState<ClassKey | ''>('')
  const savedOtpLogin = useRef<string>('')
  const savedRegisterOtp = useRef<RegisterOtpPayload | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const autoSubmitRef = useRef(false)
  const savedRegister = useRef<RegisterPayload | null>(null)
  const savedLogin = useRef<{ identifier: string; password: string } | null>(null)

  // ── Forgot password flow (real-time OTP-verified reset) ──
  // 'request' → identifier form; 'reset' → OTP + new password form
  const [forgotStep, setForgotStep] = useState<'' | 'request' | 'reset'>('')
  const [forgotIdentifier, setForgotIdentifier] = useState('')
  const [forgotDevCode, setForgotDevCode] = useState('')
  const [forgotOtp, setForgotOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [forgotBusy, setForgotBusy] = useState(false)

  // admin toggles from Settings — show/hide the OTP options.
  const otpLoginOn = settings.otpLoginEnabled
  const otpRegisterOn = settings.otpRegisterEnabled

  const redirectAfterAuth = (u: SessionUser) => {
    // Only trust same-origin relative paths (blocks open redirects), and
    // never send a non-admin user to an /admin destination.
    const next =
      nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : null
    const nextIsAdminOnly = next?.startsWith('/admin') ?? false
    if (next && !(nextIsAdminOnly && u.role === 'STUDENT')) {
      go(next)
    } else {
      go(u.role === 'STUDENT' ? '/dashboard' : '/admin')
    }
  }

  // Already logged in → redirect away
  useEffect(() => {
    if (status === 'authenticated' && user) redirectAfterAuth(user)
  }, [user, status])

  const handleAuthResponse = async (res: AuthResponse, flow: 'login' | 'register' | 'register-otp') => {
    if ('needsOtp' in res && res.needsOtp) {
      setOtpFlow(flow)
      setOtpIdentifier(res.identifier)
      setOtpDevCode(res.devOtp ?? '')
      setOtpCode('')
      autoSubmitRef.current = false
      setOtpStep(true)
      toast.info(t('otp_sent'))
      return
    }
    if ('user' in res && res.user) {
      setUser(res.user)
      toast.success(
        tx(`স্বাগতম, ${res.user.name}!`, `Welcome, ${res.user.name}!`)
      )
      redirectAfterAuth(res.user)
    }
  }

  // ── Login submit ──
  const submitLogin = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setFormError('')
    if (!identifier.trim() || !password) {
      setFormError(tx('ইমেইল/ফোন ও পাসওয়ার্ড দিন', 'Enter your email/phone and password'))
      return
    }
    setBusy(true)
    try {
      const payload = { identifier: identifier.trim(), password }
      savedLogin.current = payload
      const res = await apiPost<AuthResponse>('/api/auth/login', payload)
      await handleAuthResponse(res, 'login')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('error'))
    } finally {
      setBusy(false)
    }
  }

  // ── Register submit ──
  const submitRegister = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setFormError('')
    if (name.trim().length < 2) {
      setFormError(tx('পুরো নাম লিখুন', 'Enter your full name'))
      return
    }
    if (!email.trim() && !phone.trim()) {
      setFormError(tx('ইমেইল অথবা ফোন নম্বর — যেকোনো একটি দিন', 'Provide an email or a phone number'))
      return
    }
    if (!studentClass) {
      setFormError(tx('আপনি কোন শ্রেণি/বর্ষে পড়ছেন তা নির্বাচন করুন', 'Select the class/year you are studying in'))
      return
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError(tx('সঠিক ইমেইল দিন', 'Enter a valid email'))
      return
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setFormError(
        tx(
          'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে — অন্তত একটি অক্ষর ও একটি সংখ্যা সহ।',
          'Password must be at least 8 characters with at least one letter and one digit.'
        )
      )
      return
    }
    setBusy(true)
    try {
      // Normalize BD mobile: +8801XXX… / 8801XXX… / 017 1234 5678 → 01XXXXXXXXX
      const rawPhone = phone.trim()
      const normPhone = rawPhone
        ? rawPhone.replace(/[\s-]/g, '').replace(/^\+?88/, '')
        : ''
      const payload: RegisterPayload = {
        name: name.trim(),
        password,
        studentClass,
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(normPhone ? { phone: normPhone } : {}),
      }
      savedRegister.current = payload
      const res = await apiPost<AuthResponse>('/api/auth/register', payload)
      await handleAuthResponse(res, 'register')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('error'))
    } finally {
      setBusy(false)
    }
  }

  // ── OTP verify (auto-submit at 6 digits) ──
  const verifyOtp = async (code: string) => {
    if (!code || code.length < 6 || verifying) return
    setVerifying(true)
    setFormError('')
    try {
      // phone-OTP registration verifies + CREATES the account on
      // its own endpoint; the classic flows only verify an existing account.
      const res =
        otpFlow === 'register-otp'
          ? await apiPost<{ user: SessionUser }>('/api/auth/register-otp', {
              phone: otpIdentifier,
              code,
            })
          : await apiPost<{ user: SessionUser }>('/api/auth/verify-otp', {
              identifier: otpIdentifier,
              code,
            })
      setUser(res.user)
      toast.success(tx('ভেরিফিকেশন সফল!', 'Verification successful!'))
      redirectAfterAuth(res.user)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('error'))
      setOtpCode('')
      autoSubmitRef.current = false
    } finally {
      setVerifying(false)
    }
  }

  useEffect(() => {
    if (otpStep && otpCode.length === 6 && !autoSubmitRef.current) {
      autoSubmitRef.current = true
      verifyOtp(otpCode)
    }
  }, [otpCode, otpStep])

  // ── Resend OTP ──
  const resendOtp = async () => {
    setResending(true)
    try {
      // Dedicated resend endpoint — re-POSTing /api/auth/register would hit
      // the 409 "already registered" clash (the row exists after step 1).
      type ResendRes = { needsOtp: boolean; identifier: string; devOtp?: string }
      if (otpFlow === 'register-otp' && savedRegisterOtp.current) {
        // Phone-OTP registration: step 1 again re-issues a fresh OTP.
        const res = await apiPost<ResendRes>('/api/auth/register-otp', savedRegisterOtp.current)
        setOtpIdentifier(res.identifier)
        setOtpDevCode(res.devOtp ?? '')
        setOtpCode('')
        autoSubmitRef.current = false
        toast.success(t('otp_sent'))
        return
      }
      if (otpFlow === 'register' && otpIdentifier) {
        const res = await apiPost<ResendRes>('/api/auth/resend-otp', {
          identifier: otpIdentifier,
          flow: 'register',
        })
        setOtpDevCode(res.devOtp ?? '')
        setOtpCode('')
        autoSubmitRef.current = false
        toast.success(t('otp_sent'))
        return
      }
      let res: AuthResponse
      if (otpFlow === 'login' && savedOtpLogin.current) {
        // OTP-login flow: re-request without a password.
        res = await apiPost<AuthResponse>('/api/auth/otp-login', { identifier: savedOtpLogin.current })
      } else if (savedLogin.current) {
        res = await apiPost<AuthResponse>('/api/auth/login', savedLogin.current)
      } else {
        toast.error(t('error'))
        return
      }
      if ('needsOtp' in res && res.needsOtp) {
        setOtpIdentifier(res.identifier)
        setOtpDevCode(res.devOtp ?? '')
        setOtpCode('')
        autoSubmitRef.current = false
        toast.success(t('otp_sent'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('error'))
    } finally {
      setResending(false)
    }
  }

  const switchMode = (m: string) => {
    if (m !== mode) {
      setFormError('')
      setLoginVariant('password')
      setRegVariant('form')
      go(m === 'register' ? '#/register' : '#/login')
    }
  }

  /** phone-OTP account creation (passwordless). Step 1: send the OTP. */
  const submitRegisterOtp = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setFormError('')
    if (regOtpName.trim().length < 2) {
      setFormError(tx('পুরো নাম লিখুন', 'Enter your full name'))
      return
    }
    if (!regOtpPhone.trim()) {
      setFormError(tx('মোবাইল নম্বর দিন', 'Enter your mobile number'))
      return
    }
    if (!regOtpClass) {
      setFormError(tx('আপনি কোন শ্রেণি/বর্ষে পড়ছেন তা নির্বাচন করুন', 'Select the class/year you are studying in'))
      return
    }
    if (regOtpEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regOtpEmail.trim())) {
      setFormError(tx('সঠিক ইমেইল দিন', 'Enter a valid email'))
      return
    }
    setBusy(true)
    try {
      // Normalize BD mobile: +8801XXX… / 8801XXX… / 017 1234 5678 → 01XXXXXXXXX
      const normPhone = regOtpPhone.trim().replace(/[\s-]/g, '').replace(/^\+?88/, '')
      const payload: RegisterOtpPayload = {
        name: regOtpName.trim(),
        phone: normPhone,
        studentClass: regOtpClass as ClassKey,
        ...(regOtpEmail.trim() ? { email: regOtpEmail.trim() } : {}),
      }
      savedRegisterOtp.current = payload
      const res = await apiPost<AuthResponse>('/api/auth/register-otp', payload)
      await handleAuthResponse(res, 'register-otp')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('error'))
    } finally {
      setBusy(false)
    }
  }

  /** Step 1 of passwordless login: request an OTP for an EXISTING account. */
  const requestOtpLogin = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setFormError('')
    if (!identifier.trim()) {
      setFormError(tx('ইমেইল অথবা ফোন নম্বর দিন', 'Enter your email or phone number'))
      return
    }
    setBusy(true)
    try {
      const res = await apiPost<AuthResponse>('/api/auth/otp-login', { identifier: identifier.trim() })
      savedOtpLogin.current = identifier.trim()
      await handleAuthResponse(res, 'login')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('error'))
    } finally {
      setBusy(false)
    }
  }

  // ── Forgot password: step 1 — send the verification OTP ──
  const submitForgotRequest = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setFormError('')
    if (!forgotIdentifier.trim()) {
      setFormError(tx('ইমেইল অথবা ফোন নম্বর দিন', 'Enter your email or phone number'))
      return
    }
    setForgotBusy(true)
    try {
      type ForgotRes = { needsOtp: boolean; identifier: string; delivered?: boolean; devOtp?: string }
      const res = await apiPost<ForgotRes>('/api/auth/forgot-password', {
        identifier: forgotIdentifier.trim(),
      })
      setForgotIdentifier(res.identifier ?? forgotIdentifier.trim())
      setForgotDevCode(res.devOtp ?? '')
      setForgotOtp('')
      setForgotStep('reset')
      toast.success(tx('OTP পাঠানো হয়েছে — কোডটি দিন', 'OTP sent — enter the code'))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('error'))
    } finally {
      setForgotBusy(false)
    }
  }

  // ── Forgot password: step 2 — verify OTP + set the new password ──
  const submitForgotReset = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setFormError('')
    if (!/^\d{6}$/.test(forgotOtp)) {
      setFormError(tx('৬ ডিজিটের OTP দিন', 'Enter the 6-digit OTP'))
      return
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setFormError(
        tx(
          'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে — অন্তত একটি অক্ষর ও একটি সংখ্যা সহ।',
          'Password must be at least 8 characters with at least one letter and one digit.'
        )
      )
      return
    }
    if (newPassword !== confirmPassword) {
      setFormError(tx('দুটি পাসওয়ার্ড মিলছে না', 'Passwords do not match'))
      return
    }
    setForgotBusy(true)
    try {
      await apiPost('/api/auth/forgot-password', {
        identifier: forgotIdentifier,
        code: forgotOtp,
        newPassword,
      })
      toast.success(
        tx(
          'পাসওয়ার্ড রিসেট হয়েছে — এখন নতুন পাসওয়ার্ড দিয়ে লগইন করুন',
          'Password reset — now log in with your new password'
        )
      )
      // Back to the password login with the identifier prefilled
      setIdentifier(forgotIdentifier)
      setPassword('')
      setLoginVariant('password')
      setNewPassword('')
      setConfirmPassword('')
      setForgotOtp('')
      setForgotDevCode('')
      setForgotStep('')
      setFormError('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('error'))
    } finally {
      setForgotBusy(false)
    }
  }

  const openForgot = () => {
    setFormError('')
    setLoginVariant('password')
    setForgotIdentifier(identifier.trim())
    setNewPassword('')
    setConfirmPassword('')
    setForgotOtp('')
    setForgotDevCode('')
    setForgotStep('request')
  }

  const closeForgot = () => {
    setForgotStep('')
    setFormError('')
    setForgotBusy(false)
  }

  const fillDemo = (acc: (typeof DEMO_ACCOUNTS)[number]) => {
    setIdentifier(acc.identifier)
    setPassword(acc.password)
    setFormError('')
  }

  return (
    <div className="hero-mesh relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      {/* dotted texture as an overlay so it doesn't override the hero-mesh gradient */}
      <div aria-hidden className="hero-dots pointer-events-none absolute inset-0" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative w-full max-w-md"
      >
        <div className="relative overflow-hidden rounded-3xl border bg-card p-6 shadow-lg sm:p-8">
          <span aria-hidden className="rainbow-bar absolute inset-x-0 top-0 z-10 h-1" />
          {/* Logo (admin-uploaded login logo, falls back to brand mark) */}
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            {loginLogo ? (
              <img
                src={loginLogo}
                alt="PathShala"
                className="w-auto max-w-[240px] object-contain"
                style={{ height: `${loginLogoPx}px` }}
              />
            ) : (
              <span className="grad-brand flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-md shadow-emerald-500/30">
                <GraduationCap className="h-6 w-6" aria-hidden />
              </span>
            )}
            <h1 className="text-xl font-extrabold tracking-tight">
              {forgotStep !== ''
                ? t('forgot_password')
                : mode === 'login'
                  ? t('login_title')
                  : t('register_title')}
            </h1>
            <p className="text-xs text-muted-foreground">{t('brandTag')}</p>
          </div>

          {otpStep ? (
            /* ══ OTP STEP ══ */
            <div className="space-y-5">
              <div className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm">
                <ShieldQuestion className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 break-all">
                  <span className="block font-semibold">{t('otp_verify')}</span>
                  <span className="text-muted-foreground">
                    {t('otp_sent')} — <span className="font-medium">{otpIdentifier}</span>
                  </span>
                </span>
              </div>

              {otpDevCode && (
                <Alert className="border-dashed border-amber-500/40 bg-amber-500/15 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  <KeyRound className="h-4 w-4" aria-hidden />
                  <AlertTitle>{tx('ডেমো মোড', 'Demo mode')}</AlertTitle>
                  <AlertDescription>
                    {tx('ডেমো মোড: OTP = ', 'Demo mode: OTP = ')}
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono font-bold text-amber-700 dark:text-amber-300">{otpDevCode}</span>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col items-center gap-3">
                <Label htmlFor="otp-input">{t('otp_code')}</Label>
                <InputOTP
                  id="otp-input"
                  maxLength={6}
                  value={otpCode}
                  onChange={setOtpCode}
                  aria-label={t('otp_code')}
                  disabled={verifying}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
                {verifying && (
                  <p className="inline-flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {t('loading')}
                  </p>
                )}
              </div>

              {formError && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {formError}
                </p>
              )}

              <div className="flex flex-col gap-2">
                <Button onClick={() => verifyOtp(otpCode)} disabled={verifying || otpCode.length < 6}>
                  {verifying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {t('verify')}
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <Button variant="ghost" size="sm" onClick={() => setOtpStep(false)} disabled={verifying}>
                    ← {t('cancel')}
                  </Button>
                  <Button variant="link" size="sm" onClick={resendOtp} disabled={resending}>
                    {resending ? t('loading') : tx('আবার পাঠান', 'Resend OTP')}
                  </Button>
                </div>
              </div>
            </div>
          ) : forgotStep !== '' ? (
            /* ══ FORGOT PASSWORD (OTP-verified reset) ══ */
            forgotStep === 'request' ? (
              <div className="space-y-5">
                <div className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm">
                  <KeyRound className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {tx('পাসওয়ার্ড রিসেট করুন', 'Reset your password')}
                    </span>
                    <span className="text-muted-foreground">
                      {tx(
                        'অ্যাকাউন্টের রেজিস্টার্ড ইমেইল/মোবাইল নম্বর দিন — ভেরিফিকেশনের জন্য ৬ ডিজিটের OTP পাঠানো হবে।',
                        'Enter the email/phone registered with your account — we will send a 6-digit verification OTP.'
                      )}
                    </span>
                  </span>
                </div>
                <form onSubmit={submitForgotRequest} className="space-y-4" noValidate>
                  {formError && (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                      {formError}
                    </p>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-identifier">{t('email_or_phone')}</Label>
                    <Input
                      id="forgot-identifier"
                      value={forgotIdentifier}
                      onChange={(e) => setForgotIdentifier(e.target.value)}
                      autoComplete="username"
                      placeholder="01XXXXXXXXX / you@example.com"
                    />
                  </div>
                  <Button type="submit" size="lg" className="w-full" disabled={forgotBusy}>
                    {forgotBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
                    {tx('OTP পাঠান', 'Send OTP')}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="w-full" onClick={closeForgot} disabled={forgotBusy}>
                    ← {t('cancel')}
                  </Button>
                </form>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm">
                  <ShieldQuestion className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 break-all">
                    <span className="block font-semibold">
                      {tx('OTP যাচাই ও নতুন পাসওয়ার্ড', 'Verify OTP & set new password')}
                    </span>
                    <span className="text-muted-foreground">
                      {t('otp_sent')} — <span className="font-medium">{forgotIdentifier}</span>
                    </span>
                  </span>
                </div>

                {forgotDevCode && (
                  <Alert className="border-dashed border-amber-500/40 bg-amber-500/15 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                    <KeyRound className="h-4 w-4" aria-hidden />
                    <AlertTitle>{tx('ডেমো মোড', 'Demo mode')}</AlertTitle>
                    <AlertDescription>
                      {tx('ডেমো মোড: OTP = ', 'Demo mode: OTP = ')}
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono font-bold text-amber-700 dark:text-amber-300">{forgotDevCode}</span>
                    </AlertDescription>
                  </Alert>
                )}

                <form onSubmit={submitForgotReset} className="space-y-4" noValidate>
                  {formError && (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                      {formError}
                    </p>
                  )}
                  <div className="flex flex-col items-center gap-2">
                    <Label htmlFor="forgot-otp">{t('otp_code')}</Label>
                    <InputOTP
                      id="forgot-otp"
                      maxLength={6}
                      value={forgotOtp}
                      onChange={setForgotOtp}
                      aria-label={t('otp_code')}
                      disabled={forgotBusy}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                      </InputOTPGroup>
                      <InputOTPSeparator />
                      <InputOTPGroup>
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-new-password">{tx('নতুন পাসওয়ার্ড', 'New password')}</Label>
                    <div className="relative">
                      <Input
                        id="forgot-new-password"
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                        className="pr-10"
                        placeholder={tx('কমপক্ষে ৮ অক্ষর — অক্ষর + সংখ্যা', 'At least 8 chars — letters + numbers')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        aria-label={showNewPassword ? tx('পাসওয়ার্ড লুকান', 'Hide password') : tx('পাসওয়ার্ড দেখান', 'Show password')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-confirm-password">{tx('নতুন পাসওয়ার্ড আবার দিন', 'Confirm new password')}</Label>
                    <Input
                      id="forgot-confirm-password"
                      type={showNewPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="••••••••"
                    />
                  </div>
                  <Button type="submit" size="lg" className="w-full" disabled={forgotBusy}>
                    {forgotBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
                    {tx('পাসওয়ার্ড রিসেট করুন', 'Reset password')}
                  </Button>
                  <div className="flex items-center justify-between text-sm">
                    <Button type="button" variant="ghost" size="sm" onClick={closeForgot} disabled={forgotBusy}>
                      ← {t('cancel')}
                    </Button>
                    <Button type="button" variant="link" size="sm" onClick={submitForgotRequest} disabled={forgotBusy}>
                      {forgotBusy ? t('loading') : tx('আবার পাঠান', 'Resend OTP')}
                    </Button>
                  </div>
                </form>
              </div>
            )
          ) : (
            /* ══ LOGIN / REGISTER TABS + FORMS ══ */
            <>
              <Tabs value={mode} onValueChange={switchMode} className="mb-5">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">{t('login')}</TabsTrigger>
                  <TabsTrigger value="register">{t('register')}</TabsTrigger>
                </TabsList>
              </Tabs>

              {formError && (
                <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {formError}
                </p>
              )}

              {mode === 'login' && (loginVariant === 'password' || !otpLoginOn) ? (
                <form onSubmit={submitLogin} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-identifier">{t('email_or_phone')}</Label>
                    <Input
                      id="login-identifier"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      autoComplete="username"
                      placeholder="you@example.com / 01XXXXXXXXX"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password">{t('password')}</Label>
                      <button
                        type="button"
                        onClick={openForgot}
                        className="text-xs font-medium text-primary underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      >
                        {t('forgot_password')}
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        className="pr-10"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? tx('পাসওয়ার্ড লুকান', 'Hide password') : tx('পাসওয়ার্ড দেখান', 'Show password')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" size="lg" className="w-full" disabled={busy}>
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <LogIn className="h-4 w-4" aria-hidden />
                    )}
                    {t('login')}
                  </Button>
                  {/* Passwordless OTP login (SMS/email OTP)
                      the admin can hide this whole option from Settings */}
                  {otpLoginOn && (
                    <>
                      <div className="flex items-center gap-3" aria-hidden>
                        <span className="h-px flex-1 bg-border" />
                        <span className="text-xs text-muted-foreground">{tx('অথবা', 'OR')}</span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        className="w-full gap-2"
                        onClick={() => {
                          setLoginVariant('otp')
                          setFormError('')
                        }}
                      >
                        <Smartphone className="h-4 w-4" aria-hidden />
                        {tx('OTP দিয়ে লগইন করুন', 'Log in with OTP')}
                      </Button>
                    </>
                  )}
                  <p className="text-center text-sm text-muted-foreground">
                    {t('no_account')}{' '}
                    <Link href="/register" className="font-semibold text-primary hover:underline">
                      {t('register')}
                    </Link>
                  </p>
                </form>
              ) : mode === 'login' && loginVariant === 'otp' && otpLoginOn ? (
                /* ══ PASSWORDLESS OTP LOGIN ══ */
                <form onSubmit={requestOtpLogin} className="space-y-4" noValidate>
                  <p className="rounded-xl bg-muted/60 px-3.5 py-3 text-sm text-muted-foreground">
                    {tx(
                      'রেজিস্টার্ড মোবাইল নম্বর/ইমেইল দিন — ৬ ডিজিটের OTP পাঠানো হবে।',
                      'Enter your registered phone/email — we will send a 6-digit OTP.'
                    )}
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="otp-login-identifier">{t('email_or_phone')}</Label>
                    <Input
                      id="otp-login-identifier"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      autoComplete="username"
                      inputMode="text"
                      placeholder="01XXXXXXXXX / you@example.com"
                    />
                  </div>
                  <Button type="submit" size="lg" className="w-full" disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LogIn className="h-4 w-4" aria-hidden />}
                    {tx('OTP পাঠান', 'Send OTP')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setLoginVariant('password')
                      setFormError('')
                    }}
                  >
                    ← {tx('পাসওয়ার্ড দিয়ে লগইন', 'Log in with password')}
                  </Button>
                </form>
              ) : mode === 'register' && regVariant === 'otp' && otpRegisterOn ? (
                /* ══ PHONE-OTP REGISTRATION (passwordless) ══ */
                <form onSubmit={submitRegisterOtp} className="space-y-4" noValidate>
                  <p className="rounded-xl bg-muted/60 px-3.5 py-3 text-sm text-muted-foreground">
                    {tx(
                      'শুধু মোবাইল নম্বর দিন — ৬ ডিজিটের OTP দিয়ে ভেরিফাই করে অ্যাকাউন্ট খুলবে। পাসওয়ার্ড লাগবে না।',
                      'Just your mobile number — verify with a 6-digit OTP to open your account. No password needed.'
                    )}
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-otp-name">{t('name')} *</Label>
                    <Input
                      id="reg-otp-name"
                      value={regOtpName}
                      onChange={(e) => setRegOtpName(e.target.value)}
                      autoComplete="name"
                      placeholder={tx('আপনার পুরো নাম', 'Your full name')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-otp-phone">{t('phone')} *</Label>
                    <Input
                      id="reg-otp-phone"
                      type="tel"
                      value={regOtpPhone}
                      onChange={(e) => setRegOtpPhone(e.target.value)}
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder="01XXXXXXXXX"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-otp-email">{t('email')}</Label>
                    <Input
                      id="reg-otp-email"
                      type="email"
                      value={regOtpEmail}
                      onChange={(e) => setRegOtpEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-otp-class">
                      {tx('আপনি কোন শ্রেণি/বর্ষে পড়ছেন?', 'Which class/year are you studying in?')} <span className="text-destructive">*</span>
                    </Label>
                    <Select value={regOtpClass || undefined} onValueChange={(v) => setRegOtpClass(v as ClassKey)}>
                      <SelectTrigger id="reg-otp-class" aria-label={tx('শ্রেণি নির্বাচন', 'Select class')} className="w-full">
                        <SelectValue placeholder={tx('শ্রেণি/বর্ষ নির্বাচন করুন', 'Select your class / year')} />
                      </SelectTrigger>
                      <SelectContent>
                        {CLASS_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {tx(c.bn, c.en)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" size="lg" className="w-full gap-2" disabled={busy}>
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Smartphone className="h-4 w-4" aria-hidden />
                    )}
                    {tx('OTP পাঠান', 'Send OTP')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setRegVariant('form')
                      setFormError('')
                    }}
                  >
                    ← {tx('সাধারণ রেজিস্ট্রেশন', 'Standard registration')}
                  </Button>
                </form>
              ) : (
                <form onSubmit={submitRegister} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-name">{t('name')} *</Label>
                    <Input
                      id="reg-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      placeholder={tx('আপনার পুরো নাম', 'Your full name')}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-email">{t('email')}</Label>
                      <Input
                        id="reg-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        placeholder="you@example.com"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-phone">{t('phone')}</Label>
                      <Input
                        id="reg-phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        autoComplete="tel"
                        placeholder="01XXXXXXXXX"
                      />
                    </div>
                  </div>
                  <p className="-mt-2 text-xs text-muted-foreground">
                    {tx('* ইমেইল অথবা ফোন — যেকোনো একটি আবশ্যক। ফোনে +880/880 ফরম্যাটও চলবে।', '* Email or phone — at least one is required. +880/880 phone formats also work.')}
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-class">
                      {tx('আপনি কোন শ্রেণি/বর্ষে পড়ছেন?', 'Which class/year are you studying in?')} <span className="text-destructive">*</span>
                    </Label>
                    <Select value={studentClass || undefined} onValueChange={(v) => setStudentClass(v as ClassKey)}>
                      <SelectTrigger id="reg-class" aria-label={tx('শ্রেণি নির্বাচন', 'Select class')} className="w-full">
                        <SelectValue placeholder={tx('শ্রেণি/বর্ষ নির্বাচন করুন', 'Select your class / year')} />
                      </SelectTrigger>
                      <SelectContent>
                        {CLASS_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {tx(c.bn, c.en)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-password">{t('password')} *</Label>
                    <div className="relative">
                      <Input
                        id="reg-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        className="pr-10"
                        placeholder={tx('কমপক্ষে ৮ অক্ষর — অক্ষর + সংখ্যা', 'At least 8 chars — letters + numbers')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? tx('পাসওয়ার্ড লুকান', 'Hide password') : tx('পাসওয়ার্ড দেখান', 'Show password')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" size="lg" className="w-full" disabled={busy}>
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <UserPlus className="h-4 w-4" aria-hidden />
                    )}
                    {t('register')}
                  </Button>
                  {/* Passwordless phone-OTP registration the
                      admin can enable/disable this option from Settings */}
                  {otpRegisterOn && (
                    <>
                      <div className="flex items-center gap-3" aria-hidden>
                        <span className="h-px flex-1 bg-border" />
                        <span className="text-xs text-muted-foreground">{tx('অথবা', 'OR')}</span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        className="w-full gap-2"
                        onClick={() => {
                          setRegVariant('otp')
                          setFormError('')
                        }}
                      >
                        <Smartphone className="h-4 w-4" aria-hidden />
                        {tx('ফোন OTP দিয়ে অ্যাকাউন্ট খুলুন', 'Create account with phone OTP')}
                      </Button>
                    </>
                  )}
                  <p className="text-center text-sm text-muted-foreground">
                    {t('have_account')}{' '}
                    <Link href="/login" className="font-semibold text-primary hover:underline">
                      {t('login')}
                    </Link>
                  </p>
                </form>
              )}
            </>
          )}
        </div>

        {/* Demo credentials hint */}
        {mode === 'login' && !otpStep && forgotStep === '' && (
          <div className="mt-4 rounded-2xl border border-dashed bg-muted/50 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                DEMO
              </Badge>
              {tx('ডেমো একাউন্ট — এক ক্লিকে পূরণ করুন', 'Demo accounts — one-click fill')}
            </p>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.identifier}
                  type="button"
                  onClick={() => fillDemo(acc)}
                  className="rounded-xl border bg-card px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${tx('পূরণ করুন', 'Fill')} ${acc.label}`}
                >
                  <span className="block text-xs font-semibold">{acc.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {acc.identifier} / {acc.password}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}

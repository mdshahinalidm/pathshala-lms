'use client'

/**
 * SpaRoot — the hash-routed application root (moved verbatim from
 * src/app/page.tsx). It renders every area (public / dashboard / admin)
 * based on the hash route.
 *
 * It now accepts two server-loaded props for the home view:
 *  • initialHeroVariant — the admin-selected home hero ('classic' |
 *    'circular'), read from the DB by the server page so the FIRST paint
 *    already shows the chosen hero — the other variant never flashes.
 *  • curatedTestimonials — active admin-curated testimonials.
 */

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { GraduationCap, ShieldX } from 'lucide-react'
import { useHashRoute } from '@/hooks/use-hash-route'
import { useAuth } from '@/store/auth-store'
import { useUI, go } from '@/store/ui-store'
import { PublicShell } from '@/components/layout/public-shell'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { AdminShell } from '@/components/layout/admin-shell'
import { Button } from '@/components/ui/button'
import HomeView from '@/components/views/home-view'
import type { HeroSlide } from '@/components/views/heroes/coverflow-hero'
import CatalogView from '@/components/views/catalog-view'
import CourseDetailView from '@/components/views/course-detail-view'
import AboutView from '@/components/views/about-view'
import ContactView from '@/components/views/contact-view'
import SuggestionsView from '@/components/views/suggestions-view'
import NoticesView from '@/components/views/notices-view'
import AuthView from '@/components/views/auth-view'
import NotFoundView from '@/components/views/not-found-view'
import MyCoursesView from '@/components/views/dashboard/my-courses-view'
import ClassroomView from '@/components/views/dashboard/classroom-view'
import ExamsView from '@/components/views/dashboard/exams-view'
import ExamRunnerView from '@/components/views/dashboard/exam-runner-view'
import NotificationsView from '@/components/views/dashboard/notifications-view'
import ProfileView from '@/components/views/dashboard/profile-view'
import AnalyticsView from '@/components/views/admin/analytics-view'
import AdminCoursesView from '@/components/views/admin/courses-view'
import AdminSuggestionsView from '@/components/views/admin/suggestions-view'
import AdminQuizzesView from '@/components/views/admin/quizzes-view'
import AdminNoticesView from '@/components/views/admin/notices-view'
import AdminUsersView from '@/components/views/admin/users-view'
import AdminOrdersView from '@/components/views/admin/orders-view'
import AdminCategoriesView from '@/components/views/admin/categories-view'
import AdminReviewsView from '@/components/views/admin/reviews-view'
import AdminMessagesView from '@/components/views/admin/messages-view'
import AdminBroadcastView from '@/components/views/admin/broadcast-view'
import AdminSettingsView from '@/components/views/admin/settings-view'

function FullScreenLoader() {
  const { t } = useUI()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground"
      >
        <GraduationCap className="h-7 w-7" />
      </motion.span>
      <p className="text-sm text-muted-foreground">{t('loading')}</p>
    </div>
  )
}

function AccessDenied({ isAdminRoute }: { isAdminRoute: boolean }) {
  const { tx } = useUI()
  return (
    <PublicShell>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldX className="h-8 w-8" />
        </span>
        <h1 className="text-2xl font-bold">
          {isAdminRoute ? tx('অ্যাডমিন অ্যাক্সেস প্রয়োজন', 'Admin access required') : tx('লগইন প্রয়োজন', 'Login required')}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {tx(
            'এই পেজটি দেখতে আপনার সংশ্লিষ্ট অনুমতি নেই। অনুগ্রহ করে সঠিক একাউন্ট দিয়ে লগইন করুন।',
            'You do not have permission to view this page. Please log in with the appropriate account.'
          )}
        </p>
        <Button onClick={() => go('#/login')}>{tx('লগইন করুন', 'Go to Login')}</Button>
      </div>
    </PublicShell>
  )
}

function Animated({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <motion.div
      key={k}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

export default function SpaRoot({
  initialHeroVariant = 'classic',
  curatedTestimonials = [],
  initialStats,
  initialHeroSlides,
}: {
  /** heroVariant from the DB (server-read) → correct hero on FIRST paint. */
  initialHeroVariant?: string
  /** Active admin-curated testimonials (server-read). */
  curatedTestimonials?: {
    id: string
    name: string
    role: string
    roleEn: string
    comment: string
    photoUrl: string | null
    rating: number
  }[]
  /** Public counters (server-read, admin-overridable) → true numbers on the stat strips. */
  initialStats?: {
    students: number | null
    hours: number | null
    courses: number
    reviews: number
  }
  /** Coverflow hero slides (server-read) → center image preloads, LCP not blocked by the client fetch. */
  initialHeroSlides?: HeroSlide[]
}) {
  const route = useHashRoute()
  const { user, status, initialized } = useAuth()
  const seg = route.segments

  // Route classification
  const area: 'public' | 'dashboard' | 'admin' =
    seg[0] === 'dashboard' ? 'dashboard' : seg[0] === 'admin' ? 'admin' : 'public'

  const needsAuth = area !== 'public'
  const authPending = needsAuth && (!initialized || status === 'loading')

  // Redirect unauthenticated users to login (preserving destination)
  useEffect(() => {
    if (initialized && status === 'unauthenticated' && needsAuth) {
      go(`#/login?next=${encodeURIComponent(route.path)}`)
    }
  }, [initialized, status, needsAuth, route.path])

  // ── Auth-gated areas ──
  if (authPending) return <FullScreenLoader />
  if (needsAuth && status === 'unauthenticated') return <FullScreenLoader />
  if (area === 'admin' && user && user.role !== 'ADMIN') return <AccessDenied isAdminRoute />

  // ── Route table ──
  let content: React.ReactNode

  if (area === 'dashboard') {
    let view: React.ReactNode
    if (seg[1] === 'classroom' && seg[2]) view = <ClassroomView courseId={seg[2]} />
    else if (seg[1] === 'exams') view = <ExamsView />
    else if (seg[1] === 'exam' && seg[2]) view = <ExamRunnerView quizId={seg[2]} />
    else if (seg[1] === 'notifications') view = <NotificationsView />
    else if (seg[1] === 'profile') view = <ProfileView />
    else view = <MyCoursesView />
    content = <DashboardShell><Animated k={route.path}>{view}</Animated></DashboardShell>
  } else if (area === 'admin') {
    let view: React.ReactNode
    if (seg[1] === 'courses') view = <AdminCoursesView />
    else if (seg[1] === 'suggestions') view = <AdminSuggestionsView />
    else if (seg[1] === 'quizzes') view = <AdminQuizzesView />
    else if (seg[1] === 'notices') view = <AdminNoticesView />
    else if (seg[1] === 'users') view = <AdminUsersView />
    else if (seg[1] === 'orders') view = <AdminOrdersView />
    else if (seg[1] === 'categories') view = <AdminCategoriesView />
    else if (seg[1] === 'reviews') view = <AdminReviewsView />
    else if (seg[1] === 'messages') view = <AdminMessagesView />
    else if (seg[1] === 'broadcast') view = <AdminBroadcastView />
    else if (seg[1] === 'settings') view = <AdminSettingsView />
    else view = <AnalyticsView />
    content = <AdminShell><Animated k={route.path}>{view}</Animated></AdminShell>
  } else {
    // Public area
    let view: React.ReactNode
    if (seg[0] === 'courses' && seg[1]) view = <CourseDetailView courseId={seg[1]} />
    else if (seg[0] === 'courses') view = <CatalogView />
    else if (seg[0] === 'about') view = <AboutView initialStats={initialStats} />
    else if (seg[0] === 'contact') view = <ContactView />
    else if (seg[0] === 'suggestions') view = <SuggestionsView />
    else if (seg[0] === 'notices') view = <NoticesView />
    else if (seg[0] === 'login' || seg[0] === 'register') view = <AuthView />
    else if (seg.length === 0)
      view = (
        <HomeView
          initialHeroVariant={initialHeroVariant}
          curatedTestimonials={curatedTestimonials}
          initialStats={initialStats}
          initialHeroSlides={initialHeroSlides}
        />
      )
    else view = <NotFoundView />
    content = <PublicShell><Animated k={route.path}>{view}</Animated></PublicShell>
  }

  return <div className="min-h-screen">{content}</div>
}

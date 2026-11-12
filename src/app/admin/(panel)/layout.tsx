import { Suspense } from 'react'
import { AdminShell } from '@/components/layout/admin-shell'
import { RequireAdmin } from '@/components/auth-guards'

/**
 * Layout for every /admin/* PANEL page (dashboard, courses, exams, ...).
 * NOTE: /admin itself (the login gate) lives OUTSIDE this group so the
 * dedicated admin login screen renders without the shell chrome.
 */
export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdmin>
      {/* AdminShell reads the URL for active states → Suspense boundary */}
      <Suspense fallback={null}>
        <AdminShell>{children}</AdminShell>
      </Suspense>
    </RequireAdmin>
  )
}

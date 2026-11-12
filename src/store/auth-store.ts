'use client'

import { create } from 'zustand'
import { go } from '@/store/ui-store'
import { apiGet } from '@/lib/api-client'

export interface SessionUser {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: 'STUDENT' | 'ADMIN' | 'MANAGER'
  isVerified: boolean
  avatarUrl?: string | null
  studentClass?: string | null
  institution?: string | null
}

interface AuthState {
  user: SessionUser | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
  initialized: boolean
  fetchMe: () => Promise<SessionUser | null>
  setUser: (u: SessionUser | null) => void
  logout: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  initialized: false,

  fetchMe: async () => {
    try {
      // apiGet = timeout + auto-retry: a 404/compile race right after a dev
      // server restart can no longer log a signed-in user out visually.
      const data = await apiGet<{ user?: SessionUser | null }>('/api/auth/me')
      if (data?.user) {
        set({ user: data.user, status: 'authenticated', initialized: true })
        return data.user as SessionUser
      }
    } catch {
      /* network error → unauthenticated */
    }
    set({ user: null, status: 'unauthenticated', initialized: true })
    return null
  },

  setUser: (u) =>
    set({ user: u, status: u ? 'authenticated' : 'unauthenticated', initialized: true }),

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      /* ignore */
    }
    set({ user: null, status: 'unauthenticated' })
    // Logging out from the admin panel returns to the admin login gate.
    const onAdmin = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
    go(onAdmin ? '/admin' : '#/')
  },
}))

/** Redirect helpers used by views */
export function requireLoginRedirect(hashAfter?: string) {
  go(hashAfter ? `#/login?next=${encodeURIComponent(hashAfter)}` : '#/login')
}

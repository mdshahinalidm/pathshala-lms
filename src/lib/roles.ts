/**
 * Panel role helpers — ADMIN (owner) vs MANAGER (site manager) vs MODERATOR.
 *
 * Hierarchy (all staff accounts are created ONLY by the owner from
 * Admin → Admin Control; nobody can self-promote on this site):
 *   ADMIN     — full control (owner): users, settings, gateways, coupons…
 *   MANAGER   — content + moderation: courses/quizzes/notices/suggestions/
 *               broadcasts + orders/students/messages/reviews, but NOT
 *               owner-only surfaces (requireOwner blocks server-side).
 *   MODERATOR — moderation only: orders/students/purchases/messages/reviews
 *               surfaces; content mutation APIs reject them (requireManager).
 */
export type PanelRole = 'ADMIN' | 'MANAGER' | 'MODERATOR'

export function isPanelRole(role: string | null | undefined): role is PanelRole {
  return role === 'ADMIN' || role === 'MANAGER' || role === 'MODERATOR'
}

/** Content-management roles (courses, quizzes, notices, suggestions…). */
export function isManagerRole(role: string | null | undefined): boolean {
  return role === 'ADMIN' || role === 'MANAGER'
}

export function isOwner(role: string | null | undefined): boolean {
  return role === 'ADMIN'
}

/** Bilingual role label for badges. */
export function roleLabel(role: string | null | undefined, lang: 'bn' | 'en'): string {
  if (role === 'ADMIN') return lang === 'bn' ? 'অ্যাডমিন' : 'Admin'
  if (role === 'MANAGER') return lang === 'bn' ? 'ম্যানেজার' : 'Manager'
  if (role === 'MODERATOR') return lang === 'bn' ? 'মডারেটর' : 'Moderator'
  return lang === 'bn' ? 'শিক্ষার্থী' : 'Student'
}

/**
 * Exam session helpers (server-only) — written-exam engine.
 *
 * The SERVER owns the exam clock: attempt.startedAt anchors the countdown,
 * endsAt = startedAt + quiz.durationMin. Late submissions inside a small
 * grace window still land (network delays), after that the attempt is
 * auto-finalized server-side. Answer-sheet images persist under
 * public/uploads/exam-scripts/<yyyy-mm>/ with NO size limit — phone photos
 * come in every shape and size (explicit user requirement).
 */
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import type { Quiz, QuizSubject } from '@prisma/client'

/** Seconds after endsAt during which a late submit is still accepted. */
export const EXAM_SUBMIT_GRACE_SEC = 90

/** Absolute end time of an attempt (startedAt + duration). */
export function attemptEndsAt(startedAt: Date, durationMin: number): Date {
  return new Date(startedAt.getTime() + Math.max(1, durationMin) * 60_000)
}

/**
 * Effective countdown length for an attempt: honours subject attempts use
 * the subject's own duration; everything else falls back to the quiz's.
 */
export function effectiveDurationMin(
  quiz: Pick<Quiz, 'durationMin'>,
  subject?: Pick<QuizSubject, 'durationMin'> | null
): number {
  return subject?.durationMin ?? quiz.durationMin
}

/** Persist one answer-sheet image; returns its public URL. Images only, size UNLIMITED. */
export async function saveSheetImage(file: File): Promise<string> {
  const mime = (file.type || 'image/jpeg').toLowerCase()
  const ext =
    mime === 'image/png' ? '.png'
    : mime === 'image/webp' ? '.webp'
    : mime === 'image/gif' ? '.gif'
    : mime === 'image/heic' ? '.heic'
    : mime === 'image/heif' ? '.heif'
    : '.jpg'
  const now = new Date()
  const folder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const dir = path.join(process.cwd(), 'public', 'uploads', 'exam-scripts', folder)
  await mkdir(dir, { recursive: true })
  const filename = `${randomBytes(10).toString('hex')}${ext}`
  const buf = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(dir, filename), buf)
  return `/uploads/exam-scripts/${folder}/${filename}`
}

export interface PenStroke {
  color: string
  width: number
  points: [number, number][] // normalized 0..1 coordinates
}

/**
 * Validate + normalize the admin's pen strokes (stored per sheet as JSON).
 * Anything malformed is dropped — the renderer never receives junk.
 */
export function sanitizeStrokes(raw: unknown): PenStroke[] {
  if (!Array.isArray(raw)) return []
  const strokes: PenStroke[] = []
  for (const item of raw.slice(0, 800)) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const color =
      typeof rec.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(rec.color) ? rec.color : '#ef4444'
    const width = Math.min(30, Math.max(1, Math.round(Number(rec.width) || 4)))
    const rawPts = Array.isArray(rec.points) ? rec.points : []
    const points: [number, number][] = []
    for (const p of rawPts.slice(0, 4000)) {
      if (!Array.isArray(p)) continue
      const x = Number(p[0])
      const y = Number(p[1])
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      const cx = Math.round(Math.min(1, Math.max(0, x)) * 10000) / 10000
      const cy = Math.round(Math.min(1, Math.max(0, y)) * 10000) / 10000
      points.push([cx, cy])
    }
    if (points.length >= 2) strokes.push({ color, width, points })
  }
  return strokes
}

export interface AttemptPhaseResult {
  phase: 'RUNNING' | 'SUBMITTED' | 'EXPIRED' | 'NONE'
  attemptId?: string
  startedAt?: string
  endsAt?: string
  submittedAt?: string
  serverNow: string
  durationMin: number
  sheets: { id: string; imageUrl: string; order: number }[]
}

/**
 * Resolve the student's current CQ attempt for a quiz, auto-finalizing
 * expired sessions (sheets uploaded → SUBMITTED at the deadline; empty →
 * EXPIRED so a fresh attempt can start). This keeps one source of truth for
 * both "start exam" and "resume attempt" endpoints.
 *
 * subjectId scopes honours attempts — null finds whole-exam attempts
 * only, so a batch subject never collides with another subject's session.
 */
export async function resolveAttemptPhase(
  quiz: Quiz,
  userId: string,
  subjectId: string | null = null
): Promise<AttemptPhaseResult> {
  const now = new Date()
  const base: AttemptPhaseResult = {
    phase: 'NONE',
    serverNow: now.toISOString(),
    durationMin: quiz.durationMin,
    sheets: [],
  }

  const last = await db.quizAttempt.findFirst({
    where: { quizId: quiz.id, userId, subjectId: subjectId ?? null },
    orderBy: { createdAt: 'desc' },
    include: { sheets: { orderBy: { order: 'asc' } }, subject: true },
  })

  if (!last) return base

  const durationMin = effectiveDurationMin(quiz, last.subject)
  base.durationMin = durationMin

  if (last.scriptStatus === 'SUBMITTED') {
    return {
      ...base,
      phase: 'SUBMITTED',
      attemptId: last.id,
      submittedAt: (last.submittedAt ?? last.createdAt).toISOString(),
      sheets: last.sheets.map((s) => ({ id: s.id, imageUrl: s.imageUrl, order: s.order })),
    }
  }

  if (last.scriptStatus === 'IN_PROGRESS' && last.startedAt) {
    const endsAt = attemptEndsAt(last.startedAt, durationMin)
    if (endsAt.getTime() + EXAM_SUBMIT_GRACE_SEC * 1000 > now.getTime()) {
      return {
        ...base,
        phase: 'RUNNING',
        attemptId: last.id,
        startedAt: last.startedAt.toISOString(),
        endsAt: endsAt.toISOString(),
        sheets: last.sheets.map((s) => ({ id: s.id, imageUrl: s.imageUrl, order: s.order })),
      }
    }
    // Clock ran out — settle the attempt once, server-side.
    if (last.sheets.length > 0) {
      await db.quizAttempt.update({
        where: { id: last.id },
        data: {
          scriptStatus: 'SUBMITTED',
          submittedAt: endsAt,
          scriptUrl: last.sheets[0]?.imageUrl ?? last.scriptUrl,
          scriptName: last.scriptName ?? 'answer-sheets',
        },
      })
      return {
        ...base,
        phase: 'SUBMITTED',
        attemptId: last.id,
        submittedAt: endsAt.toISOString(),
        sheets: last.sheets.map((s) => ({ id: s.id, imageUrl: s.imageUrl, order: s.order })),
      }
    }
    await db.quizAttempt.update({ where: { id: last.id }, data: { scriptStatus: 'EXPIRED' } })
  }

  // EXPIRED (or an IN_PROGRESS attempt just settled as expired) → start over.
  return base
}

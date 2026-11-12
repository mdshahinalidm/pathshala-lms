/**
 * /api/quizzes/[id]/submit — grade a quiz attempt (authenticated, rate-limited).
 *
 * POST { answers: Record<questionId, 0..3>, timeTaken: 0..7200 }
 * → { score, total, percentage, timeTaken, leaderboardRank, breakdown }
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  fail,
  requireAuth,
  isResponse,
  parseBody,
  rateLimit,
} from '@/lib/api-helpers'

const submitSchema = z.object({
  answers: z.record(z.string(), z.number().int().min(0).max(3)),
  timeTaken: z.number().int().min(0).max(7200),
})

/** Safely parse the stored JSON options array. */
function parseOptions(raw: string): string[] {
  try {
    const arr: unknown = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.map((o) => String(o))
  } catch {
    // fall through
  }
  return []
}

/** POST /api/quizzes/[id]/submit */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const limited = rateLimit(req, 'quiz-submit', 10, 60_000)
    if (limited) return limited

    const user = await requireAuth(req)
    if (isResponse(user)) return user

    const body = await parseBody(req, submitSchema)
    if (isResponse(body)) return body

    const quiz = await db.quiz.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' } } },
    })
    if (!quiz) return fail('Quiz not found', 404)
    if (!quiz.isPublished) return fail('This quiz is not accepting submissions', 400)
    if (quiz.questions.length === 0) return fail('This quiz has no questions yet', 400)

    // Grade.
    let score = 0
    const breakdown = quiz.questions.map((q) => {
      const answered = Object.prototype.hasOwnProperty.call(body.answers, q.id)
      const chosenIndex = answered ? body.answers[q.id] : null
      const isCorrect = chosenIndex !== null && chosenIndex === q.correctIndex
      if (isCorrect) score++
      return {
        questionId: q.id,
        text: q.text,
        options: parseOptions(q.options),
        correctIndex: q.correctIndex,
        chosenIndex,
        isCorrect,
      }
    })
    const total = quiz.questions.length
    const percentage = Math.round((score / total) * 100)

    // Persist attempt.
    await db.quizAttempt.create({
      data: {
        userId: user.id,
        quizId: id,
        score,
        total,
        answers: JSON.stringify(body.answers),
        timeTaken: body.timeTaken,
      },
    })

    // Rank: 1 + number of better attempts (higher score, or same score & faster).
    const better = await db.quizAttempt.count({
      where: {
        quizId: id,
        OR: [
          { score: { gt: score } },
          { AND: [{ score: score }, { timeTaken: { lt: body.timeTaken } }] },
        ],
      },
    })
    const leaderboardRank = better + 1

    return ok({
      score,
      total,
      percentage,
      timeTaken: body.timeTaken,
      leaderboardRank,
      breakdown,
    })
  } catch (err) {
    console.error('[POST /api/quizzes/[id]/submit]', err)
    return fail('Server error', 500)
  }
}

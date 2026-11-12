/**
 * /api/quizzes/[id]/leaderboard — top 10 attempts (public).
 * Ordered by score DESC, then timeTaken ASC (faster wins ties).
 */
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'

/** GET /api/quizzes/[id]/leaderboard */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const quiz = await db.quiz.findUnique({ where: { id }, select: { id: true } })
    if (!quiz) return fail('Quiz not found', 404)

    const attempts = await db.quizAttempt.findMany({
      where: { quizId: id },
      orderBy: [{ score: 'desc' }, { timeTaken: 'asc' }],
      take: 10,
      include: { user: { select: { name: true } } },
    })

    const leaderboard = attempts.map((a, i) => ({
      rank: i + 1,
      userName: a.user?.name || 'Anonymous',
      score: a.score,
      total: a.total,
      timeTaken: a.timeTaken,
      createdAt: a.createdAt,
    }))

    return ok(leaderboard)
  } catch (err) {
    console.error('[GET /api/quizzes/[id]/leaderboard]', err)
    return fail('Server error', 500)
  }
}

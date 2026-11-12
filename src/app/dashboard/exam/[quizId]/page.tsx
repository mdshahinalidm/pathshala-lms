import ExamRunnerView from '@/components/views/dashboard/exam-runner-view'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { AUTH_COOKIE, verifyToken } from '@/lib/auth-jwt'

export default async function ExamRunnerPage({
  params,
}: {
  params: Promise<{ quizId: string }>
}) {
  const { quizId } = await params

  // landing on a free MCQ exam's runner (e.g. via /exams click or
  // login?next=… redirect) adds it to the student's dashboard exam section.
  // Idempotent, EXAM-type quizzes only (course practice stays untouched).
  try {
    const token = (await cookies()).get(AUTH_COOKIE)?.value
    const payload = token ? await verifyToken(token) : null
    if (payload?.sub) {
      const quiz = await db.quiz.findUnique({
        where: { id: quizId },
        select: { id: true, type: true, isPublished: true },
      })
      if (quiz && quiz.type === 'EXAM' && quiz.isPublished) {
        await db.examEnrollment.upsert({
          where: { userId_quizId: { userId: payload.sub, quizId: quiz.id } },
          update: {},
          create: { userId: payload.sub, quizId: quiz.id, source: 'FREE_CLICK' },
        })
      }
    }
  } catch (err) {
    console.error('[ExamRunnerPage enroll]', err)
  }

  return <ExamRunnerView quizId={quizId} />
}

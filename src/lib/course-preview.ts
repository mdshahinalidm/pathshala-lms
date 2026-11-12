import { db } from '@/lib/db'

/**
 * ensureFirstVideoPreview — an LMS guarantee: EVERY course shows at least one
 * free preview on its public page. Called after saving chapters/lessons
 * (create + full update). If NO lesson in the course has isPreview=true, the
 * first VIDEO lesson (by chapter order → lesson order) is marked as preview.
 *
 * The admin's deliberate preview choices are always respected — this only
 * fills the "no previews at all" gap (admin-built courses used to save every
 * lesson locked, so the public page showed no preview badge anywhere).
 */
export async function ensureFirstVideoPreview(courseId: string): Promise<void> {
  const chapters = await db.chapter.findMany({
    where: { courseId },
    orderBy: { order: 'asc' },
    include: {
      lessons: { orderBy: { order: 'asc' }, select: { id: true, type: true, isPreview: true } },
    },
  })
  const hasAnyPreview = chapters.some((ch) => ch.lessons.some((l) => l.isPreview))
  if (hasAnyPreview) return
  const firstVideo = chapters.flatMap((ch) => ch.lessons).find((l) => l.type === 'VIDEO')
  if (!firstVideo) return
  await db.lesson.update({ where: { id: firstVideo.id }, data: { isPreview: true } })
}

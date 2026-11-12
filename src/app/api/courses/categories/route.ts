/**
 * GET /api/courses/categories — alias of /api/categories.
 * Static segment wins over the dynamic /api/courses/[id] route.
 */
export { GET } from '../../categories/route'

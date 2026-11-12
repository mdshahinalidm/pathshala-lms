/**
 * /api/admin/students/export — read-only export of the student list.
 *
 * GET ?format=csv|xls (default csv) · ?ids=<comma-separated user ids> (optional
 * subset — used by the Students page when rows are selected; without it every
 * STUDENT account is exported, no pagination).
 *
 * format=csv → text/csv with a UTF-8 BOM (\uFEFF) so Excel renders Bengali
 *              text correctly.
 * format=xls → Excel-compatible single-sheet HTML table
 *              (Content-Type application/vnd.ms-excel).
 *
 * Columns: name · email · phone · class (raw key) · class (readable bn/en
 * label) · institution · role · enrolled count · total spent (sum of the
 * student's SUCCESS orders + suggestion/exam/combo purchases) · joined date.
 *
 * STRICTLY read-only: findMany + groupBy only. Filename:
 * pathshala-students-YYYYMMDD.csv|xls via Content-Disposition.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fail, isResponse, requireAdmin } from '@/lib/api-helpers'
import { classLabel } from '@/lib/student-classes'

/** Export columns (kept in one place for both CSV and XLS). */
const HEADERS = [
  'Name',
  'Email',
  'Phone',
  'Class Key',
  'Class',
  'Institution',
  'Role',
  'Enrolled Courses',
  'Total Spent (BDT)',
  'Joined Date',
] as const

/** Readable bilingual class label: "নবম শ্রেণি / Class 9". */
function classCell(studentClass: string | null): string {
  const bn = classLabel(studentClass, 'bn')
  const en = classLabel(studentClass, 'en')
  return `${bn} / ${en}`
}

/** Escape a value for CSV (quotes doubled, always quoted). */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

/** Escape a value for the Excel-compatible HTML table. */
function htmlCell(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** YYYYMMDD stamp for the download filename (server-local date). */
function fileStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

/** GET /api/admin/students/export (panel: ADMIN + MANAGER + MODERATOR) */
export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (isResponse(admin)) return admin

    const url = new URL(req.url)
    const format = url.searchParams.get('format') === 'xls' ? 'xls' : 'csv'

    // Optional subset: ?ids=a,b,c (Students page multi-select).
    const idsParam = url.searchParams.get('ids') ?? ''
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const [students, orderSpent, suggestionSpent, examSpent, comboSpent] = await Promise.all([
      db.user.findMany({
        where: { role: 'STUDENT', ...(ids.length ? { id: { in: ids } } : {}) },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          studentClass: true,
          institution: true,
          createdAt: true,
          _count: { select: { enrollments: true } },
        },
      }),
      // Total spent = sum of each student's SUCCESS payments across all
      // paid product kinds (course orders + suggestions + exams + combos).
      db.order.groupBy({
        by: ['userId'],
        where: { status: 'SUCCESS', ...(ids.length ? { userId: { in: ids } } : {}) },
        _sum: { amount: true },
      }),
      db.suggestionPurchase.groupBy({
        by: ['userId'],
        where: { status: 'SUCCESS', ...(ids.length ? { userId: { in: ids } } : {}) },
        _sum: { amount: true },
      }),
      db.examPurchase.groupBy({
        by: ['userId'],
        where: { status: 'SUCCESS', ...(ids.length ? { userId: { in: ids } } : {}) },
        _sum: { amount: true },
      }),
      db.comboPurchase.groupBy({
        by: ['userId'],
        where: { status: 'SUCCESS', ...(ids.length ? { userId: { in: ids } } : {}) },
        _sum: { amount: true },
      }),
    ])

    const spentMap = new Map<string, number>()
    for (const group of [orderSpent, suggestionSpent, examSpent, comboSpent]) {
      for (const row of group) {
        spentMap.set(row.userId, (spentMap.get(row.userId) ?? 0) + (row._sum.amount ?? 0))
      }
    }

    // Materialized rows shared by both export formats.
    const rows = students.map((s) => [
      s.name ?? '',
      s.email ?? '',
      s.phone ?? '',
      s.studentClass ?? '',
      classCell(s.studentClass),
      s.institution ?? '',
      s.role,
      String(s._count.enrollments),
      String(Math.round(spentMap.get(s.id) ?? 0)),
      s.createdAt.toISOString().slice(0, 10), // YYYY-MM-DD
    ])

    const stamp = fileStamp()
    const filenameBase = `pathshala-students-${stamp}`

    if (format === 'csv') {
      const lines = [HEADERS.map(csvCell).join(',')]
      for (const row of rows) {
        lines.push(row.map(csvCell).join(','))
      }
      // UTF-8 BOM (\uFEFF) first so Excel detects the encoding and renders
      // Bengali characters correctly.
      const csv = '\uFEFF' + lines.join('\r\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    // format=xls — Excel-compatible HTML table (opens natively in Excel).
    const head = HEADERS.map(
      (h) =>
        `<th style="background:#10b981;color:#ffffff;border:1px solid #0d9488;padding:6px;">${htmlCell(h)}</th>`
    ).join('')
    const body = rows
      .map(
        (row) =>
          `<tr>${row
            .map((cell) => `<td style="border:1px solid #cccccc;padding:4px;">${htmlCell(cell)}</td>`)
            .join('')}</tr>`
      )
      .join('')
    const html =
      '\uFEFF<html><head><meta charset="utf-8" />' +
      `<title>${htmlCell(filenameBase)}</title></head><body>` +
      `<table border="1" cellspacing="0"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
      '</body></html>'

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameBase}.xls"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[GET /api/admin/students/export]', err)
    return fail('Server error', 500)
  }
}
